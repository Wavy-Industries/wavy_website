import type { DeviceStateSnapshot } from '~/lib/bluetooth/DeviceStateService';

export const deviceState = $state({
  isAvailable: null as (boolean | null),
  octave: 0, // Current octave offset from device
  bpm: 120, // Current BPM from device (falls back to 120 until device reports)
  bpmFromDevice: false,
  channel: null as number | null,
  muteMask: null as number | null,
  playback: null as boolean | null,
  recording: null as boolean | null,
  effectId: null as number | null,
  effectPreset: null as number | null,
  hold: null as boolean | null,
  undoSession: null as number | null,
  powerState: null as number | null,
  btConnInterval: null as number | null,
  btConnLatency: null as number | null,
  btConnTimeout: null as number | null,
  btMtuRx: null as number | null,
  btMtuTx: null as number | null,
});

export function resetDeviceState() {
  deviceState.isAvailable = null;
  deviceState.octave = 0;
  deviceState.bpm = 120;
  deviceState.bpmFromDevice = false;
  deviceState.channel = null;
  deviceState.muteMask = null;
  deviceState.playback = null;
  deviceState.recording = null;
  deviceState.effectId = null;
  deviceState.effectPreset = null;
  deviceState.hold = null;
  deviceState.undoSession = null;
  deviceState.powerState = null;
  deviceState.btConnInterval = null;
  deviceState.btConnLatency = null;
  deviceState.btConnTimeout = null;
  deviceState.btMtuRx = null;
  deviceState.btMtuTx = null;
}

export function setDeviceOctave(octave: number) {
  deviceState.octave = octave;
}

export function setDeviceBPM(bpm: number) {
  deviceState.bpm = bpm;
  deviceState.bpmFromDevice = true;
}

// Keep a single path for updating the visible device state from BLE snapshots.
export function setDeviceStateFromSnapshot(state: DeviceStateSnapshot) {
  if (state.octave !== null) setDeviceOctave(state.octave);
  if (state.channel !== null) deviceState.channel = state.channel;
  if (state.muteMask !== null) deviceState.muteMask = state.muteMask;
  if (state.playback !== null) deviceState.playback = state.playback;
  if (state.recording !== null) deviceState.recording = state.recording;
  if (state.bpm !== null) setDeviceBPM(state.bpm);
  if (state.effectId !== null) deviceState.effectId = state.effectId;
  if (state.effectPreset !== null) deviceState.effectPreset = state.effectPreset;
  if (state.hold !== null) deviceState.hold = state.hold;
  if (state.undoSession !== null) deviceState.undoSession = state.undoSession;
  if (state.powerState !== null) deviceState.powerState = state.powerState;
  if (state.btConnInterval !== null) deviceState.btConnInterval = state.btConnInterval;
  if (state.btConnLatency !== null) deviceState.btConnLatency = state.btConnLatency;
  if (state.btConnTimeout !== null) deviceState.btConnTimeout = state.btConnTimeout;
  if (state.btMtuRx !== null) deviceState.btMtuRx = state.btMtuRx;
  if (state.btMtuTx !== null) deviceState.btMtuTx = state.btMtuTx;
}
