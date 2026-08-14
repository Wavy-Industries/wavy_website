import { DeviceUtilityView } from '~/features/device-utility/states/window.svelte';
import monkeyIcon from '~/assets/monkey/monkey_face.svg';
import bridgeIcon from '~/assets/bridge/bridge_icon.svg';

type DeviceProfile = {
    views: string[];
    icon: string | null;
};

const profiles: Record<string, DeviceProfile> = {
    MONKEY: {
        views: [
            DeviceUtilityView.Playground,
            DeviceUtilityView.DeviceUpdate,
            DeviceUtilityView.SampleManager,
        ],
        icon: monkeyIcon.src,
    },
    BRIDGE: {
        views: [
            DeviceUtilityView.Playground,
            DeviceUtilityView.DeviceUpdate,
        ],
        icon: bridgeIcon.src,
    }
};

const fallbackProfile: DeviceProfile = {
    views: [DeviceUtilityView.Playground],
    icon: null,
};

// WIMKY002_DEV1 lacks the LFXO crystal and must never receive WIMKY002 builds
const HW_TO_FIRMWARE_FOLDER: Record<string, string> = {
    WIMKY001: 'WIMKY001',
    WIMKY002: 'WIMKY002',
    WIMKY002_DEV1: 'WIMKY002_DEV1',
    WIMKY002V1: 'WIMKY002_DEV1', // pre-1.6 firmware reports the old name for WIMKY002_DEV1
    WIBRG001: 'BRIDGE',
    WIBRG002: 'BRIDGE',
};

export function getFirmwareFolder(hardwareRevision: string | null): string | null {
    if (!hardwareRevision) return null;
    return HW_TO_FIRMWARE_FOLDER[hardwareRevision] ?? null;
}

export function getDeviceProfile(deviceName: string | null): DeviceProfile {
    if (deviceName && deviceName in profiles) return profiles[deviceName];
    return fallbackProfile;
}

export function deviceSupports(deviceName: string | null, view: string): boolean {
    return getDeviceProfile(deviceName).views.includes(view);
}

export function getDeviceIcon(deviceName: string | null): string | null {
    return getDeviceProfile(deviceName).icon;
}
