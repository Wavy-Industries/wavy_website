import { bluetoothManager } from './bluetooth.svelte';
import { mcumgr } from './mcumgr.svelte';
import { SampleManager } from '~/lib/mcumgr/SampleManager';
import { canonicalize } from '~/lib/utilities'
import { packDisplayName, packTypeFromId, makeUserPackId, type PackType, canonicalIdKey as canonicalIdKeyUtil, toUiId, toDeviceId, deviceIndexForDisplay, rotateForDevice } from '../utils/packs';
import { samplesParser_decode, samplesParser_encode, type Page, type SamplePack } from '~/lib/parsers/samples_parser';
import { validatePack, validatePage as validatePageStandalone } from '~/features/device-utility/validation/packs';
import { fetchPageByUiId, loadWebsiteIndex } from '~/features/device-utility/data/website';

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
    errors: string[];
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
    errors: [],
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
    // Ensure exactly 10 entries and rotate for device order
    const ids = [...selectedIds.slice(0, 10)];
    while (ids.length < 10) ids.push(null as any);
    const samplePack = await buildSamplePackFromIds(ids as any);
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
    const ids = [...DEFAULT_PAGE_IDS];
    while (ids.length < 10) ids.push(null as any);
    const generated = await buildSamplePackFromIds(ids as any);
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
const canonicalIdKey = (id: string) => canonicalIdKeyUtil(id);

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
  const items = await loadWebsiteIndex();
  return items.map((x) => toPackMeta(x.id, 'website', x.sizePercent, undefined, { author: x.author, created: x.created }));
}

async function loadSelectedFromDevice() {
  const ids = sampleState.names || [];
  const metas: PackMeta[] = [];
  for (const id of ids) {
    if (!id) { metas.push(null as any); continue; }
    const uiId = toUiId(id);
    metas.push(toPackMeta(uiId, 'device_only'));
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
      const k = canonicalIdKey(p.id);
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
  if (sampleState.selected.find(p => canonicalIdKey(p.id) === canonicalIdKey(id))) return; // already by canonical id
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
  sampleState.errors = [];
  // Build sample pack from selected using website/device/user sources
  let ids = sampleState.selected.slice(0,10).map(p => p.id);
  while (ids.length < 10) ids.push(null as any);
  const pack = await buildSamplePackFromIds(ids as any);
  // Validate pack before upload
  const ok = await validatePackForDevice(pack);
  if (!ok) return; // errors populated
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

async function buildSamplePackFromIds(ids: (string|null)[]): Promise<SamplePack> {
  // Rotate for device order if exactly 10
  const devIds = ids.length === 10 ? rotateForDevice(ids) : ids;
  const pages: (Page|null)[] = [];
  for (const id of devIds) {
    if (!id) { pages.push(null); continue; }
    // Pick content source based on id type: user-local packs (U) use local content; official/public fetch website/device
    const type = (id[0] === 'W' || id[0] === 'P' || id[0] === 'U') ? id[0] : (id.startsWith('W-') ? 'W' : id.startsWith('P-') ? 'P' : id.startsWith('U-') ? 'U' : 'W');
    const uiId = toUiId(id);
    let page: Page|null = null;
    if (type === 'U') {
      const up = sampleState.userPacks.find(p => canonicalIdKey(p.id) === canonicalIdKey(uiId));
      page = up?.loops || null;
    } else {
      page = await fetchPackPage(uiId);
    }
    if (page) {
      // Ensure page name is device-formatted (prefix + padded to 8 chars)
      page.name = toDeviceId(uiId);
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

// --------- Validation ---------

async function validatePackForDevice(pack: SamplePack): Promise<boolean> {
  const errs = validatePack(pack, { storageTotal: sampleState.storageTotal ?? undefined });
  sampleState.errors = errs;
  return errs.length === 0;
}

export function validatePageForUi(uiId: string, page: Page): string[] { return validatePageStandalone(uiId, page); }

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

// --------- Debug helpers (device download + inspection) ---------

export async function debugDownloadPack() {
  try {
    const pack = await sampleManager.downloadSamples();
    return pack;
  } catch (e) { return null; }
}

export async function debugDownloadPage(uiId: string) {
  try {
    const pack = await sampleManager.downloadSamples();
    if (!pack) return null;
    const devId = toDeviceId(uiId);
    const page = (pack.pages || []).find((p:any) => p && p.name === devId) as Page | undefined;
    if (!page) return { found: false, devId, message: 'page not found in device pack' };
    // Summarize first loop with first 10 events for quick eyeballing
    const loop = page.loops?.find(l => !!l) as any;
    const totalEvents = loop?.events?.length ?? 0;
    const firstEvents = (loop?.events || []).slice(0, 10).map((ev:any) => ({ note: ev.note, press: ev.time_ticks_press, rel: ev.time_ticks_release, vel: ev.velocity }));
    return { found: true, devId, pageName: page.name, totalEvents, firstEvents };
  } catch (e) {
    return { error: String(e) };
  }
}

// Expose minimal debug API in browser console (optional)
if (typeof window !== 'undefined') {
  (window as any).wavyDebug = {
    debugDownloadPack,
    debugDownloadPage,
  };
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
    const uiId = toUiId(id);
    const page = await fetchPageByUiId(uiId);
    if (page) return page;
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

export async function getPackPageById(id: string): Promise<Page|null> {
  return await fetchPackPage(id);
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
    // Normalize ids to UI format (handles legacy stored ids without hyphen)
    sampleState.userPacks = arr.map(x => toPackMeta(toUiId(x.id), 'user_local', undefined, x.page));
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
