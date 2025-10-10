import { soundBackend, type TrackConfigView, type TrackPersisted } from '~/lib/soundBackend';

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

// ---------------- Playground track persistence + UI helpers ----------------
export const PLAYGROUND_STORAGE_KEY = 'wavy_playground_tracks_v1';

export const playgroundUI = $state({ refreshKey: 0 });
export const playgroundTracks = $state<TrackConfigView[]>(soundBackend.getAllTrackConfigs());

function persistTracks(tracks: TrackPersisted[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(PLAYGROUND_STORAGE_KEY, JSON.stringify(tracks)); } catch {}
}

function refreshTracks() {
  const fresh = soundBackend.getAllTrackConfigs();
  playgroundTracks.splice(0, playgroundTracks.length, ...fresh);
  playgroundUI.refreshKey++;
}

export function initPlaygroundTrackPersistence() {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(PLAYGROUND_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved)) {
          soundBackend.importTracks(saved);
        }
      }
    } catch {}
    const warmup = () => { soundBackend.resume().catch(() => {}); };
    window.addEventListener('pointerdown', warmup, { once: true });
    setTimeout(warmup, 100);
  }
  refreshTracks();
}

export function updateTrackConfig(channel: number, updates: Partial<TrackPersisted>) {
  soundBackend.setTrackConfig(channel, updates);
  persistTracks(soundBackend.exportTracks());
  refreshTracks();
}

export function setTrackSliderValue(channel: number, sliderId: string, value: number) {
  soundBackend.setTrackSliderValue(channel, sliderId, value);
  persistTracks(soundBackend.exportTracks());
  refreshTracks();
}

export function resetTrack(channel: number) {
  soundBackend.resetTrack(channel);
  persistTracks(soundBackend.exportTracks());
  refreshTracks();
}

export function resetAllTracks() {
  soundBackend.resetAllTracks();
  persistTracks(soundBackend.exportTracks());
  refreshTracks();
}
