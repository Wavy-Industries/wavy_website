import { devMode } from './devmode.svelte';

// Canonical view names and their hash values
export const DeviceUtilityView = {
  DeviceUpdate: 'device-update',
  SampleManager: 'sample-manager',
  DeviceTester: 'device-tester',
  Playground: 'playground',
} as const;

export type DeviceUtilityViewKey = typeof DeviceUtilityView[keyof typeof DeviceUtilityView];

// Wrap the value to avoid reassigning the exported state object
export const deviceUtilityView = $state<{ current: DeviceUtilityViewKey }>({
  current: DeviceUtilityView.DeviceUpdate,
});

function getStoreValue<T>(store: { subscribe: (fn: (v: T) => void) => () => void }): T {
  let value!: T;
  const unsub = store.subscribe((v) => (value = v));
  unsub();
  return value;
}

function coerceViewFromHash(hash: string): DeviceUtilityViewKey {
  const v = (hash || '').replace('#', '').trim();
  if (v === DeviceUtilityView.SampleManager) return DeviceUtilityView.SampleManager;
  if (v === DeviceUtilityView.Playground) return DeviceUtilityView.Playground;
  if (v === DeviceUtilityView.DeviceUpdate) return DeviceUtilityView.DeviceUpdate;
  if (v === DeviceUtilityView.DeviceTester) {
    // Only allow if dev mode is enabled
    return getStoreValue(devMode) ? DeviceUtilityView.DeviceTester : DeviceUtilityView.DeviceUpdate;
  }

  // Default view
  return DeviceUtilityView.Playground;
}

export function setDeviceUtilityView(view: DeviceUtilityViewKey) {
  // Update URL hash and state
  if (typeof window !== 'undefined') {
    window.location.hash = view;
  }
  deviceUtilityView.current = view;
}

export function initDeviceUtilityView() {
  if (typeof window === 'undefined') return;
  const apply = () => {
    const next = coerceViewFromHash(window.location.hash);
    deviceUtilityView.current = next;
  };
  window.addEventListener('hashchange', apply);
  // Initialize once on load
  apply();
}
