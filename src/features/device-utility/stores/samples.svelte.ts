import { bluetoothManager } from './bluetooth.svelte';
import { mcumgr } from './mcumgr.svelte';
import { SampleManager } from '~/lib/bluetooth/mcumgr/SampleManager';
import { canonicalize } from '~/lib/utilities'
import { packTypeFromId, makeUserPackId, type PackType, canonicalIdKey as canonicalIdKeyUtil, toUiId, toDeviceId, rotateForDevice, rotateForDisplay, validatePack, validatePage, idToBaseName } from '../utils/packs';
import { type Page, type SamplePack } from '~/lib/parsers/samples_parser';
import { buildSamplePackFromIds as buildPack, validatePackForDevice as validatePackLogic, computeDevicePages as computeDevicePagesLogic, computeLocalPageForId as computeLocalForId, computeDiffs as computeDiffsLogic, canonicalPageContent } from '~/features/device-utility/logic/samples';
import { fetchPageByUiId, loadWebsiteIndex } from '~/features/device-utility/data/packs';
import { readAllUserPacks, upsertUserPack, deleteUserPack as deleteUserPackLocal } from '~/features/device-utility/data/local';

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
    description?: string;
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
    selected: (PackMeta|null)[];
    available: PackMeta[];
    deviceSelected: (PackMeta|null)[];
    dirty: boolean;
    preview: { packId: string|null; bpm: number; isPlaying: boolean };
    userPacks: PackMeta[];
    // Device-content staging and diffs
    stagedDeviceContent: Record<string, Page | undefined>; // key = canonicalIdKey
    diffs: Record<string, { local?: Page|null; device?: Page|null; status: 'in_sync'|'local_newer'|'device_newer'|'diverged' } | undefined>;
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
    selected: Array(10).fill(null),
    available: [],
    deviceSelected: Array(10).fill(null),
    dirty: false,
    preview: { packId: null, bpm: 120, isPlaying: false },
    userPacks: [],
    stagedDeviceContent: {},
    diffs: {},
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

export function computeDirty() {
  const key = (p: PackMeta|null) => p ? canonicalIdKey(p.id) : null;
  const top10 = sampleState.selected.slice(0,10).map(key);
  const dev10 = sampleState.deviceSelected.slice(0,10).map(key);
  const idsChanged = JSON.stringify(top10) !== JSON.stringify(dev10);
  // Derive content dirty by comparing staged device content vs current device pages
  let stagedChanged = false;
  for (const k of Object.keys(sampleState.stagedDeviceContent)) {
    const staged = sampleState.stagedDeviceContent[k];
    const dev = (devicePagesByKey as any)[k] || null;
    if (JSON.stringify(canonicalPageContent(staged as any)) !== JSON.stringify(canonicalPageContent(dev as any))) {
      stagedChanged = true; break;
    }
  }
  sampleState.dirty = idsChanged || stagedChanged;
}

function normalizeWebsiteId(name: string): string {
  // record.json entries are provided with prefix (e.g., W-MIXED)
  return name;
}

async function loadWebsitePacks(): Promise<PackMeta[]> {
  const items = await loadWebsiteIndex();
  return items.map((x) => toPackMeta(x.id, 'website', x.sizePercent, undefined, { author: x.author, created: x.created, description: x.description }));
}

async function loadSelectedFromDevice() {
  const ids = sampleState.names || [];
  // Device reports IDs in device slot order; rotate to display order (1..9,0)
  const dispIds = rotateForDisplay(ids.length === 10 ? [...ids] : [...ids].slice(0,10));
  const metas: (PackMeta|null)[] = [];
  for (const id of dispIds) {
    if (!id) { metas.push(null); continue; }
    const uiId = toUiId(id);
    metas.push(toPackMeta(uiId, 'device_only'));
  }
  while (metas.length < 10) metas.push(null);
  sampleState.deviceSelected = metas;
  // Initialize selected with device order if not already set (or all-null)
  const allNull = sampleState.selected.length === 0 || sampleState.selected.slice(0,10).every(x => !x);
  if (allNull) sampleState.selected = [...sampleState.deviceSelected];
  computeDirty();
}

function recomputeAvailable() {
  // Merge by canonical key, preferring website > user_local > device_only
  const website = sampleState.available.filter(p=>p.source==='website');
  const user = sampleState.userPacks;
  const deviceOnly = sampleState.deviceSelected.filter(p=>p && p.source==='device_only') as PackMeta[];
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
  await computeDevicePages();
  await computeDiffs();
}

export function addPackToSelected(id: string) {
  const found = sampleState.available.find(p => p.id === id) || sampleState.deviceSelected.find(p=>p && p.id===id) || sampleState.userPacks.find(p=>p.id===id);
  if (!found) return;
  if (sampleState.selected.find(p => p && canonicalIdKey(p.id) === canonicalIdKey(id))) return; // already by canonical id
  // Place into first empty slot within top 10; otherwise push to overflow
  const idx = sampleState.selected.slice(0,10).findIndex(p => !p);
  if (idx >= 0) {
    const next = [...sampleState.selected];
    next[idx] = found;
    sampleState.selected = next;
  } else {
    sampleState.selected = [...sampleState.selected, found];
  }
  recomputeAvailable();
  computeDirty();
}

export function removeSelectedAt(index: number) {
  const next = [...sampleState.selected];
  if (index < 10) next[index] = null; else next.splice(index, 1);
  sampleState.selected = next;
  recomputeAvailable();
  computeDirty();
}

export function moveSelected(index: number, dir: -1 | 1) {
  const arr = [...sampleState.selected];
  const j = index + dir;
  // Restrict movement within the first 10 slots to keep overflow separate
  const maxIdx = Math.min(arr.length - 1, 9);
  if (index < 0 || j < 0 || index > maxIdx || j > maxIdx) return;
  const tmp = arr[index]; arr[index] = arr[j]; arr[j] = tmp;
  sampleState.selected = arr;
  computeDirty();
}

export async function uploadSelected() {
  sampleState.errors = [];
  // Build sample pack from selected using website/device/user sources
  let ids = sampleState.selected.slice(0,10).map(p => p ? p.id : null);
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
  await computeDevicePages(true);
  await loadSelectedFromDevice();
  sampleState.selected = [...sampleState.deviceSelected];
  sampleState.stagedDeviceContent = {};
  await computeDiffs();
  computeDirty();
}

export async function revertToDevice() {
  // Re-sync from device and reflect IDs displayed
  await refreshDeviceSamples();
  await computeDevicePages(true);
  await loadSelectedFromDevice();
  sampleState.selected = [...sampleState.deviceSelected];
  sampleState.stagedDeviceContent = {};
  await computeDiffs();
  computeDirty();
}

async function buildSamplePackFromIds(ids: (string|null)[]): Promise<SamplePack> {
  return await buildPack(ids, {
    userPacks: sampleState.userPacks.map(p => ({ id: p.id, loops: p.loops })),
    stagedDeviceContent: sampleState.stagedDeviceContent,
    canonicalIdKey: (id: string) => canonicalIdKey(id),
    fetchPackPage: (id: string) => fetchPackPage(id),
  });
}

// --------- Validation ---------

async function validatePackForDevice(pack: SamplePack): Promise<boolean> {
  const { ok, errors } = validatePackLogic(pack, sampleState.storageTotal);
  sampleState.errors = errors;
  return ok;
}

export function validatePageForUi(uiId: string, page: Page): string[] { return validatePage(uiId, page); }

// --------- Preview (simple) ---------

export async function previewPack(id: string) {
  sampleState.preview.packId = id;
  // If loops missing, try website JSON, else from device download
  const existing = sampleState.selected.find(p=>p && p.id===id) || sampleState.available.find(p=>p.id===id) || sampleState.deviceSelected.find(p=>p && p.id===id) || sampleState.userPacks.find(p=>p.id===id);
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

// Editor-related state and actions have moved to stores/edits.svelte.ts

// --------- User packs (localStorage) ---------

function loadUserPacks() {
  const arr = readAllUserPacks();
  sampleState.userPacks = arr.map(x => toPackMeta(toUiId(x.id), 'user_local', undefined, x.page));
}

function saveUserPacks() {
  const arr = sampleState.userPacks.map(x => ({ id: x.id, page: x.loops as any }));
  // writeAllUserPacks wants concrete pages; use upsert for each to keep compatibility
  for (const rec of arr) upsertUserPack(rec.id, rec.page);
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

export function createOrReplaceUserPack(userName7: string, page: Page) {
  // Helper for internal saves where replacement is allowed
  const id = makeUserPackId(userName7);
  const meta = toPackMeta(id, 'user_local', undefined, page);
  const idx = sampleState.userPacks.findIndex(p => p.id === id);
  if (idx >= 0) sampleState.userPacks[idx] = meta; else sampleState.userPacks.push(meta);
  saveUserPacks();
  recomputeAvailable();
}

export function deleteUserPackById(id: string) {
  // Remove from user packs
  sampleState.userPacks = sampleState.userPacks.filter(p => p.id !== id);
  deleteUserPackLocal(id);
  // If selected, remove from selection
  const selIdx = sampleState.selected.findIndex(p => p && p.id === id);
  if (selIdx >= 0) {
    sampleState.selected.splice(selIdx, 1);
  }
  recomputeAvailable();
  computeDirty();
  computeDiffs();
}

// --------- Diffing & Sync ---------

let devicePagesByKey: Record<string, Page | undefined> = {};
let ongoingDevicePackDownload: Promise<SamplePack | null> | null = null;

async function downloadSamplesSingleFlight(force = false): Promise<SamplePack | null> {
  if (!force && ongoingDevicePackDownload) return ongoingDevicePackDownload;
  const p = sampleManager.downloadSamples();
  ongoingDevicePackDownload = p;
  try {
    const res = await p;
    return res;
  } finally {
    if (ongoingDevicePackDownload === p) ongoingDevicePackDownload = null;
  }
}

async function computeDevicePages(force = false) {
  devicePagesByKey = await computeDevicePagesLogic(() => downloadSamplesSingleFlight(force));
}

async function computeLocalPageForId(id: string): Promise<Page | null> {
  return await computeLocalForId(id, { userPacks: sampleState.userPacks.map(p => ({ id: p.id, loops: p.loops })), fetchPageByUiId });
}

export async function computeDiffs() {
  const keysSet = new Set<string>();
  for (const p of sampleState.selected) if (p) keysSet.add(canonicalIdKey(p.id));
  // For Available, prefer local user packs over originals to avoid marking originals out-of-sync when a local clone is in use
  const preferredKeys = new Set<string>();
  for (const p of sampleState.userPacks) preferredKeys.add(canonicalIdKey(p.id));
  for (const p of sampleState.available) if (p && !preferredKeys.has(canonicalIdKey(p.id))) keysSet.add(canonicalIdKey(p.id));
  const keys = Array.from(keysSet);
  sampleState.diffs = await computeDiffsLogic(keys, devicePagesByKey, { computeLocalPageForId });
}

export function syncToDevice(id: string) {
  // Copy local content into staged device content (requires Upload to apply)
  const key = canonicalIdKey(id);
  const uiId = toUiId(id);
  // Resolve local content page
  let page: Page | null = null;
  const up = sampleState.userPacks.find(p => canonicalIdKey(p.id) === key);
  if (up?.loops) page = { name: toDeviceId(uiId), loops: ((up.loops as any).loops ?? []) } as any;
  // If not user-local, we need to fetch website content; this is async — defer staging until fetch completes
  if (!page) {
    fetchPackPage(uiId).then((p) => {
      if (!p) return;
      sampleState.stagedDeviceContent[key] = { name: toDeviceId(uiId), loops: (p as any).loops } as any;
      computeDirty();
    });
    return;
  }
  sampleState.stagedDeviceContent[key] = page;
  computeDirty();
}

export function syncFromDevice(id: string) {
  // Copy device page into a local U-pack (create or replace)
  const key = canonicalIdKey(id);
  const page = devicePagesByKey[key];
  if (!page) return;
  const base = idToBaseName(toUiId(id)).slice(0,7);
  const uid = makeUserPackId(base);
  const loops = (page as any).loops || [];
  const localPage: Page = { name: uid, loops } as any;
  createOrReplaceUserPack(base, localPage);
  // Recompute diffs since local changed
  computeDiffs();
}
