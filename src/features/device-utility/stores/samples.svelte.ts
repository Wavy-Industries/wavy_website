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
    author?: string;
    created?: string; // ISO string or human string
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
    contentDirty: boolean;
    editor: {
        open: boolean;
        id: string|null;
        name7: string;
        bpm: number;
        loops: (Page|null)[]; // we will store a single Page shape per pack, but here use per-slot (15)
        loading: boolean;
    };
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
    contentDirty: false,
    editor: { open: false, id: null, name7: '', bpm: 120, loops: Array(15).fill(null), loading: false },
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
    // After upload, sync with device and reflect on-screen
    await refreshDeviceSamples();
    await loadSelectedFromDevice();
    sampleState.selected = [...sampleState.deviceSelected];
    sampleState.contentDirty = false;
    computeDirty();
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

function toPackMeta(id: string, source: PackMeta['source'], sizePercent?: number, loops?: Page, extra?: Partial<PackMeta>): PackMeta {
  return { id, type: packTypeFromId(id), source, sizePercent, loops, ...extra } as PackMeta;
}

function uniqById<T extends { id: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  return arr.filter(x => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

// Canonical id key: TYPE|BASENAME (no hyphen, no padding)
function canonicalIdKey(id: string): string {
  const type = (id?.[0] === 'W' || id?.[0] === 'P' || id?.[0] === 'U') ? id[0] : (id?.startsWith('W-') ? 'W' : id?.startsWith('P-') ? 'P' : id?.startsWith('U-') ? 'U' : 'U');
  const base = (id?.startsWith('W-') || id?.startsWith('P-') || id?.startsWith('U-')) ? id.substring(2) : ((id?.[0] === 'W' || id?.[0] === 'P' || id?.[0] === 'U') ? id.substring(1).trimEnd() : id);
  return `${type}|${(base || '').trim()}`;
}

function typeCharFromId(id: string): 'W'|'P'|'U' {
  if (!id) return 'U';
  const c = id[0];
  if (c === 'W' || c === 'P' || c === 'U') return c as any;
  if (id.startsWith('W-')) return 'W';
  if (id.startsWith('P-')) return 'P';
  if (id.startsWith('U-')) return 'U';
  return 'U';
}

function canonicalKey(id: string): string {
  const base = (id.startsWith('W-') || id.startsWith('P-') || id.startsWith('U-')) ? id.substring(2) : ((id && (id[0] === 'W' || id[0] === 'P' || id[0] === 'U')) ? id.substring(1).trimEnd() : id);
  return `${typeCharFromId(id)}|${(base || '').trim()}`;
}

function computeDirty() {
  const top10 = sampleState.selected.slice(0,10).map(p => canonicalIdKey(p.id));
  const dev10 = sampleState.deviceSelected.slice(0,10).map(p => canonicalIdKey(p.id));
  const idsChanged = JSON.stringify(top10) !== JSON.stringify(dev10);
  sampleState.dirty = idsChanged || sampleState.contentDirty;
}

function normalizeWebsiteId(name: string): string {
  // record.json entries are provided with prefix (e.g., W-MIXED)
  return name;
}

async function loadWebsitePacks(): Promise<PackMeta[]> {
  try {
    const device_name = 'MONKEY';
    const url = `/samples/${device_name}/DRM/record.json?_=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    // Supported formats: ["W-MIXED", ...] OR { packs: [{id: "W-MIXED"}, ...] } OR { "W-MIXED": { id, author, created } }
    if (Array.isArray(data)) {
      return (data as string[]).map(name => toPackMeta(normalizeWebsiteId(name), 'website'));
    }
    if (Array.isArray((data as any)?.packs)) {
      return (data as any).packs.map((p: any) => toPackMeta(normalizeWebsiteId(p.id ?? p), 'website', p.sizePercent, undefined, { author: p.author, created: p.created }));
    }
    if (data && typeof data === 'object') {
      const entries: PackMeta[] = [];
      for (const [key, val] of Object.entries(data as Record<string, any>)) {
        if (typeof val === 'string') {
          entries.push(toPackMeta(normalizeWebsiteId(val), 'website'));
        } else if (val && typeof val === 'object') {
          const id = normalizeWebsiteId(val.id ?? key);
          entries.push(toPackMeta(id, 'website', val.sizePercent, undefined, { author: val.author, created: val.created }));
        }
      }
      return entries;
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
  // Merge by canonical key, preferring website > user_local > device_only
  const website = sampleState.available.filter(p=>p.source==='website');
  const user = sampleState.userPacks;
  const deviceOnly = sampleState.deviceSelected.filter(p=>p.source==='device_only');
  const map = new Map<string, PackMeta>();
  const push = (list: PackMeta[]) => {
    for (const p of list) {
      const k = canonicalKey(p.id);
      if (!map.has(k)) map.set(k, p);
    }
  };
  push(website);
  push(user);
  push(deviceOnly);
  sampleState.available = Array.from(map.values());
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
  // Uploaded current selection content; sync with device and clear content-dirty
  await refreshDeviceSamples();
  await loadSelectedFromDevice();
  sampleState.selected = [...sampleState.deviceSelected];
  sampleState.contentDirty = false;
  computeDirty();
}

export async function revertToDevice() {
  // Re-sync from device and reflect IDs displayed
  await refreshDeviceSamples();
  await loadSelectedFromDevice();
  sampleState.selected = [...sampleState.deviceSelected];
  sampleState.contentDirty = false;
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
    // Pick content source based on id type: user-local packs (U) use local content; official/public fetch website/device
    const type = (id[0] === 'W' || id[0] === 'P' || id[0] === 'U') ? id[0] : (id.startsWith('W-') ? 'W' : id.startsWith('P-') ? 'P' : id.startsWith('U-') ? 'U' : 'W');
    const base = (id.startsWith('W-') || id.startsWith('P-') || id.startsWith('U-')) ? id.substring(2) : ((id[0] === 'W' || id[0] === 'P' || id[0] === 'U') ? id.substring(1).trimEnd() : id);
    let page: Page|null = null;
    if (type === 'U') {
      const up = sampleState.userPacks.find(p => p.id === (id.startsWith('U-') ? id : `U-${base}`));
      page = up?.loops || null;
    } else {
      page = await fetchPackPage(id);
    }
    if (page) {
      // Ensure page name is device-formatted (prefix + padded to 8 chars)
      const useType = type || 'W';
      page.name = `${useType}${(base || '').slice(0,7).padEnd(7,' ')}`;
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
  // If this is a user-local pack, never hit network; read from local storage cache
  if (id && (id.startsWith('U-') || id[0] === 'U')) {
    const up = sampleState.userPacks.find(p => p.id === id);
    return up?.loops || null;
  }
  // Website fetch: filenames now include prefix (e.g., W-MIXED.json)
  try {
    let fetchId = id;
    if (id && !(id.startsWith('W-') || id.startsWith('P-') || id.startsWith('U-'))) {
      // Convert device-style or raw prefixed id (e.g., WOG_____) to W-OG
      if (id[0] === 'W' || id[0] === 'P' || id[0] === 'U') {
        const base = id.substring(1).trim();
        fetchId = `${id[0]}-${base}`;
      }
    }
    const res = await fetch(`/samples/MONKEY/DRM/${fetchId}.json`, { cache: 'no-store' });
    if (res.ok) return await res.json();
  } catch {}
  // Fallback: device download and extract by name
  try {
    const pack = await sampleManager.downloadSamples();
    if (!pack) return null;
    const pages = (pack.pages || []);
    // Match either against exact device-formatted id (prefix + padded) or normalized forms
    const type = (id?.[0] === 'W' || id?.[0] === 'P' || id?.[0] === 'U') ? id[0] : (id?.startsWith('W-') ? 'W' : id?.startsWith('P-') ? 'P' : id?.startsWith('U-') ? 'U' : 'W');
    const base = (id?.startsWith('W-') || id?.startsWith('P-') || id?.startsWith('U-')) ? id.substring(2) : ((id?.[0] === 'W' || id?.[0] === 'P' || id?.[0] === 'U') ? id.substring(1).trimEnd() : id);
    const deviceId = `${type}${(base || '').slice(0,7).padEnd(7,' ')}`;
    for (const page of pages) {
      if (!page) continue;
      if (page.name === deviceId) return page as any;
      if (page.name === id) return page as any;
    }
  } catch {}
  // Fallback: user local pack
  const up = sampleState.userPacks.find(p=>p.id===id);
  return up?.loops || null;
}

// --------- Pack Editor API ---------

export async function openPackEditorFor(id: string | null = null) {
  sampleState.editor.open = true;
  sampleState.editor.id = id;
  sampleState.editor.bpm = 120;
  sampleState.editor.loading = !!id; // show loading if fetching existing pack
  if (id) {
    const page = await fetchPackPage(id);
    const name = id.startsWith('W-') || id.startsWith('P-') || id.startsWith('U-') ? id.substring(2) : (id[0]==='W'||id[0]==='P'||id[0]==='U' ? id.substring(1).trimEnd() : id);
    sampleState.editor.name7 = (name || '').slice(0,7);
    const slots: (Page|null)[] = Array(15).fill(null);
    if (page) {
      const editable: Page = { name: page.name, loops: (page as any).loops } as any;
      slots[0] = editable;
    }
    sampleState.editor.loops = slots;
    sampleState.editor.loading = false;
  } else {
    sampleState.editor.name7 = '';
    sampleState.editor.loops = Array(15).fill(null);
    sampleState.editor.loading = false;
  }
}

export function closePackEditor() {
  sampleState.editor.open = false;
}

export function setEditorLoopData(slot: number, page: Page) {
  const arr = [...sampleState.editor.loops];
  arr[slot] = page;
  sampleState.editor.loops = arr;
  // Auto-save into user pack if we have a name, so uploads reflect latest changes
  if (sampleState.editor.name7) {
    const name7 = sampleState.editor.name7.slice(0,7);
    const id = `U-${name7}`;
    let loops = Array(15).fill(null) as any[];
    const slot0 = sampleState.editor.loops[0];
    if (slot0 && (slot0 as any).loops) loops = (slot0 as any).loops;
    const pg: Page = { name: id, loops } as any;
    createUserPack(name7, pg);
  }
  // If the (edited) pack id is selected, mark contentDirty
  const targetId = currentEditorTargetId();
  if (targetId && sampleState.selected.some(p => p.id === targetId)) {
    sampleState.contentDirty = true;
    computeDirty();
  }
}

export function saveEditorAsUserPack() {
  // Build a Page from editor state
  const name7 = sampleState.editor.name7.slice(0,7);
  const id = `U-${name7}`;
  const prevId = sampleState.editor.id;
  // Merge loops from first non-null slot (editor uses slot 0 to hold the page structure)
  let loops = Array(15).fill(null) as any[];
  // If slot 0 holds a Page, reuse its loops; otherwise, combine from individual slots if set
  const slot0 = sampleState.editor.loops[0];
  if (slot0 && (slot0 as any).loops) {
    loops = (slot0 as any).loops;
  }
  const page: Page = { name: id, loops } as any;
  createUserPack(name7, page);
  // If editing replaced a different id and it's selected, swap selection to new user pack id
  if (prevId && prevId !== id) {
    const idx = sampleState.selected.findIndex(p => p.id === prevId);
    if (idx >= 0) {
      sampleState.selected[idx] = toPackMeta(id, 'user_local', undefined, page);
    }
  }
  // If the resulting pack id is selected, mark contentDirty
  if (sampleState.selected.some(p => p.id === id)) {
    sampleState.contentDirty = true;
  }
  computeDirty();
  closePackEditor();
}

// helper to determine current editor target id (existing or prospective user id)
function currentEditorTargetId(): string | null {
  if (sampleState.editor.id) return sampleState.editor.id;
  if (sampleState.editor.name7) return `U-${sampleState.editor.name7.slice(0,7)}`;
  return null;
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

export function deleteUserPackById(id: string) {
  // Remove from user packs
  sampleState.userPacks = sampleState.userPacks.filter(p => p.id !== id);
  saveUserPacks();
  // If selected, remove from selection
  const selIdx = sampleState.selected.findIndex(p => p.id === id);
  if (selIdx >= 0) {
    sampleState.selected.splice(selIdx, 1);
  }
  recomputeAvailable();
  computeDirty();
}
