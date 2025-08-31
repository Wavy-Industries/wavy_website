// Global MIDI → sound router. Always delivers incoming MIDI to the sound backend.
import { soundBackend } from '~/lib/soundBackend';
import { midiManager } from '~/features/device-utility/stores/midiTester.svelte';

// Declarative: exported init to attach once, HMR-safe without globalThis
const H = (import.meta as any).hot;
const DATA: any = H?.data || (H ? (H.data = {}) : {});

export function initMidiRouter() {
  if (DATA.__wavy_midi_router_attached) return;
  DATA.__wavy_midi_router_attached = true;

  const onNoteOn = (note: number, velocity: number, channel: number) => {
    try { soundBackend.resume?.(); } catch {}
    soundBackend.noteOn(note, velocity, channel);
  };
  const onNoteOff = (note: number, velocity: number, channel: number) => {
    soundBackend.noteOff(note, velocity, channel);
  };
  const onCC = (_controller: number, _value: number, _channel: number) => {
    // Placeholder for CC → sound mapping if needed later.
  };

  DATA.__wavy_midi_router_handlers = { onNoteOn, onNoteOff, onCC };
  midiManager.onNoteOn(onNoteOn);
  midiManager.onNoteOff(onNoteOff);
  midiManager.onControlChange(onCC);
}

H?.accept?.(() => {});
