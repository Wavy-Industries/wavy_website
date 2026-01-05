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
});

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
}
