import { TICKS_PER_BEAT, type LoopData } from '~/lib/parsers/samples_parser';

// Derive loop length (in beats) from events using power-of-two bars, clamped
// - Bars are 4 beats. We round up to the next power of two in bars.
// - Min 4 beats, max 16 beats (device validation caps at 16).
export function computeLoopLengthBeatsFromEvents(
  events: Array<{ time_ticks_release: number }>,
  opts?: { minBeats?: number; maxBeats?: number; ticksPerBeat?: number }
): number {
  const tpq = opts?.ticksPerBeat ?? TICKS_PER_BEAT;
  const minBeats = Math.max(1, opts?.minBeats ?? 4);
  const maxBeats = Math.max(minBeats, opts?.maxBeats ?? 16);
  let maxTick = 0;
  for (const ev of events || []) {
    const r = Number((ev as any)?.time_ticks_release) || 0;
    if (r > maxTick) maxTick = r;
  }
  const ticks = Math.max(1, maxTick);
  const barsExact = ticks / (tpq * 4);
  const barsPow2 = Math.max(1, Math.pow(2, Math.ceil(Math.log2(barsExact || 1))));
  const beats = barsPow2 * 4;
  return Math.max(minBeats, Math.min(maxBeats, beats));
}

// Compute the loop end in ticks for display/scheduling purposes
export function computeLoopEndTicks(loop: LoopData | null, opts?: { ticksPerBeat?: number }): number {
  if (!loop) return 16 * (opts?.ticksPerBeat ?? TICKS_PER_BEAT);
  const tpq = opts?.ticksPerBeat ?? TICKS_PER_BEAT;
  const fromLen = (Number(loop.length_beats) || 0) * tpq;
  let last = 0;
  for (const ev of loop.events || []) {
    const r = Number((ev as any)?.time_ticks_release) || 0;
    if (r > last) last = r;
  }
  return Math.max(fromLen, last);
}

