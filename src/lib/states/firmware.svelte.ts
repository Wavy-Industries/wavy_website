import { smpService, bluetoothManager } from '~/lib/states/bluetooth.svelte';
import { FirmwareManager, FirmwareVersion } from '~/lib/bluetooth/smp/FirmwareManager';
import { Changelog, parseChangelog } from '~/lib/parsers/changelog_parser';

import { Log } from '~/lib/utils/Log';
const LOG_LEVEL = Log.LEVEL_INFO
const log = new Log("firmware-state", LOG_LEVEL);

export const firmwareManager = new FirmwareManager(smpService);

export const firmwareState = $state({
    firmwareVersion: null as (FirmwareVersion | null),
    changelog: null as (Changelog | null),
    isSupported: null as (boolean | null),
})

export async function refreshChangelog() {
    try {
        const url = `/firmware/${bluetoothManager.getDeviceName()}/changelog.md?_=${Date.now()}`;
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
    // Note: changelog is not reset as it's fetched from the server, not the device
}

