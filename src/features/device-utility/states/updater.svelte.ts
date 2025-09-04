import { firmwareManager } from "./firmware.svelte";
import { deviceSamplesState, sampleManager } from "./samplesDevice.svelte";
import { Log } from "~/lib/utils/Log";

const log = new Log("updater", Log.LEVEL_DEBUG);


export const updaterState = $state({
    stage: 'idle' as 'idle' | 'fetching' | 'uploading' | 'applying' | 'verifying' | 'done' | 'failed',
    uploadProgress: null,
});


// promise variable to see when device has reconnected
let deviceReconnectedResolve = null
let isSupportedResolve = null

export function updaterNotifyIsSupported() {
    log.debug("Notifying updater that device supports samples");
    isSupportedResolve?.();
    isSupportedResolve = null;
}

export function updaterNotifyConnectionReestablished() {
    deviceReconnectedResolve?.();
    deviceReconnectedResolve = null;
}

export async function deviceUpdate(firmwareVersion: string) {
    try {
        updaterState.stage = 'fetching';

        const image = await fetch(`/firmware/MONKEY/app_update_${firmwareVersion}.bin`)
        .then(res => res.arrayBuffer());
        
        updaterState.uploadProgress = null
        updaterState.stage = 'uploading';
        const success = await firmwareManager.uploadImage(image, (percent) => {
            updaterState.uploadProgress = percent;
        });
        if (!success) {
            throw "failed to upload image"
        }

        // we create the prmise here
        const deviceReconnectedPromise = new Promise((resolve) => deviceReconnectedResolve = resolve);
        const isSupportedPromise = new Promise((resolve) => isSupportedResolve = resolve);
        
        updaterState.stage = 'applying';
        await deviceReconnectedPromise;
        
        updaterState.stage = 'verifying';
        const newFirmware = await firmwareManager.getFirmwareVersion();
        if (newFirmware.versionString !== firmwareVersion) {
            throw new Error(`Update failed: Device firmware version is ${newFirmware.versionString} but expected ${firmwareVersion}`);
        }

        await isSupportedPromise;

        if (deviceSamplesState.isSupported === true) {
            await sampleManager.waitForUploadToFinish();
        }
        
        updaterState.stage = 'done';
        await new Promise(resolve => setTimeout(resolve, 2000));
        updaterState.stage = 'idle';
        updaterState.uploadProgress = 0;
    } catch (e) {
        console.log(e)
        updaterState.stage = 'failed'
        await new Promise(resolve => setTimeout(resolve, 2000));
        updaterState.stage = 'idle';
    }
}

