
export const windowState = $state({
  hash: null,
});

export function windowStateInit() {
  if (typeof window === 'undefined') return;

  windowState.hash = window.location.hash;
  window.addEventListener('hashchange', () => windowState.hash = window.location.hash);
}

export const DeviceUtilityView = {
  DeviceUpdate: 'device-update',
  SampleManager: 'sample-manager',
  DeviceTester: 'device-tester',
  Playground: 'playground',
};