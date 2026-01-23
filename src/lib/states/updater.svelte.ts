import { firmwareManager } from "~/lib/states/firmware.svelte";
import { deviceSamplesState, waitForUploadToFinish } from "~/lib/states/samples.svelte";
import { Log } from "~/lib/utils/Log";
import { bluetoothManager } from "~/lib/states/bluetooth.svelte";
import { BT_DEVICE_FILTERS } from "~/lib/config/device";

const RECONNECT_TIMEOUT_MS = 30000; // 30 second timeout for auto-reconnect

const log = new Log("updater", Log.LEVEL_INFO);

export const updaterState = $state({
    stage: 'idle' as 'idle' | 'fetching' | 'uploading' | 'applying' | 'reconnect_required' | 'verifying' | 'done' | 'failed',
    uploadProgress: null as number | null,
});

let deviceReconnectedResolve: (() => void) | null = null
let isSupportedResolve: (() => void) | null = null

export function updaterNotifyIsSupported() {
    log.debug("Notifying updater that device supports samples");
    isSupportedResolve?.();
    isSupportedResolve = null;
}

export function updaterNotifyConnectionReestablished() {
    deviceReconnectedResolve?.();
    deviceReconnectedResolve = null;
}

/** Called from onConnect - also resolves reconnect promise for manual reconnect flow */
export function updaterNotifyConnected() {
    deviceReconnectedResolve?.();
    deviceReconnectedResolve = null;
}

/** Called from UI when user clicks reconnect button during reconnect_required stage */
export async function updaterTriggerReconnect() {
    if (updaterState.stage !== 'reconnect_required') return;
    await bluetoothManager.reconnectDialogue(BT_DEVICE_FILTERS);
}

export async function deviceUpdate(firmwareVersion: string) {
    try {
        updaterState.stage = 'fetching';
        log.debug(`Starting firmware update to ${firmwareVersion}`);

        const image = await fetch(`/firmware/MONKEY/app_update_${firmwareVersion}.bin`).then(res => res.arrayBuffer());
        
        updaterState.uploadProgress = null
        updaterState.stage = 'uploading';
        log.debug('Uploading firmware image...');
        const success = await firmwareManager.uploadImage(image, (percent) => {
            updaterState.uploadProgress = percent;
        });
        if (!success) { log.error('Failed to upload firmware image'); throw "failed to upload image"; }

        const deviceReconnectedPromise = new Promise<void>((resolve) => { deviceReconnectedResolve = resolve; });
        const isSupportedPromise = new Promise<void>((resolve) => { isSupportedResolve = resolve; });

        updaterState.stage = 'applying';
        log.debug('Waiting for device to apply update and reconnect...');

        // Show reconnect button after timeout (doesn't block the connection wait)
        const uiTimeoutId = setTimeout(() => {
            if (updaterState.stage === 'applying') {
                log.warning('Auto-reconnect taking too long, showing manual reconnect button');
                updaterState.stage = 'reconnect_required';
            }
        }, RECONNECT_TIMEOUT_MS);

        // Wait indefinitely for connection (either auto-reconnect or manual)
        await deviceReconnectedPromise;
        clearTimeout(uiTimeoutId);
        
        updaterState.stage = 'verifying';
        log.debug('Verifying updated firmware version...');
        const newFirmware = await firmwareManager.getFirmwareVersion();
        if (newFirmware?.versionString !== firmwareVersion) {
            throw new Error(`Update failed: Device firmware version is ${newFirmware?.versionString} but expected ${firmwareVersion}`);
        }

        await isSupportedPromise;
        if (deviceSamplesState.isSupported === true) {
            log.debug('Waiting for sample sync to finish...');
            await waitForUploadToFinish();
        }
        
        updaterState.stage = 'done';
        log.info('Firmware update completed successfully');
        await new Promise(resolve => setTimeout(resolve, 2000));
        updaterState.stage = 'idle';
        updaterState.uploadProgress = 0;
    } catch (e) {
        console.log(e)
        log.error(`Firmware update failed: ${String(e)}`);
        updaterState.stage = 'failed'
        await new Promise(resolve => setTimeout(resolve, 2000));
        updaterState.stage = 'idle';
    }
}
