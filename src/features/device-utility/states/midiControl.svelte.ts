
type MidiEvt =
  | { kind: 'noteon'; note: number; velocity: number; channel: number; ts: number; id?: number;  }
  | { kind: 'noteoff'; note: number; velocity: number; channel: number; ts: number; id?: number;  }
  | { kind: 'cc'; controller: number; value: number; channel: number; ts: number; id?: number;  };

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

export const midiControlOnNoteOn = (note: number, velocity: number, channel: number) => pushEvent({ kind: 'noteon', note, velocity, channel, ts: Date.now() });
export const midiControlOnNoteOff = (note: number, velocity: number, channel: number) => pushEvent({ kind: 'noteoff', note, velocity, channel, ts: Date.now() });
export const midiControlOnCC = (controller: number, value: number, channel: number) => pushEvent({ kind: 'cc', controller, value, channel, ts: Date.now() });


export function setBpm(bpm: number) {
  midiControlState.bpm = Math.max(1, Math.min(999, Math.round(bpm)));
}