export const deviceState = $state({
  octave: 0, // Current octave offset from device
  bpm: 120, // Current BPM from device
});

export function setDeviceOctave(octave: number) {
  deviceState.octave = Math.max(-3, Math.min(3, octave));
}

export function setDeviceBPM(bpm: number) {
  deviceState.bpm = Math.max(1, Math.min(999, Math.round(bpm)));
}
