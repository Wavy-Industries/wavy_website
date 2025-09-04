import { soundBackend, type SynthChannelConfig } from '~/lib/soundBackend';

type MidiEvt =
  | { kind: 'noteon'; note: number; velocity: number; channel: number; ts: number; id?: number }
  | { kind: 'noteoff'; note: number; velocity: number; channel: number; ts: number; id?: number }
  | { kind: 'cc'; controller: number; value: number; channel: number; ts: number; id?: number };

const MAX_PER_CH = 50;

// Playground UI only needs channels 0..15 but we display 0..9; keep 16 for safety
export const midiControlState = $state({
  events: Array.from({ length: 16 }, () => [] as MidiEvt[]),
});

let _id = 1;
function pushEvent(evt: MidiEvt) {
  const ch = Math.max(0, Math.min(15, evt.channel | 0));
  const list = midiControlState.events[ch];
  list.push({ ...evt, id: _id++ } as MidiEvt);
  if (list.length > MAX_PER_CH) list.splice(0, list.length - MAX_PER_CH);
  // ensure $state propagation for nested array mutation
  midiControlState.events = [...midiControlState.events];
}

export const midiControlOnNoteOn = (note: number, velocity: number, channel: number) =>
  pushEvent({ kind: 'noteon', note, velocity, channel, ts: Date.now() });
export const midiControlOnNoteOff = (note: number, velocity: number, channel: number) =>
  pushEvent({ kind: 'noteoff', note, velocity, channel, ts: Date.now() });
export const midiControlOnCC = (controller: number, value: number, channel: number) =>
  pushEvent({ kind: 'cc', controller, value, channel, ts: Date.now() });

// ---------------- Playground synth persistence + UI helpers ----------------
export const PLAYGROUND_STORAGE_KEY = 'wavy_playground_synth_cfg_v1';

// Baseline defaults captured on first init (non-drum channels 0..8)
const baseline: (SynthChannelConfig | null)[] = Array.from({ length: 16 }, () => null);

export const playgroundUI = $state({ refreshKey: 0 });

export function initPlaygroundSynthPersistence() {
  // Capture per-channel baseline before applying any saved overrides
  for (let ch = 0; ch < 10; ch++) {
    if (ch === 9) continue; // skip drums
    try { baseline[ch] = soundBackend.getChannelConfig(ch); } catch {}
  }
  // Apply saved patches from localStorage
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(PLAYGROUND_STORAGE_KEY);
      const saved = raw ? JSON.parse(raw) : {};
      for (let ch = 0; ch < 10; ch++) {
        if (ch === 9) continue;
        const cfg = saved?.[String(ch)];
        if (cfg && typeof cfg === 'object') {
          soundBackend.setChannelConfig(ch, cfg);
        }
      }
    } catch {}
  }
}

export function resetAllSynthChannels() {
  // Restore baseline for all non-drum channels and clear saved overrides
  for (let ch = 0; ch < 10; ch++) {
    if (ch === 9) continue;
    const def = baseline[ch];
    if (def) {
      try { soundBackend.setChannelConfig(ch, def); } catch {}
    }
  }
  if (typeof window !== 'undefined') {
    try { localStorage.setItem(PLAYGROUND_STORAGE_KEY, JSON.stringify({})); } catch {}
  }
  playgroundUI.refreshKey++;
}

export function resetSynthChannel(ch: number) {
  if (ch === 9) return; // no synth editor for drums
  const def = baseline[ch];
  if (def) {
    try {
      soundBackend.setChannelConfig(ch, def);
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem(PLAYGROUND_STORAGE_KEY);
        const obj = raw ? JSON.parse(raw) : {};
        delete obj[String(ch)];
        localStorage.setItem(PLAYGROUND_STORAGE_KEY, JSON.stringify(obj));
      }
    } catch {}
    playgroundUI.refreshKey++;
  }
}
