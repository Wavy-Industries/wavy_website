import { generateSamplePack } from '~/js/data/samplePack';
import { bluetoothManager } from './Bluetooth.svelte';
import { mcumgr } from './mcumgr.svelte';
import { SampleManager } from '~/js/mcumgr/SampleManager';
import { canonicalize } from '~/js/utilities.js'

export const sampleManager = new SampleManager(mcumgr);

type Nullable<T> = T | null;

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
});

// Default DRM page IDs
export const DEFAULT_PAGE_IDS = [
    'MIXED', 'UNDRGND', 'OLLI', 'OG',
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
    };

    bluetoothManager.onConnect(onConnected);
    bluetoothManager.onConnectionReestablished(onConnected);
    // We intentionally do not reset on onDisconnect here because the app reloads.
}

// Initialize on module import
initializeSampleLifecycle();
