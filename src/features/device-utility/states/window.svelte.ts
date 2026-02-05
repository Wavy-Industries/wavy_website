export const windowState = $state({
    hash: null,
});

export function windowStateInit() {
    if (typeof window === 'undefined') return;
    windowState.hash = window.location.hash;
    window.addEventListener('hashchange', () => windowState.hash = window.location.hash);
}

export function setHash(hash: string) {
    if (typeof window === 'undefined') return;
    window.location.hash = hash;
}

export const DeviceUtilityView = {
    DeviceUpdate: 'device-update',
    SampleManager: 'pack-editor',
    DeviceTester: 'device-tester',
    Playground: 'playground',
};