import { smpService } from '~/lib/states/bluetooth.svelte';
import { FirmwareManager, FirmwareVersion } from '~/lib/bluetooth/smp/FirmwareManager';
import { Changelog, parseChangelog } from '~/lib/parsers/changelog_parser';
import { firmwareRhsIsNewer } from '~/lib/bluetooth/smp/FirmwareManager';
import { disState } from '~/features/device-utility/states/dis.svelte';

import { Log } from '~/lib/utils/Log';
const LOG_LEVEL = Log.LEVEL_INFO
const log = new Log("firmware-state", LOG_LEVEL);

// Lazy initialization to avoid circular dependency
let _firmwareManager: FirmwareManager | null = null;
function getFirmwareManager(): FirmwareManager {
  if (!_firmwareManager) {
    _firmwareManager = new FirmwareManager(smpService);
  }
  return _firmwareManager;
}

// Keep firmwareManager export for backward compatibility
export const firmwareManager = {
  getFirmwareVersion: () => getFirmwareManager().getFirmwareVersion(),
  uploadImage: (image: ArrayBuffer, onProgress?: (percent: number) => void) => 
    getFirmwareManager().uploadImage(image, onProgress),
};

export const firmwareState = $state({
    firmwareVersion: null as (FirmwareVersion | null),
    changelog: null as (Changelog | null),
    isSupported: null as (boolean | null),
    get upgradeAvailable() {
        const fw = this.firmwareVersion;
        const rel = this.changelog?.release;
        if (!fw || !rel) return false;
        return firmwareRhsIsNewer(fw, rel);
    },
    
    get downgradeAvailable() {
        const fw = this.firmwareVersion;
        const rel = this.changelog?.release;
        if (!fw || !rel) return false;
        return firmwareRhsIsNewer(rel, fw);
    }
})

// Indicators for upgrade/downgrade availability
// export const upgradeAvailable = $derived.by(() => {
//     const fw = firmwareState?.firmwareVersion;
//     const rel = firmwareState?.changelog?.release;
//     if (!fw || !rel) return false;
//     return firmwareRhsIsNewer(fw, rel);
// });
// export const downgradeAvailable = $derived.by(() => {
//     const fw = firmwareState?.firmwareVersion;
//     const rel = firmwareState?.changelog?.release;
//     if (!fw || !rel) return false;
//     // fw > rel → downgrade available
//     return firmwareRhsIsNewer(rel, fw);
// });

export async function refreshChangelog() {
    try {
        const url = `/firmware/${disState.modelNumber}/changelog.md?_=${Date.now()}`;
        const response = await fetch(url, { cache: 'no-store' });
        const data = await response.text();
        const changelog = parseChangelog(data);
        firmwareState.changelog = changelog;
    } catch (error) {
        console.error('Error fetching changelog:', error);
        firmwareState.changelog = null;
    }
}

export const refreshDeviceFirmwareVersion = async () => {
    const fw = await getFirmwareManager().getFirmwareVersion();
    if (fw) {
        firmwareState.isSupported = true;
        firmwareState.firmwareVersion = fw;
    } else {
        log.info("Device does not support firmware updates (MCUmgr/SMP)");
        firmwareState.isSupported = false;
        firmwareState.firmwareVersion = null;
    }
}

export function resetFirmwareState() {
    firmwareState.firmwareVersion = null;
    firmwareState.isSupported = null;
}
