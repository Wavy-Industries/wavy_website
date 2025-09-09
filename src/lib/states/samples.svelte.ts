/* Shared device samples state/API for use across features */
import { DeviceSamples } from '~/lib/parsers/samples_parser';
import { smpService } from '~/lib/states/bluetooth.svelte';
import { SampleManager } from '~/lib/bluetooth/smp/SampleManager';
import { canonicalize } from '~/lib/utils/canonicalize';
import { Log } from '~/lib/utils/Log';

const LOG_LEVEL = Log.LEVEL_DEBUG
const log = new Log("device-samples", LOG_LEVEL);

export const sampleManager = new SampleManager(smpService);

const DEFAULT_STATE = {
  ids: null as (string[] | null),
  deviceSamples: null as (DeviceSamples | null),
  isSupported: null as (boolean | null),
  isSet: null as (boolean | null),
  storageTotal: null as (number | null),
  storageUsed: null as (number | null),
  packsStorageUsed: null as (number[] | null),
}

export const deviceSamplesState = $state(DEFAULT_STATE)
export const invalidateDeviceSamplesState = () => Object.assign(deviceSamplesState, DEFAULT_STATE)

type SampleTransferState =
  | { type: 'idle' }
  | { type: 'transferring'; progress: Number | null }
  | { type: 'error'; message: string };

export const deviceSampleTransferState = $state({
  supportCheck: { type: 'idle' } as SampleTransferState,
  download: { type: 'idle' } as SampleTransferState,
  upload: { type: 'idle' } as SampleTransferState,
});

const _isTransfering = $derived(deviceSampleTransferState.supportCheck.type === 'transferring' || deviceSampleTransferState.download.type === 'transferring' || deviceSampleTransferState.upload.type === 'transferring');

interface SupportCheckResult { supported: boolean; isSet: boolean | null; }
export const checkDeviceSampleSupport = async (): Promise<SupportCheckResult> => {
  log.debug('Checking if device supports samples...');
  if (_isTransfering) {
    log.error('Transfer already in progress, aborting support check.');
    deviceSampleTransferState.supportCheck = { type: 'error', message: 'Transfer already in progress' };
    return;
  }
  deviceSampleTransferState.supportCheck = {type: 'transferring', progress: null};
  try {
    const isSet = await sampleManager.isSet();
    deviceSamplesState.isSupported = true;
    deviceSamplesState.isSet = isSet;
    log.info(`Device supports samples, isSet = ${isSet}`);
    if (isSet === true) {
      log.debug('Getting space used');
      const spaceUsed = await sampleManager.getSpaceUsed();
      deviceSamplesState.storageTotal = spaceUsed.tot;
      deviceSamplesState.storageUsed = spaceUsed.usd;
      deviceSamplesState.packsStorageUsed = spaceUsed.packs;
      log.debug(`Space used: ${JSON.stringify(spaceUsed)}`);
      log.debug(`Storage total: ${deviceSamplesState.storageTotal}`);
      log.debug('Getting IDs');
      let ids = await sampleManager.getIDs();
      ids = ids.map(id => id ? id[0] + "-" + id.slice(1) : null);
      ids.push(ids.shift() || null);
      deviceSamplesState.ids = ids;
      log.debug(`IDs: ${JSON.stringify(ids)}`);
    }
  } catch {
    deviceSamplesState.isSupported = false;
    log.info('Device does not support samples');
  }
  deviceSampleTransferState.supportCheck = {type: 'idle' };
  return { supported: deviceSamplesState.isSupported, isSet: deviceSamplesState.isSet };
}

export const downloadDeviceSamples = async (): Promise<DeviceSamples | null> => {
  if (_isTransfering) { log.error('Transfer already in progress, aborting new download request.'); deviceSampleTransferState.download = { type: 'error', message: 'Transfer already in progress' }; return; }
  if (deviceSamplesState.isSet !== true) { log.error('Device samples not set, aborting download.'); deviceSampleTransferState.download = { type: 'error', message: 'Device samples not set' }; return null; }
  log.debug('Downloading samples from device...');
  deviceSampleTransferState.download = { type: 'transferring', progress: null };
  const samples = await sampleManager.downloadSamples((val) => { deviceSampleTransferState.download = { type: 'transferring', progress: val }; })
  deviceSampleTransferState.download = { type: 'idle' };
  if (samples == null) { log.error('Failed to download samples from device'); deviceSampleTransferState.download = { type: 'error', message: 'Failed to download samples from device' }; return null; }
  deviceSamplesState.deviceSamples = samples;
  return samples;
}

export const uplaodDeviceSamples = async (newSamples: DeviceSamples): Promise<boolean> => {
  log.debug('Uploading samples to device...');
  if (_isTransfering) { log.error('Transfer already in progress, aborting new upload request.'); deviceSampleTransferState.upload = { type: 'error', message: 'Transfer already in progress' }; return false; }
  if (deviceSamplesState.isSupported !== true) { log.error('Device does not support samples'); deviceSampleTransferState.upload = { type: 'error', message: 'Device does not support samples' }; return false; }
  if (!newSamples || !Array.isArray(newSamples.pages) || newSamples.pages.length !== 10) { log.error('Invalid samples payload'); deviceSampleTransferState.upload = { type: 'error', message: 'Invalid samples payload' }; return false; }
  deviceSampleTransferState.upload = { type: 'transferring', progress: null };
  const success = await sampleManager.uploadSamples(newSamples, (val) => { deviceSampleTransferState.upload = { type: 'transferring', progress: val }; });
  if (!success) { log.error('Failed to upload samples to device'); deviceSampleTransferState.upload = { type: 'error', message: 'Failed to upload samples to device' }; return false; }
  deviceSampleTransferState.upload = { type: 'idle' };

  deviceSampleTransferState.supportCheck = {type: 'transferring', progress: null};
  const isSet = await sampleManager.isSet();
  deviceSamplesState.isSet = isSet;
  deviceSampleTransferState.supportCheck = {type: 'idle'};
  log.debug(`Device samples are set: ${isSet}`);
  if (deviceSamplesState.isSet === false) { log.error('Device samples are not set'); deviceSampleTransferState.upload = { type: 'error', message: 'Device samples are not set' }; return false; }

  log.debug('Re-downloading samples from device to verify upload...');
  const downloadSamples = await downloadDeviceSamples();
  if (!downloadSamples) { log.error('Failed to re-download samples after upload'); deviceSampleTransferState.upload = { type: 'error', message: 'Failed to re-download samples after upload' }; return false; }
  log.debug('Verifying downloads are the same as uploaded samples...');
  const identical = deviceSamplesEqual(newSamples, downloadSamples);
  if (!identical) { log.error('Uploaded and downloaded samples are not identical'); deviceSampleTransferState.upload = { type: 'error', message: 'Uploaded and downloaded samples are not identical' }; return false; }
  return true;
}

export const DEFAULT_SAMPLE_PACK_IDS = ['W-MIXED', 'W-UNDRGND', 'W-OLLI', 'W-OG']
export const uplaodDeviceDefaultSamples = async () => {
  log.debug('Uploading default samples to device...');
  if (_isTransfering) { log.error('Transfer already in progress, aborting new upload request.'); deviceSampleTransferState.upload = { type: 'error', message: 'Transfer already in progress' }; return false; }
  const deviceSamples = await buildDeviceSamplesFromIds(DEFAULT_SAMPLE_PACK_IDS);
  if (!deviceSamples) { log.error('Failed to construct default sample packs'); deviceSampleTransferState.upload = { type: 'error', message: 'Failed to construct default sample packs' }; return false; }
  return await uplaodDeviceSamples(deviceSamples);
}

export const initialiseDeviceSamples = async () => {
  log.debug('Initialising device samples...');
  const support = await checkDeviceSampleSupport();
  if (!support.supported) { log.debug('Device does not support samples, aborting initialisation.'); return; }
  if (support.isSet !== true) {
    log.debug('Uploading default samples to device...');
    const didUpload = await uplaodDeviceDefaultSamples();
    if (!didUpload) { log.error('Failed to upload default samples during initialisation.'); deviceSampleTransferState.upload = { type: 'error', message: 'Failed to upload default samples during initialisation' }; return; }
    log.debug('Re-checking device samples after upload...');
    const supportAfter = await checkDeviceSampleSupport();
    if (!supportAfter.supported || !supportAfter.isSet) { log.error('Device samples still not set after uploading defaults.'); deviceSampleTransferState.supportCheck = { type: 'error', message: 'Device samples still not set after uploading defaults' }; return; }
  } else {
    log.debug('Device samples already set, no need to upload defaults.');
  }
  log.debug("Now, let's download the samples from the device...");
  await downloadDeviceSamples();
}

export const waitForUploadToFinish = async () => {
  while (deviceSampleTransferState.supportCheck.type === 'transferring' || deviceSampleTransferState.download.type === 'transferring' || deviceSampleTransferState.upload.type === 'transferring') {
    await new Promise(r => setTimeout(r, 100));
  }
}

// Minimal helpers to keep lib independent from feature code
type SamplePack = { name: string; loops: any[] };

const fetchServerPack = async (id: string): Promise<SamplePack | null> => {
  try {
    const DEVICE_NAME = 'MONKEY';
    const res = await fetch(`/samples/${DEVICE_NAME}/DRM/${encodeURIComponent(id)}.json`);
    if (!res.ok) { log.error(`Failed to fetch pack ${id} from server`); return null; }
    const pack = await res.json();
    pack.name = id;
    log.debug(`Fetched pack ${id} from server`);
    return pack;
  } catch { return null; }
}

const buildDeviceSamplesFromIds = async (ids: string[]): Promise<DeviceSamples | null> => {
  if (!ids || ids.length < 1 || ids.length > 10) return null;
  const pages: (SamplePack | null)[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!id) { pages.push(null); continue; }
    const pack = await fetchServerPack(id.trim());
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
