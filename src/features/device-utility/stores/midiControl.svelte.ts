import { midiManager } from '~/features/device-utility/stores/midiTester.svelte';

type MidiEvt =
  | { id: number; kind: 'noteon'; note: number; velocity: number; channel: number; ts: number }
  | { id: number; kind: 'noteoff'; note: number; velocity: number; channel: number; ts: number }
  | { id: number; kind: 'cc'; controller: number; value: number; channel: number; ts: number };

const MAX_PER_CH = 50;

export const midiControlState = $state({
  bpm: 120,
  // per-channel event logs
  events: Array.from({ length: 16 }, () => [] as MidiEvt[]),
});

let _id = 1;
function pushEvent(evt: MidiEvt) {
  const ch = Math.max(0, Math.min(15, evt.channel|0));
  const list = midiControlState.events[ch];
  list.push({ ...evt, id: _id++ } as MidiEvt);
  if (list.length > MAX_PER_CH) list.splice(0, list.length - MAX_PER_CH);
  // Reassign to trigger reactivity for Svelte runes
  midiControlState.events = [...midiControlState.events];
}

// Declarative: exported init to attach once, HMR-safe without globalThis
const H = (import.meta as any).hot;
const DATA: any = H?.data || (H ? (H.data = {}) : {});

export function initMidiControl() {
  if (DATA.__wavy_midi_control_attached) return;
  DATA.__wavy_midi_control_attached = true;
  const onNoteOn = (note: number, velocity: number, channel: number) => pushEvent({ kind: 'noteon', note, velocity, channel, ts: Date.now() });
  const onNoteOff = (note: number, velocity: number, channel: number) => pushEvent({ kind: 'noteoff', note, velocity, channel, ts: Date.now() });
  const onCC = (controller: number, value: number, channel: number) => pushEvent({ kind: 'cc', controller, value, channel, ts: Date.now() });
  DATA.__wavy_midi_control_handlers = { onNoteOn, onNoteOff, onCC };
  midiManager.onNoteOn(onNoteOn);
  midiManager.onNoteOff(onNoteOff);
  midiManager.onControlChange(onCC);
}

export function setBpm(bpm: number) {
  midiControlState.bpm = Math.max(1, Math.min(999, Math.round(bpm)));
}
