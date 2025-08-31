// Global MIDI → sound router. Always delivers incoming MIDI to the sound backend.
import { soundBackend } from '~/lib/soundBackend';
import { midiManager } from '~/features/device-utility/stores/midi.svelte';

// Attach exactly once per app lifetime (persists across HMR)
const G: any = (globalThis as any);
if (!G.__wavy_midi_router_attached) {
  G.__wavy_midi_router_attached = true;
  G.__wavy_midi_router_onNoteOn ||= ((note: number, velocity: number, channel: number) => {
    try { soundBackend.resume?.(); } catch {}
    soundBackend.noteOn(note, velocity, channel);
  });
  G.__wavy_midi_router_onNoteOff ||= ((note: number, velocity: number, channel: number) => {
    soundBackend.noteOff(note, velocity, channel);
  });
  G.__wavy_midi_router_onCC ||= ((_controller: number, _value: number, _channel: number) => {
    // Placeholder for CC → sound mapping if needed later.
  });

  midiManager.onNoteOn(G.__wavy_midi_router_onNoteOn);
  midiManager.onNoteOff(G.__wavy_midi_router_onNoteOff);
  midiManager.onControlChange(G.__wavy_midi_router_onCC);
}
