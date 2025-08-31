import { mcumgr } from './mcumgr.svelte';
import { FirmwareManager } from '~/lib/bluetooth/mcumgr/FirmwareManager';
import { bluetoothManager } from './bluetooth.svelte';
import { parseChangelog } from '~/lib/parsers/changelog_parser';

export const firmwareManager = new FirmwareManager(mcumgr);

export const firmwareState = $state({
    firmwareVersion: null as any,
    changelog: null as any,
})

bluetoothManager.onConnect(() => {
    updateFirmwareVersion()
    updateChangelog()
});
bluetoothManager.onConnectionReestablished(() => {
    updateFirmwareVersion()
    updateChangelog()
});

bluetoothManager.onDisconnect(() => {
    firmwareState.firmwareVersion = null;
});
bluetoothManager.onConnectionLoss(() => {
    firmwareState.firmwareVersion = null;
});

const updateChangelog = async () => {
    const device_name = "MONKEY"; // TODO: use DIS instead to get the ID of the device
    const url = `/firmware/${device_name}/changelog.md?_=${Date.now()}`;
    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.text();
    const changelog = parseChangelog(data);
    firmwareState.changelog = changelog;
}

const updateFirmwareVersion = async () => {
    const fw = await firmwareManager.getFirmwareVersion();
    firmwareState.firmwareVersion = fw;
}
