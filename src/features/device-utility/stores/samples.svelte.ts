import { generateSamplePack } from '~/lib/data/samplePack';
import { bluetoothManager } from './bluetooth.svelte';
import { mcumgr } from './mcumgr.svelte';
import { SampleManager } from '~/lib/mcumgr/SampleManager';
import { canonicalize } from '~/lib/utilities'
import { packDisplayName, packTypeFromId, makeUserPackId, type PackType } from '../utils/packs';
import { samplesParser_decode, type Page, type SamplePack } from '~/lib/parsers/samples_parser';

export const sampleManager = new SampleManager(mcumgr);

type Nullable<T> = T | null;

export interface PackMeta {
    id: string;
    type: PackType;
    source: 'website' | 'device_only' | 'user_local';
    sizePercent?: number;
    loops?: Page; // single pack page for preview
}

interface SampleState {
    // Supported means the device responded to sample queries
    isSupported: boolean;
    // Device reports that samples are set (if supported)
    isset: Nullable<boolean>;
    // Storage stats
    storageTotal: Nullable<number>;
    storageUsed: Nullable<number>;
    storagePacksUsed: Nullable<number[]>;
    // Names/IDs for each pack slot
    names: Nullable<(string | null)[]>;
    // Upload progress when uploading
    uploadPercentage: Nullable<number>;
    // New UI state
    selected: PackMeta[];
    available: PackMeta[];
    deviceSelected: PackMeta[];
    dirty: boolean;
    preview: { packId: string|null; bpm: number; isPlaying: boolean };
    userPacks: PackMeta[];
}

// Reactive state for the Sample Manager
export const sampleState = $state<SampleState>({
    isSupported: false,
    isset: null,
    storageTotal: null,
    storageUsed: null,
    storagePacksUsed: null,
    names: null,
    uploadPercentage: null,
    selected: [],
    available: [],
    deviceSelected: [],
    dirty: false,
    preview: { packId: null, bpm: 120, isPlaying: false },
    userPacks: [],
});

// Default DRM page IDs
export const DEFAULT_PAGE_IDS = [
    'W-MIXED', 'W-UNDRGND', 'W-OLLI', 'W-OG',
    null, null, null, null, null, null,
];

// Public API: Upload the default pack
export async function deviceSampleUploadDefault() {
    await deviceSamplesUpload(DEFAULT_PAGE_IDS);
}

// Public API: Upload specified pack IDs
export async function deviceSamplesUpload(selectedIds: string[]) {
    const samplePack = await generateSamplePack(selectedIds);
    sampleState.uploadPercentage = 0;
    await sampleManager.uploadSamples(samplePack, (percent) => (sampleState.uploadPercentage = Number(percent)));
    sampleState.uploadPercentage = null;
    await refreshDeviceSamples();
    // After upload, recompute deviceSelected and dirty
    await loadSelectedFromDevice();
}

// Public API: Compare a download with the default pack
export async function deviceSamplesDownloadMatchesDefault(): Promise<boolean> {
    const generated = await generateSamplePack(DEFAULT_PAGE_IDS);
    const downloaded = await sampleManager.downloadSamples();
    if (!generated || !downloaded) return false;
    const genCanonical = canonicalize(generated);
    const downCanonical = canonicalize(downloaded);
    return JSON.stringify(genCanonical) === JSON.stringify(downCanonical);
}

// Refresh device sample metadata (IDs and storage)
export async function refreshDeviceSamples() {
    try {
        const ids = await sampleManager.getIDs();
        sampleState.names = ids;
        const storage = await sampleManager.getSpaceUsed();
        sampleState.storageUsed = storage.usd;
        sampleState.storageTotal = storage.tot;
        sampleState.storagePacksUsed = storage.packs;
    } catch (_) {
        // Swallow errors here; support flag is handled in init checks
    }
}

// Internal: Ensure samples exist; upload default if not set
async function ensureSamplesOrUploadDefault() {
    try {
        const isset = await sampleManager.isSet();
        sampleState.isSupported = true;
        sampleState.isset = isset;
        if (!isset) {
            await deviceSampleUploadDefault();
            sampleState.isset = true;
        }
        return true;
    } catch (_) {
        // Unsupported or error
        sampleState.isSupported = false;
        sampleState.isset = null;
        sampleState.names = null;
        sampleState.storageUsed = null;
        sampleState.storageTotal = null;
        sampleState.storagePacksUsed = null;
        return false;
    }
}

// Wire to Bluetooth lifecycle
function initializeSampleLifecycle() {
    const onConnected = async () => {
        sampleState.isSupported = false;
        const ok = await ensureSamplesOrUploadDefault();
        if (ok) await refreshDeviceSamples();
        if (ok) await loadInitialData();
    };

    bluetoothManager.onConnect(onConnected);
    bluetoothManager.onConnectionReestablished(onConnected);
    // We intentionally do not reset on onDisconnect here because the app reloads.
}

// Initialize on module import
initializeSampleLifecycle();

// --------- Selection + Available management ---------

function toPackMeta(id: string, source: PackMeta['source'], sizePercent?: number, loops?: Page): PackMeta {
  return { id, type: packTypeFromId(id), source, sizePercent, loops };
}

function uniqById<T extends { id: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  return arr.filter(x => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

function computeDirty() {
  const top10 = sampleState.selected.slice(0,10).map(p => p.id);
  const dev10 = sampleState.deviceSelected.slice(0,10).map(p => p.id);
  sampleState.dirty = JSON.stringify(top10) !== JSON.stringify(dev10);
}

function normalizeWebsiteId(name: string): string {
  // record.json contains names without prefix; represent as W-<name> in UI
  return `W-${name}`;
}

async function loadWebsitePacks(): Promise<PackMeta[]> {
  try {
    const device_name = 'MONKEY';
    const url = `/samples/${device_name}/DRM/record.json?_=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    // Supported formats: ["MIXED", ...] OR { packs: [{id: "MIXED"}, ...] } OR { MIXED: "MIXED", ... }
    if (Array.isArray(data)) {
      return (data as string[]).map(name => toPackMeta(normalizeWebsiteId(name), 'website'));
    }
    if (Array.isArray((data as any)?.packs)) {
      return (data as any).packs.map((p: any) => toPackMeta(normalizeWebsiteId(p.id ?? p), 'website', p.sizePercent));
    }
    if (data && typeof data === 'object') {
      const names = Object.values(data as Record<string, string>);
      return names.map((name: string) => toPackMeta(normalizeWebsiteId(name), 'website'));
    }
  } catch (e) {}
  return [];
}

async function loadSelectedFromDevice() {
  const ids = sampleState.names || [];
  const metas: PackMeta[] = [];
  for (const id of ids) {
    if (!id) { metas.push(null as any); continue; }
    metas.push(toPackMeta(id, 'device_only'));
  }
  sampleState.deviceSelected = metas.filter(Boolean);
  // Initialize selected with device order if not already set
  if (sampleState.selected.length === 0) sampleState.selected = [...sampleState.deviceSelected];
  computeDirty();
}

function recomputeAvailable() {
  // Include all packs; disable cards in the view if selected
  const pool: PackMeta[] = uniqById([
    ...sampleState.userPacks,
    ...sampleState.available.filter(p=>p.source==='website'),
    ...sampleState.deviceSelected.filter(p=>p.source==='device_only')
  ]);
  sampleState.available = pool;
}

export async function loadInitialData() {
  const website = await loadWebsitePacks();
  // Keep any device-only and user packs that might not be in website
  sampleState.available = website;
  await loadSelectedFromDevice();
  loadUserPacks();
  recomputeAvailable();
}

export function addPackToSelected(id: string) {
  const found = sampleState.available.find(p => p.id === id) || sampleState.deviceSelected.find(p=>p.id===id) || sampleState.userPacks.find(p=>p.id===id);
  if (!found) return;
  if (sampleState.selected.find(p => p.id === id)) return; // already
  sampleState.selected = [...sampleState.selected, found];
  recomputeAvailable();
  computeDirty();
}

export function removeSelectedAt(index: number) {
  sampleState.selected = sampleState.selected.filter((_, i) => i !== index);
  recomputeAvailable();
  computeDirty();
}

export function moveSelected(index: number, dir: -1 | 1) {
  const arr = [...sampleState.selected];
  const j = index + dir;
  if (j < 0 || j >= arr.length) return;
  const tmp = arr[index]; arr[index] = arr[j]; arr[j] = tmp;
  sampleState.selected = arr;
  computeDirty();
}

export async function uploadSelected() {
  // Build sample pack from selected using website/device/user sources
  let ids = sampleState.selected.slice(0,10).map(p => p.id);
  while (ids.length < 10) ids.push(null as any);
  ids = rotateForDevice(ids as any);
  const pack = await buildSamplePackFromIds(ids as any);
  sampleState.uploadPercentage = 0;
  await sampleManager.uploadSamples(pack, (percent) => (sampleState.uploadPercentage = Number(percent)));
  sampleState.uploadPercentage = null;
  await refreshDeviceSamples();
  await loadSelectedFromDevice();
}

export function revertToDevice() {
  sampleState.selected = [...sampleState.deviceSelected];
  computeDirty();
}

function rotateForDevice(ids: (string|null)[]): (string|null)[] {
  if (ids.length !== 10) return ids;
  const last = ids[9];
  return [last, ...ids.slice(0,9)];
}

async function buildSamplePackFromIds(ids: (string|null)[]): Promise<SamplePack> {
  const pages: (Page|null)[] = [];
  for (const id of ids) {
    if (!id) { pages.push(null); continue; }
    const page = await fetchPackPage(id);
    if (page) {
      // Ensure page name is device-formatted (prefix + padded to 8 chars)
      const t = (id && (id[0] === 'W' || id[0] === 'P' || id[0] === 'U')) ? id[0] : 'W';
      const base = (id.startsWith('W-') || id.startsWith('P-') || id.startsWith('U-')) ? id.substring(2) : ((id && (id[0] === 'W' || id[0] === 'P' || id[0] === 'U')) ? id.substring(1).trimEnd() : id);
      page.name = `${t}${(base || '').slice(0,7).padEnd(7,' ')}`;
      pages.push(page);
    } else {
      pages.push(null);
    }
  }
  return {
    reserved0: 0xFFFFFFFF,
    reserved1: 0xFFFFFFFF,
    reserved2: 0xFFFFFFFF,
    reserved3: 0xFFFFFFFF,
    pages,
  } as SamplePack;
}

// --------- Preview (simple) ---------

export async function previewPack(id: string) {
  sampleState.preview.packId = id;
  // If loops missing, try website JSON, else from device download
  const existing = sampleState.selected.find(p=>p.id===id) || sampleState.available.find(p=>p.id===id) || sampleState.deviceSelected.find(p=>p.id===id) || sampleState.userPacks.find(p=>p.id===id);
  if (!existing) return;
  if (!existing.loops) {
    const page = await fetchPackPage(id);
    if (page) existing.loops = page;
  }
}

export function stopPreview() { sampleState.preview.isPlaying = false; }

async function fetchPackPage(id: string): Promise<Page|null> {
  // Try website first (prefer base name without type prefix or hyphen)
  const baseName = (id.startsWith('W-') || id.startsWith('P-') || id.startsWith('U-')) ? id.substring(2) : ((id && (id[0] === 'W' || id[0] === 'P' || id[0] === 'U')) ? id.substring(1).trimEnd() : id);
  try {
    const res1 = await fetch(`/samples/MONKEY/DRM/${baseName}.json`, { cache: 'no-store' });
    if (res1.ok) return await res1.json();
  } catch {}
  try {
    const res2 = await fetch(`/samples/MONKEY/DRM/${id}.json`, { cache: 'no-store' });
    if (res2.ok) return await res2.json();
  } catch {}
  // Fallback: device download and extract by name
  try {
    const pack = await sampleManager.downloadSamples();
    if (!pack) return null;
    const pages = (pack.pages || []);
    for (const page of pages) {
      if (page && page.name === id) return page as any;
    }
  } catch {}
  // Fallback: user local pack
  const up = sampleState.userPacks.find(p=>p.id===id);
  return up?.loops || null;
}

// --------- User packs (localStorage) ---------

const LS_KEY = 'wavy_user_packs';

function loadUserPacks() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) { sampleState.userPacks = []; return; }
    const arr = JSON.parse(raw) as Array<{ id: string; page: Page }>;
    sampleState.userPacks = arr.map(x => toPackMeta(x.id, 'user_local', undefined, x.page));
  } catch { sampleState.userPacks = []; }
}

function saveUserPacks() {
  try {
    const arr = sampleState.userPacks.map(x => ({ id: x.id, page: x.loops }));
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  } catch {}
}

export function createUserPack(userName7: string, page: Page) {
  const id = makeUserPackId(userName7);
  const meta = toPackMeta(id, 'user_local', undefined, page);
  // Replace if exists
  const idx = sampleState.userPacks.findIndex(p => p.id === id);
  if (idx >= 0) sampleState.userPacks[idx] = meta; else sampleState.userPacks.push(meta);
  saveUserPacks();
  recomputeAvailable();
}
