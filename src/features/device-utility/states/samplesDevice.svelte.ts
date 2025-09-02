/*
SYNCS THE STATE OF THE SAMPLES ON THE DEVICE AND PROVIDES THE API TO PERFORM MODIFICATIONS.

we end up with sone state machine. It is important that we do not end up with an error state where
we continuously upload and download samples due to an error either on the device or app side.

We dont assume the state of the device. Instead, each time we upload and do modifications, we assure by re-downloading from device.
Thus, if these downloads are not to our expectations, then we should not automatically try to fix it. Instead it should error out.

We try to be as non-smart as possible, where the functions does just as they say, and we have to be explicit about actions.
*/


import { DeviceSamples } from '~/lib/parsers/samples_parser';
import { smpService } from './bluetooth.svelte';
import { SampleManager } from '~/lib/bluetooth/smp/SampleManager';
import { compareDeviceSamples, constructSamplePacks } from '../logic/samples';

import { Log } from '~/lib/utils/Log';
const LOG_LEVEL = Log.LEVEL_INFO
const log = new Log("device-samples", LOG_LEVEL);

export const sampleManager = new SampleManager(smpService);

export const deviceSamplesState = $state({
    deviceSamples: null,
    isSupported: false,
    isSet: null,
    storageTotal: null,
    storageUsed: null,
    packsStorageUsed: null,
    
})

type SampleTransferState =
  | { type: 'idle' }
  | { type: 'transferring'; progress: Number | null } // percentage (0–100)
  | { type: 'error'; message: string };

export const deviceSampleTransferState = $state({
    supportCheck: { type: 'idle' } as SampleTransferState,
    download: { type: 'idle' } as SampleTransferState,
    upload: { type: 'idle' } as SampleTransferState,
});

const _isTransfering = $derived(deviceSampleTransferState.supportCheck.type === 'transferring' || deviceSampleTransferState.download.type === 'transferring' || deviceSampleTransferState.upload.type === 'transferring');

interface SupportCheckResult {
    supported: boolean;
    isSet: boolean | null;
}
export const checkDeviceSampleSupport = async (): Promise<SupportCheckResult> => {
    log.debug("Checking if device supports samples...");
    if (_isTransfering) {
        log.error("Transfer already in progress, aborting support check.");
        deviceSampleTransferState.supportCheck = { type: 'error', message: 'Transfer already in progress' };
        return;
    }

    deviceSampleTransferState.supportCheck = {type: 'transferring', progress: null};
    try {
        const isSet = await sampleManager.isSet();
        deviceSamplesState.isSupported = true;
        deviceSamplesState.isSet = isSet;
        log.info(`Device supports samples, isSet = ${isSet}`);
    } catch {
        // device does not support samples
        deviceSamplesState.isSupported = false;
        log.info("Device does not support samples");
    }
    deviceSampleTransferState.supportCheck = {type: 'idle' };

    return { supported: deviceSamplesState.isSupported, isSet: deviceSamplesState.isSet };
}

export const downloadDeviceSamples = async (): Promise<DeviceSamples | null> => {
    if (_isTransfering) {
        log.error("Transfer already in progress, aborting new download request.");
        deviceSampleTransferState.download = { type: 'error', message: 'Transfer already in progress' };
        return;
    }

    const deviceSupport = await checkDeviceSampleSupport();
    if (!deviceSupport.supported) {
        log.error("Device does not support samples, aborting download.");
        deviceSampleTransferState.download = { type: 'error', message: 'Device does not support samples' };
        return null;
    }

    if (deviceSupport.isSet !== true) {
        log.error("Device samples not set, aborting download.");
        deviceSampleTransferState.download = { type: 'error', message: 'Device samples not set' };
        return null;
    }

    log.debug("Downloading samples from device...");
    deviceSampleTransferState.download = { type: 'transferring', progress: null };
    const samples = await sampleManager.downloadSamples((val) => {
        deviceSampleTransferState.download = { type: 'transferring', progress: val };
    })
    deviceSampleTransferState.download = { type: 'idle' };

    if (samples == null) {
        log.error("Failed to download samples from device");
        deviceSampleTransferState.download = { type: 'error', message: 'Failed to download samples from device' };
        return null;
    }

    deviceSamplesState.deviceSamples = samples;
    return samples;
}


export const uplaodDeviceSamples = async (deviceSamples: DeviceSamples) => {
    if (_isTransfering) {
        log.error("Transfer already in progress, aborting new upload request.");
        deviceSampleTransferState.upload = { type: 'error', message: 'Transfer already in progress' };
        return false;
    }

    deviceSampleTransferState.upload = { type: 'transferring', progress: null };
    const success = await sampleManager.uploadSamples(deviceSamples, (val) => {
        deviceSampleTransferState.upload = { type: 'transferring', progress: val };
    });
    if (!success) {
        log.error("Failed to upload default samples to device");
        deviceSampleTransferState.upload = { type: 'error', message: 'Failed to upload samples to device' };
        return false;
    }
    deviceSampleTransferState.upload = { type: 'idle' };
    
    log.debug("Re-downloading samples from device to verify upload...");
    const samples = await downloadDeviceSamples();
    if (!samples) {
        log.error("Failed to re-download samples from device after upload");
        deviceSampleTransferState.upload = { type: 'error', message: 'Failed to re-download samples after upload' };
        return false;
    }

    log.debug("Verifying downloads are the same as uploaded samples...");
    const samplesDiff = compareDeviceSamples(deviceSamples, samples);
    if (samplesDiff === null) {
        log.error("Failed to compare uploaded and downloaded samples");
        deviceSampleTransferState.upload = { type: 'error', message: 'Failed to compare uploaded and downloaded samples' };
        return false;
    }
    if (samplesDiff.areIdentical === false) {
        log.error("Uploaded and downloaded samples are not identical");
        deviceSampleTransferState.upload = { type: 'error', message: 'Uploaded and downloaded samples are not identical' };
        return false;
    }

    log.info("Successfully uploaded default samples to device");
    return true;
}

export const uplaodDeviceDefaultSamples = async () => {
    log.debug("Uploading default samples to device...");
    if (_isTransfering) {
        log.error("Transfer already in progress, aborting new upload request.");
        deviceSampleTransferState.upload = { type: 'error', message: 'Transfer already in progress' };
        return false;
    }

    const DEFAULT_SAMPLE_PACK_IDS = ['W-MIXED', 'W-UNDRGND', 'W-OLLI', 'W-OG']
    const deviceSamples = await constructSamplePacks(DEFAULT_SAMPLE_PACK_IDS);
    if (!deviceSamples) {
        log.error("Failed to construct default sample packs");
        deviceSampleTransferState.upload = { type: 'error', message: 'Failed to construct default sample packs' };
        return false;
    }
    return await uplaodDeviceSamples(deviceSamples);
}

/* checks status and uploads default if device does not have any yet */
export const initialiseDeviceSamples = async () => {
    log.debug("Initialising device samples...");
    const support = await checkDeviceSampleSupport();
    if (!support.supported) {
        log.debug("Device does not support samples, aborting initialisation.");
        return;
    }

    if (support.isSet === true) {
        log.debug("Device samples already set, no need to upload defaults.");
        return;
    }

    log.debug("Uploading default samples to device...");
    const didUpload = await uplaodDeviceDefaultSamples();
    if (!didUpload) {
        log.error("Failed to upload default samples to device during initialisation.");
        deviceSampleTransferState.upload = { type: 'error', message: 'Failed to upload default samples during initialisation' };
        return;
    }
    log.info("Successfully uploaded default samples to device during initialisation.");
    
    log.debug("Re-checking device samples after upload...");
    const supportAfter = await checkDeviceSampleSupport();
    if (!supportAfter.supported || !supportAfter.isSet) {
        log.error("Device samples still not set after uploading defaults during initialisation.");
        deviceSampleTransferState.supportCheck = { type: 'error', message: 'Device samples still not set after uploading defaults' };
    }

    return;
}
