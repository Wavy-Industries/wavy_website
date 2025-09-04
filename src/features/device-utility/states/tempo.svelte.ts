export const tempoState = $state({
  bpm: 120,
});

export function setTempo(bpm: number) {
  const clamped = Math.max(1, Math.min(999, Math.round(bpm || 120)));
  tempoState.bpm = clamped;
}
