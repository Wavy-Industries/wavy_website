import { parseMidiToLoop } from '~/lib/parsers/device_sample_parser';
import { TICKS_PER_BEAT, type LoopData, type DrumEvent } from '~/lib/parsers/device_samples_parser';
import { computeLoopEndTicks } from '~/lib/music/loop_utils';
import { soundBackend } from '~/lib/soundBackend';

const normalizeBpm = (bpm: number): number => {
  const value = Number(bpm);
  return Number.isFinite(value) ? value : 120;
};

export const clampVelocity = (velocity: number | null | undefined): number => {
  return Math.max(0, Math.min(127, velocity ?? 100));
};

export async function parseMidiFile(file: File): Promise<LoopData> {
  const buf = await file.arrayBuffer();
  const { loop } = parseMidiToLoop(buf);
  return loop;
}

export type LoopEventIndex = {
  onByTick: DrumEvent[][];
  offByTick: DrumEvent[][];
  loopLengthTicks: number;
};

// Pre-index loop events by tick so tick-driven playback stays constant-time per tick.
export function indexLoopEvents(loop: LoopData, loopLengthTicks: number, defaultReleaseTicks: number): LoopEventIndex {
  const length = Math.max(1, Math.floor(loopLengthTicks) || 1);
  const onByTick = Array.from({ length }, () => [] as DrumEvent[]);
  const offByTick = Array.from({ length }, () => [] as DrumEvent[]);

  for (const ev of loop.events || []) {
    const press = Number(ev.time_ticks_press) || 0;
    const release = Number(ev.time_ticks_release ?? (press + defaultReleaseTicks));
    const pressTick = Math.max(0, press % length);
    const releaseTick = Math.max(0, release % length);
    onByTick[pressTick].push(ev);
    offByTick[releaseTick].push(ev);
  }

  return { onByTick, offByTick, loopLengthTicks: length };
}

export function scheduleLoopNotes(
  loop: LoopData | null | undefined,
  opts: {
    bpm: number;
    channel: number;
    startMs: number;
    durationTicks?: number;
    ticksPerBeat?: number;
    defaultReleaseTicks?: number;
    shouldPlay?: () => boolean;
  }
): { timeoutIds: number[]; durationMs: number; durationTicks: number; msPerTick: number } {
  if (!loop) {
    return { timeoutIds: [], durationMs: 0, durationTicks: 0, msPerTick: 0 };
  }

  const ticksPerBeat = opts.ticksPerBeat ?? TICKS_PER_BEAT;
  const bpm = normalizeBpm(opts.bpm);
  const msPerBeat = (60 / bpm) * 1000;
  const msPerTick = msPerBeat / ticksPerBeat;
  const defaultRelease = opts.defaultReleaseTicks ?? 1;
  const durationTicks = Math.max(
    1,
    Number(opts.durationTicks) || computeLoopEndTicks(loop, { ticksPerBeat })
  );
  const durationMs = durationTicks * msPerTick;
  const timeouts: number[] = [];
  const shouldPlay = opts.shouldPlay;
  const channel = opts.channel;
  const startMs = opts.startMs;

  for (const ev of loop.events || []) {
    const press = Number(ev.time_ticks_press) || 0;
    const release = Number(ev.time_ticks_release ?? (press + defaultRelease));
    const onAt = startMs + press * msPerTick;
    const offAt = startMs + release * msPerTick;
    const vel = clampVelocity(ev.velocity);
    timeouts.push(window.setTimeout(() => {
      if (shouldPlay && !shouldPlay()) return;
      soundBackend.noteOn(ev.note, vel, channel);
    }, Math.max(0, onAt - performance.now())));
    timeouts.push(window.setTimeout(() => {
      if (shouldPlay && !shouldPlay()) return;
      soundBackend.noteOff(ev.note, 0, channel);
    }, Math.max(0, offAt - performance.now())));
  }

  return { timeoutIds: timeouts, durationMs, durationTicks, msPerTick };
}
