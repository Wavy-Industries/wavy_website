import { smpService } from './bluetooth.svelte';
import { FirmwareManager, FirmwareVersion } from '~/lib/bluetooth/smp/FirmwareManager';
import { Changelog, parseChangelog } from '~/lib/parsers/changelog_parser';

import { Log } from '~/lib/utils/Log';
const LOG_LEVEL = Log.LEVEL_INFO
const log = new Log("firmware-state", LOG_LEVEL);

export const firmwareManager = new FirmwareManager(smpService);

export const firmwareState = $state({
    firmwareVersion: null as (FirmwareVersion | null),
    changelog: null as (Changelog | null),
})

export async function refreshChangelog() {
    // TODO: this function should be called after we have fetched the device name from DIS.
    try {
        const device_name = "MONKEY"; // TODO: use DIS instead to get the ID of the device
        const url = `/firmware/${device_name}/changelog.md?_=${Date.now()}`;
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
    const fw = await firmwareManager.getFirmwareVersion();
    if (!fw) { log.error("Failed to get firmware version from device"); }
    firmwareState.firmwareVersion = fw;
}
