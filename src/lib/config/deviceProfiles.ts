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

const HW_TO_FIRMWARE_FOLDER: Record<string, string> = {
    WIMKY001: 'MONKEY',
    WIMKY002: 'MONKEY',
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
