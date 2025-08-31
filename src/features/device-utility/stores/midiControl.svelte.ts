import { midiManager } from '~/features/device-utility/stores/midi.svelte';

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

// Attach once (persist across HMR)
const G: any = (globalThis as any);
if (!G.__wavy_midi_control_attached) {
  G.__wavy_midi_control_attached = true;
  G.__wavy_midi_control_onNoteOn ||= ((note: number, velocity: number, channel: number) => pushEvent({ kind: 'noteon', note, velocity, channel, ts: Date.now() }));
  G.__wavy_midi_control_onNoteOff ||= ((note: number, velocity: number, channel: number) => pushEvent({ kind: 'noteoff', note, velocity, channel, ts: Date.now() }));
  G.__wavy_midi_control_onCC ||= ((controller: number, value: number, channel: number) => pushEvent({ kind: 'cc', controller, value, channel, ts: Date.now() }));
  midiManager.onNoteOn(G.__wavy_midi_control_onNoteOn);
  midiManager.onNoteOff(G.__wavy_midi_control_onNoteOff);
  midiManager.onControlChange(G.__wavy_midi_control_onCC);
}

export function setBpm(bpm: number) {
  midiControlState.bpm = Math.max(1, Math.min(999, Math.round(bpm)));
}
