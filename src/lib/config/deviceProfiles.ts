import { DeviceUtilityView } from '~/features/device-utility/states/window.svelte';

type DeviceProfile = {
    views: string[];
};

const profiles: Record<string, DeviceProfile> = {
    MONKEY: {
        views: [
            DeviceUtilityView.Playground,
            DeviceUtilityView.DeviceUpdate,
            DeviceUtilityView.SampleManager,
        ],
    },
    BRIDGE: {
        views: [
            DeviceUtilityView.Playground,
            DeviceUtilityView.DeviceUpdate,
        ],
    },
};

const fallbackProfile: DeviceProfile = {
    views: [DeviceUtilityView.Playground],
};

export function getDeviceProfile(deviceName: string | null): DeviceProfile {
    if (deviceName && deviceName in profiles) return profiles[deviceName];
    return fallbackProfile;
}

export function deviceSupports(deviceName: string | null, view: string): boolean {
    return getDeviceProfile(deviceName).views.includes(view);
}
