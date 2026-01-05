import { tickProviderGetBpm, tickProviderSetBpm } from '~/lib/tickProvider';

export const tempoState = $state({
  bpm: tickProviderGetBpm(),
});

export function setTempo(bpm: number) {
  const value = Number(bpm);
  const next = Number.isFinite(value) ? value : 120;
  tempoState.bpm = next;
  tickProviderSetBpm(next);
}
