/* Shared device samples state/API for use across features */
import { DeviceSamples } from '~/lib/parsers/samples_parser';
import { smpService } from '~/lib/states/bluetooth.svelte';
import { SampleManager } from '~/lib/bluetooth/smp/SampleManager';
import { canonicalize } from '~/lib/utils/canonicalize';
import { Log } from '~/lib/utils/Log';

const LOG_LEVEL = Log.LEVEL_DEBUG;
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

export const deviceSamplesState = $state(DEFAULT_STATE);
export const invalidateDeviceSamplesState = () => Object.assign(deviceSamplesState, DEFAULT_STATE);

type SampleTransferState =
    | { type: 'idle' }
    | { type: 'transferring'; progress: number | null }
    | { type: 'error'; message: string };

export const deviceSampleTransferState = $state({
    supportCheck: { type: 'idle' } as SampleTransferState,
    download: { type: 'idle' } as SampleTransferState,
    upload: { type: 'idle' } as SampleTransferState,
});

const _isTransfering = $derived(
    deviceSampleTransferState.supportCheck.type === 'transferring' || 
    deviceSampleTransferState.download.type === 'transferring' || 
    deviceSampleTransferState.upload.type === 'transferring'
);

interface SupportCheckResult { supported: boolean; isSet: boolean | null; }

export const checkDeviceSampleSupport = async (): Promise<SupportCheckResult> => {
    log.debug('Checking if device supports samples...');
    
    // Safety Force Reset
    if (_isTransfering) {
        log.warning('Transfer already in progress, resetting state for new support check.');
        deviceSampleTransferState.supportCheck = { type: 'idle' };
        deviceSampleTransferState.download = { type: 'idle' };
        deviceSampleTransferState.upload = { type: 'idle' };
    }

    deviceSampleTransferState.supportCheck = { type: 'transferring', progress: null };

    try {
        const isSet = await sampleManager.isSet();
        deviceSamplesState.isSupported = true;
        deviceSamplesState.isSet = isSet;
        log.info(`Device supports samples, isSet = ${isSet}`);

        if (isSet === true) {
            try {
                log.debug('Getting space used');
                const spaceUsed = await sampleManager.getSpaceUsed();
                deviceSamplesState.storageTotal = spaceUsed.tot;
                deviceSamplesState.storageUsed = spaceUsed.usd;
                deviceSamplesState.packsStorageUsed = spaceUsed.packs;
            } catch (e) {
                log.error("Failed to get space metadata, but continuing...", e);
            }

            log.debug('Getting IDs');
            let ids = await sampleManager.getIDs();
            ids = ids.map(id => id ? id[0] + "-" + id.slice(1) : null);
            if (ids.length > 0) ids.push(ids.shift() || null);
            deviceSamplesState.ids = ids;
        }
    } catch (err) {
        log.error('Support check failed:', err);
    } finally {
        deviceSampleTransferState.supportCheck = { type: 'idle' };
    }

    return { supported: !!deviceSamplesState.isSupported, isSet: deviceSamplesState.isSet };
}

export const downloadDeviceSamples = async (): Promise<DeviceSamples | null> => {
    if (_isTransfering) return null;
    if (deviceSamplesState.isSet !== true) return null;

    deviceSampleTransferState.download = { type: 'transferring', progress: null };
    try {
        const samples = await sampleManager.downloadSamples((val) => { 
            deviceSampleTransferState.download = { type: 'transferring', progress: val }; 
        });
        if (samples == null) throw new Error('Null download');
        deviceSamplesState.deviceSamples = samples;
        deviceSampleTransferState.download = { type: 'idle' };
        return samples;
    } catch (err) {
        log.error('Download failed:', err);
        deviceSampleTransferState.download = { type: 'error', message: 'Download failed' };
        return null;
    } finally {
        if (deviceSampleTransferState.download.type === 'transferring') {
            deviceSampleTransferState.download = { type: 'idle' };
        }
    }
}

export const uplaodDeviceSamples = async (newSamples: DeviceSamples): Promise<boolean> => {
    if (_isTransfering) return false;
    deviceSampleTransferState.upload = { type: 'transferring', progress: null };

    try {
        const success = await sampleManager.uploadSamples(newSamples, (val) => { 
            deviceSampleTransferState.upload = { type: 'transferring', progress: val }; 
        });

        if (!success) throw new Error('Upload failed');
        await new Promise(r => setTimeout(r, 1000));
        deviceSampleTransferState.upload = { type: 'idle' };

        // Post-upload sync
        await checkDeviceSampleSupport();
        await downloadDeviceSamples();
        return true;
    } catch (err) {
        log.error('uplaodDeviceSamples failed:', err);
        deviceSampleTransferState.upload = { type: 'error', message: String(err) };
        return false;
    } finally {
        if (deviceSampleTransferState.upload.type === 'transferring') {
            deviceSampleTransferState.upload = { type: 'idle' };
        }
    }
}

export const DEFAULT_SAMPLE_PACK_IDS = ['W-MIXED', 'W-UNDRGND', 'W-OLLI', 'W-OG']
export const uplaodDeviceDefaultSamples = async () => {
    if (_isTransfering) return false;
    const deviceSamples = await buildDeviceSamplesFromIds(DEFAULT_SAMPLE_PACK_IDS);
    if (!deviceSamples) return false;
    return await uplaodDeviceSamples(deviceSamples);
}

export const initialiseDeviceSamples = async () => {
    log.debug('Initialising device samples...');
    if (sampleManager) sampleManager.resetState();
    await new Promise(r => setTimeout(r, 1000));

    try {
        const support = await checkDeviceSampleSupport();
        if (!support.supported) return;

        if (support.isSet !== true) {
            await new Promise(r => setTimeout(r, 500));
            await uplaodDeviceDefaultSamples();
            await new Promise(r => setTimeout(r, 1000));
            await checkDeviceSampleSupport();
        }
        await new Promise(r => setTimeout(r, 500));
        await downloadDeviceSamples();
    } catch (err) {
        log.error("Initialization failed:", err);
    }
};

export const waitForUploadToFinish = async () => {
    while (_isTransfering) {
        await new Promise(r => setTimeout(r, 100));
    }
}

// Internal builders remain same...
const fetchServerPack = async (id: string): Promise<SamplePack | null> => {
    try {
        const DEVICE_NAME = 'MONKEY';
        const res = await fetch(`/samples/${DEVICE_NAME}/DRM/${encodeURIComponent(id)}.json`);
        if (!res.ok) return null;
        const pack = await res.json();
        pack.name = id;
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

const samplePackEqual = (a: any, b: any): boolean => {
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
        if (!samplePackEqual(a.pages[i], b.pages[i])) return false;
    }
    return true;
}
