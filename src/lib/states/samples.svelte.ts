/* Shared device samples state/API for use across features */
import { DeviceSamples, SamplePack } from '~/lib/parsers/device_storage_parser';
import { smpService } from '~/lib/states/bluetooth.svelte';
import { SampleManager } from '~/lib/bluetooth/smp/SampleManager';
import { canonicalize } from '~/lib/utils/canonicalize';
import { Log } from '~/lib/utils/Log';
import { SampleMode, sampleModeLabel } from '~/lib/types/sampleMode';
import { getDeviceName } from '~/lib/config/device';
import { fetchServerPack } from '~/lib/services/samplePackFetcher';

const log = new Log("device-samples", Log.LEVEL_INFO);

export const sampleManager = new SampleManager(smpService);

type ModeState = {
  ids: string[] | null;
  deviceSamples: DeviceSamples | null;
  isSet: boolean | null;
  storageTotal: number | null;
  storageUsed: number | null;
  packsStorageUsed: number[] | null;
};

const createModeState = (): ModeState => ({
  ids: null,
  deviceSamples: null,
  isSet: null,
  storageTotal: null,
  storageUsed: null,
  packsStorageUsed: null,
});

const createModeStates = (): Record<SampleMode, ModeState> => ({
  [SampleMode.DRM]: createModeState(),
  [SampleMode.PAT]: createModeState(),
});

const createDefaultState = () => ({
  isSupported: null as (boolean | null),
  modeSupported: false,
  activeMode: SampleMode.DRM,
  modes: createModeStates(),
});

export const deviceSamplesState = $state(createDefaultState());
export const invalidateDeviceSamplesState = () => Object.assign(deviceSamplesState, createDefaultState());

type SampleTransferState =
  | { type: 'idle' }
  | { type: 'transferring'; progress: Number | null }
  | { type: 'error'; message: string };

type ModeTransferState =
  | { type: 'idle' }
  | { type: 'transferring'; mode: SampleMode }
  | { type: 'error'; message: string; mode?: SampleMode };

export const deviceSampleTransferState = $state({
  supportCheck: { type: 'idle' } as SampleTransferState,
  download: { type: 'idle' } as SampleTransferState,
  upload: { type: 'idle' } as SampleTransferState,
  mode: { type: 'idle' } as ModeTransferState,
});

const _isTransfering = $derived(
  deviceSampleTransferState.supportCheck.type === 'transferring' ||
  deviceSampleTransferState.download.type === 'transferring' ||
  deviceSampleTransferState.upload.type === 'transferring' ||
  deviceSampleTransferState.mode.type === 'transferring'
);

const getModeState = (mode: SampleMode) => deviceSamplesState.modes[mode];

export const setSampleMode = async (mode: SampleMode): Promise<boolean> => {
  if (!deviceSamplesState.modeSupported) {
    deviceSamplesState.activeMode = SampleMode.DRM;
    if (mode === SampleMode.DRM) {
      deviceSampleTransferState.mode = { type: 'idle' };
      return true;
    }
    deviceSampleTransferState.mode = { type: 'error', message: 'Mode not supported', mode };
    return false;
  }
  if (deviceSampleTransferState.mode.type === 'transferring') return false;
  deviceSampleTransferState.mode = { type: 'transferring', mode };
  try {
    await sampleManager.setMode(mode);
    deviceSampleTransferState.mode = { type: 'idle' };
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const message = `Failed to set sample mode ${sampleModeLabel(mode)}: ${reason}`;
    log.error(message);
    deviceSampleTransferState.mode = { type: 'error', message, mode };
    return false;
  }
}

export const ensureModeLoaded = async (mode: SampleMode): Promise<boolean> => {
  const ready = await setSampleMode(mode);
  if (!ready) return false;
  await downloadDeviceSamples(mode);
  return true;
}

const detectModeSupport = async (): Promise<boolean> => {
  try {
    await sampleManager.getMode();
    deviceSamplesState.modeSupported = true;
    return true;
  } catch {
    deviceSamplesState.modeSupported = false;
    deviceSamplesState.activeMode = SampleMode.DRM;
    return false;
  }
}

interface SupportCheckResult { supported: boolean; isSet: boolean | null; }
export const checkDeviceSampleSupport = async (mode: SampleMode = deviceSamplesState.activeMode): Promise<SupportCheckResult> => {
  log.debug(`Checking if device supports samples (${mode})...`);
  if (_isTransfering) {
    log.error('Transfer already in progress, aborting support check.');
    deviceSampleTransferState.supportCheck = { type: 'error', message: 'Transfer already in progress' };
    return { supported: deviceSamplesState.isSupported, isSet: getModeState(mode).isSet };
  }
  deviceSampleTransferState.supportCheck = {type: 'transferring', progress: null};
  const modeReady = await setSampleMode(mode);
  if (!modeReady && mode !== SampleMode.DRM) {
    deviceSampleTransferState.supportCheck = { type: 'idle' };
    return { supported: deviceSamplesState.isSupported, isSet: getModeState(mode).isSet };
  }
  const modeState = getModeState(mode);
  try {
    const isSet = await sampleManager.isSet();
    deviceSamplesState.isSupported = true;
    modeState.isSet = isSet;
    log.info(`Device supports samples, isSet = ${isSet}`);
    if (isSet === true) {
      log.debug('Getting space used');
      const spaceUsed = await sampleManager.getSpaceUsed();
      modeState.storageTotal = spaceUsed.tot;
      modeState.storageUsed = spaceUsed.usd;
      modeState.packsStorageUsed = spaceUsed.packs;
      log.debug(`Space used: ${JSON.stringify(spaceUsed)}`);
      log.debug(`Storage total: ${modeState.storageTotal}`);
      log.debug('Getting IDs');
      let ids = await sampleManager.getIDs();
      ids = ids.map(id => id ? id[0] + "-" + id.slice(1) : null);
      ids.push(ids.shift() || null);
      modeState.ids = ids;
      log.debug(`IDs: ${JSON.stringify(ids)}`);
    }
  } catch {
    deviceSamplesState.isSupported = false;
    log.info('Device does not support samples');
  }
  deviceSampleTransferState.supportCheck = {type: 'idle' };
  return { supported: deviceSamplesState.isSupported, isSet: modeState.isSet };
}

export const downloadDeviceSamples = async (mode: SampleMode = deviceSamplesState.activeMode): Promise<DeviceSamples | null> => {
  if (_isTransfering) { log.error('Transfer already in progress, aborting new download request.'); deviceSampleTransferState.download = { type: 'error', message: 'Transfer already in progress' }; return; }
  const modeReady = await setSampleMode(mode);
  if (!modeReady && mode !== SampleMode.DRM) { return null; }
  const modeState = getModeState(mode);
  if (modeState.isSet !== true) { log.error('Device samples not set, aborting download.'); deviceSampleTransferState.download = { type: 'error', message: 'Device samples not set' }; return null; }
  log.debug('Downloading samples from device...');
  deviceSampleTransferState.download = { type: 'transferring', progress: null };
  const samples = await sampleManager.downloadSamples((val) => { deviceSampleTransferState.download = { type: 'transferring', progress: val }; })
  deviceSampleTransferState.download = { type: 'idle' };
  if (samples == null) { log.error('Failed to download samples from device'); deviceSampleTransferState.download = { type: 'error', message: 'Failed to download samples from device' }; return null; }
  modeState.deviceSamples = samples;
  return samples;
}

export const uplaodDeviceSamples = async (newSamples: DeviceSamples, mode: SampleMode = deviceSamplesState.activeMode): Promise<boolean> => {
  log.debug('Uploading samples to device...');
  if (_isTransfering) { log.error('Transfer already in progress, aborting new upload request.'); deviceSampleTransferState.upload = { type: 'error', message: 'Transfer already in progress' }; return false; }
  if (deviceSamplesState.isSupported !== true) { log.error('Device does not support samples'); deviceSampleTransferState.upload = { type: 'error', message: 'Device does not support samples' }; return false; }
  if (!newSamples || !Array.isArray(newSamples.pages) || newSamples.pages.length !== 10) { log.error('Invalid samples payload'); deviceSampleTransferState.upload = { type: 'error', message: 'Invalid samples payload' }; return false; }
  const modeReady = await setSampleMode(mode);
  if (!modeReady && mode !== SampleMode.DRM) { return false; }
  const modeState = getModeState(mode);
  deviceSampleTransferState.upload = { type: 'transferring', progress: null };
  const success = await sampleManager.uploadSamples(newSamples, (val) => { deviceSampleTransferState.upload = { type: 'transferring', progress: val }; });
  if (!success) { log.error('Failed to upload samples to device'); deviceSampleTransferState.upload = { type: 'error', message: 'Failed to upload samples to device' }; return false; }
  deviceSampleTransferState.upload = { type: 'idle' };

  deviceSampleTransferState.supportCheck = {type: 'transferring', progress: null};
  const isSet = await sampleManager.isSet();
  modeState.isSet = isSet;
  deviceSampleTransferState.supportCheck = {type: 'idle'};
  log.debug(`Device samples are set: ${isSet}`);
  if (modeState.isSet === false) { log.error('Device samples are not set'); deviceSampleTransferState.upload = { type: 'error', message: 'Device samples are not set' }; return false; }

  log.debug('Re-downloading samples from device to verify upload...');
  const downloadSamples = await downloadDeviceSamples(mode);
  if (!downloadSamples) { log.error('Failed to re-download samples after upload'); deviceSampleTransferState.upload = { type: 'error', message: 'Failed to re-download samples after upload' }; return false; }
  log.debug('Verifying downloads are the same as uploaded samples...');
  const identical = deviceSamplesEqual(newSamples, downloadSamples);
  if (!identical) { log.error('Uploaded and downloaded samples are not identical'); deviceSampleTransferState.upload = { type: 'error', message: 'Uploaded and downloaded samples are not identical' }; return false; }
  return true;
}

export const fetchDefaultPackIds = async (mode: SampleMode): Promise<string[]> => {
  try {
    const res = await fetch(`/assets/${getDeviceName()}/${sampleModeLabel(mode)}/default.json`);
    if (!res.ok) {
      log.error(`Failed to fetch default pack IDs for ${sampleModeLabel(mode)}`);
      return [];
    }
    const ids = await res.json();
    log.debug(`Fetched default pack IDs for ${sampleModeLabel(mode)}: ${JSON.stringify(ids)}`);
    return ids;
  } catch (error) {
    log.error(`Error fetching default pack IDs: ${error}`);
    return [];
  }
}

export const uplaodDeviceDefaultSamples = async (mode: SampleMode = deviceSamplesState.activeMode) => {
  log.debug('Uploading default samples to device...');
  if (_isTransfering) { log.error('Transfer already in progress, aborting new upload request.'); deviceSampleTransferState.upload = { type: 'error', message: 'Transfer already in progress' }; return false; }
  const resolvedMode = typeof mode === 'number' ? mode : deviceSamplesState.activeMode;
  const effectiveMode = deviceSamplesState.modeSupported ? resolvedMode : SampleMode.DRM;
  const defaultPackIds = await fetchDefaultPackIds(effectiveMode);
  if (!defaultPackIds || defaultPackIds.length === 0) { log.error('Failed to fetch default pack IDs'); deviceSampleTransferState.upload = { type: 'error', message: 'Failed to fetch default pack IDs' }; return false; }
  const deviceSamples = await buildDeviceSamplesFromIds(defaultPackIds, effectiveMode);
  if (!deviceSamples) { log.error('Failed to construct default sample packs'); deviceSampleTransferState.upload = { type: 'error', message: 'Failed to construct default sample packs' }; return false; }
  return await uplaodDeviceSamples(deviceSamples, effectiveMode);
}

export const initialiseDeviceSamples = async () => {
  log.debug('Initialising device samples...');
  const initForMode = async (mode: SampleMode) => {
    const support = await checkDeviceSampleSupport(mode);
    if (!support?.supported) { return support; }
    if (support.isSet !== true) {
      log.debug(`Uploading default samples to device (${mode})...`);
      const didUpload = await uplaodDeviceDefaultSamples(mode);
      if (!didUpload) { log.error(`Failed to upload default samples during initialisation (${mode}).`); deviceSampleTransferState.upload = { type: 'error', message: `Failed to upload default samples during initialisation (${mode})` }; return support; }
      log.debug(`Re-checking device samples after upload (${mode})...`);
      const supportAfter = await checkDeviceSampleSupport(mode);
      if (!supportAfter.supported || !supportAfter.isSet) { log.error(`Device samples still not set after uploading defaults (${mode}).`); deviceSampleTransferState.supportCheck = { type: 'error', message: `Device samples still not set after uploading defaults (${mode})` }; return supportAfter; }
    } else {
      log.debug(`Device samples already set (${mode}), no need to upload defaults.`);
    }
    log.debug(`Now, let's download the samples from the device (${mode})...`);
    await downloadDeviceSamples(mode);
    return support;
  }

  await detectModeSupport();

  const drmSupport = await initForMode(SampleMode.DRM);
  if (!drmSupport?.supported) { log.debug('Device does not support samples, aborting initialisation.'); return; }
  if (deviceSamplesState.modeSupported) {
    await initForMode(SampleMode.PAT);
  }

  await setSampleMode(SampleMode.DRM);
}

export const waitForUploadToFinish = async () => {
  while (deviceSampleTransferState.supportCheck.type === 'transferring' || deviceSampleTransferState.download.type === 'transferring' || deviceSampleTransferState.upload.type === 'transferring') {
    await new Promise(r => setTimeout(r, 100));
  }
}

const buildDeviceSamplesFromIds = async (ids: string[], mode: SampleMode): Promise<DeviceSamples | null> => {
  if (!ids || ids.length < 1 || ids.length > 10) return null;
  const pages: (SamplePack | null)[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!id) { pages.push(null); continue; }
    const pack = await fetchServerPack(id.trim(), mode);
    if (!pack) return null;
    pages.push(pack);
  }
  while (pages.length < 10) pages.push(null);
  return { pages } as DeviceSamples;
}

const samplePackEqual = (a: SamplePack | null, b: SamplePack | null): boolean => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.name !== b.name) return false;
  const loopsA = (a.loops ?? []).map(canonicalize);
  const loopsB = (b.loops ?? []).map(canonicalize);
  return JSON.stringify(loopsA) === JSON.stringify(loopsB);
}

const deviceSamplesEqual = (a: DeviceSamples, b: DeviceSamples): boolean => {
  if (!a?.pages || !b?.pages) return false;
  if (a.pages.length !== 10 || b.pages.length !== 10) return false;
  for (let i = 0; i < 10; i++) {
    if (!samplePackEqual(a.pages[i] as any, b.pages[i] as any)) return false;
  }
  return true;
}
