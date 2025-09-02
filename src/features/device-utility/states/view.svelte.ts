import { dev } from './devmode.svelte';
import { sampleState } from './samples.svelte';

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
  current: DeviceUtilityView.Playground,
});

$effect.root(() => {
  updadteViewFromHash()
});

function updadteViewFromHash(): void {
  const hash = window.location.hash;
  const v = (hash || '').replace('#', '').trim();

  let view: string = DeviceUtilityView.Playground;
  if (sampleState.isSupported && v === DeviceUtilityView.SampleManager) view = DeviceUtilityView.SampleManager;
  if (v === DeviceUtilityView.Playground) view = DeviceUtilityView.Playground;
  if (v === DeviceUtilityView.DeviceUpdate) view = DeviceUtilityView.DeviceUpdate;
  if (dev.enabled && v === DeviceUtilityView.DeviceTester) view = DeviceUtilityView.DeviceTester;

  deviceUtilityView.current = view as DeviceUtilityViewKey;
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

  window.addEventListener('hashchange', updadteViewFromHash);
}
