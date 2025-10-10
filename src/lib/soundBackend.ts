import type { initStrudel as InitStrudelFn } from '@strudel/web';
import { getAudioContext, initAudioOnFirstClick, registerSynthSounds, registerZZFXSounds, superdough } from 'superdough';

const TOTAL_CHANNELS = 16;

type TrackScriptDefinition = {
  name: string;
  script: string;
};

type TrackEventSpec = {
  duration?: number;
  offset?: number;
  cut?: string;
  orbit?: string | number;
  velocity?: number;
  gain?: number;
  [key: string]: unknown;
};

type TrackEventResult = TrackEventSpec | TrackEventSpec[] | null | undefined;

type TrackEventContext = {
  note: number;
  velocity: number;
  channel: number;
  time: number;
  cutId: string;
};

type TrackSliderConfig = {
  id: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  default: number;
  comment?: string;
};

type TrackEventHandler = (
  ctx: TrackEventContext,
  helpers: typeof helpers,
  sliders: Record<string, number>,
) => TrackEventResult;

type TrackRuntime = {
  name: string;
  script: string;
  description?: string;
  onNoteOn?: TrackEventHandler;
  onNoteOff?: TrackEventHandler;
  sliders?: TrackSliderConfig[];
};

export type TrackConfigView = {
  name: string;
  script: string;
  description?: string;
  error: string | null;
  sliders: TrackSliderConfig[];
  sliderValues: Record<string, number>;
};

export type TrackPersisted = {
  name: string;
  script: string;
  sliders?: Record<string, number>;
};

export interface ISoundBackend {
  noteOn(note: number, velocity?: number, channel?: number): void;
  noteOff(note: number, velocity?: number, channel?: number): void;
  allNotesOff(): void;
  resume(): Promise<void>;
  getTrackConfig(channel: number): TrackConfigView;
  getAllTrackConfigs(): TrackConfigView[];
  setTrackConfig(channel: number, updates: Partial<TrackPersisted>): TrackConfigView;
  resetTrack(channel: number): TrackConfigView;
  resetAllTracks(): TrackConfigView[];
  exportTracks(): TrackPersisted[];
  importTracks(data: Partial<TrackPersisted>[]): TrackConfigView[];
  setTrackSliderValue(channel: number, sliderId: string, value: number): TrackConfigView;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const midiToFreq = (note: number) => 440 * Math.pow(2, (note - 69) / 12);
const velocityToUnit = (velocity: number, scale = 1) => clamp((velocity / 127) * scale, 0, 1);

const helpers = Object.freeze({
  clamp,
  midiToFreq,
  velocityToUnit,
});

let cachedInitStrudel: InitStrudelFn | null = null;
async function loadInitStrudel(): Promise<InitStrudelFn> {
  if (!cachedInitStrudel) {
    const mod = await import('@strudel/web');
    cachedInitStrudel = mod.initStrudel;
  }
  return cachedInitStrudel;
}

const BASE_TRACKS: TrackScriptDefinition[] = [
  {
    name: 'Glass Keys',
    script: `({
  description: 'Glass keys with airy shimmer and a subtle drum-sidechain breath.',
  sliders: [
    { id: 'attack', label: 'Attack', min: 0.005, max: 0.45, step: 0.005, default: 0.04, comment: 'Envelope attack (seconds)' },
    { id: 'release', label: 'Release', min: 0.2, max: 1.8, step: 0.01, default: 0.9, comment: 'Envelope release tail (seconds)' },
    { id: 'cutoff', label: 'Cutoff', min: 700, max: 4800, step: 20, default: 2200, comment: 'Low-pass cutoff (Hz)' }
  ],
  // Attack softens the front edge, Release stretches the tail, Cutoff sets brightness.
  onNoteOn({ note, velocity, cutId, channel }, helpers, sliders = {}) {
    const level = helpers.velocityToUnit(velocity, 1.05);
    const attack = sliders.attack ?? 0.04;
    const release = sliders.release ?? 0.9;
    const cutoff = sliders.cutoff ?? 2200;
    return {
      s: 'sine',
      note,
      gain: 0.78,
      velocity: level,
      attack,
      decay: 0.22,
      sustain: 0.72,
      release,
      cutoff,
      resonance: 0.9,
      room: 0.28,
      delay: 0.22,
      delayfeedback: 0.4,
      duckorbit: 'drum_bus',
      duckdepth: 0.52,
      duckattack: 0.018,
      orbit: \`track_\${channel + 1}\`,
      cut: cutId,
      duration: release + 0.6
    };
  }
})`,
  },
  {
    name: 'Shimmer Pluck',
    script: `({
  description: 'Bright pluck with phaser shimmer and controllable detune.',
  sliders: [
    { id: 'decay', label: 'Decay', min: 0.08, max: 0.5, step: 0.01, default: 0.2, comment: 'Envelope decay (seconds)' },
    { id: 'detune', label: 'Detune', min: 0, max: 18, step: 1, default: 6, comment: 'Unison detune (cents)' },
    { id: 'cutoff', label: 'Cutoff', min: 1200, max: 7200, step: 40, default: 3600, comment: 'Low-pass cutoff (Hz)' }
  ],
  // Decay tightens the pluck length, Detune widens the stereo image, Cutoff brightens the stab.
  onNoteOn({ note, velocity, cutId, channel }, helpers, sliders = {}) {
    const decay = sliders.decay ?? 0.2;
    const detune = sliders.detune ?? 6;
    const cutoff = sliders.cutoff ?? 3600;
    const level = helpers.velocityToUnit(velocity, 1.1);
    return {
      s: 'sawtooth',
      note,
      gain: 0.72,
      velocity: level,
      attack: 0.003,
      decay,
      sustain: 0.1,
      release: 0.16,
      spread: detune,
      phaserrate: 0.55,
      phaserdepth: 0.55,
      cutoff,
      resonance: 0.85,
      orbit: \`track_\${channel + 1}\`,
      delay: 0.18,
      delayfeedback: 0.32,
      cut: cutId,
      duration: decay + 0.25
    };
  }
})`,
  },
  {
    name: 'Neon Saw',
    script: `({
  description: 'Wide saw lead with motion and drive.',
  sliders: [
    { id: 'spread', label: 'Spread', min: 0, max: 32, step: 1, default: 18, comment: 'Unison spread (cents)' },
    { id: 'drive', label: 'Drive', min: 0, max: 1.2, step: 0.05, default: 0.4, comment: 'Distortion amount' },
    { id: 'release', label: 'Release', min: 0.1, max: 0.9, step: 0.02, default: 0.36, comment: 'Release tail (seconds)' }
  ],
  // Spread widens unison, Drive gives grit, Release sets legato glide.
  onNoteOn({ note, velocity, cutId, channel }, helpers, sliders = {}) {
    const spread = sliders.spread ?? 18;
    const drive = sliders.drive ?? 0.4;
    const release = sliders.release ?? 0.36;
    const level = helpers.velocityToUnit(velocity, 1.08);
    return {
      s: 'sawtooth',
      note,
      gain: 0.62,
      velocity: level,
      attack: 0.012,
      decay: 0.21,
      sustain: 0.58,
      release,
      spread,
      vibrato: 0.35,
      vibratodepth: 0.18,
      distort: drive,
      distortvol: 0.64,
      duckorbit: 'drum_bus',
      duckdepth: 0.58,
      orbit: \`track_\${channel + 1}\`,
      cut: cutId,
      duration: release + 0.4
    };
  }
})`,
  },
  {
    name: 'Chorale Organ',
    script: `({
  description: 'Harmonic square organ with vibrato and body.',
  sliders: [
    { id: 'vibrato', label: 'Vibrato Rate', min: 0, max: 8, step: 0.1, default: 3.2, comment: 'Vibrato speed (Hz)' },
    { id: 'mix', label: 'Vibrato Depth', min: 0, max: 1, step: 0.05, default: 0.45, comment: 'Vibrato depth' },
    { id: 'room', label: 'Room', min: 0, max: 0.6, step: 0.02, default: 0.22, comment: 'Reverb mix' }
  ],
  // Vibrato sliders shape the wobble; Room slider sets ambience.
  onNoteOn({ note, velocity, cutId, channel }, helpers, sliders = {}) {
    const vibrato = sliders.vibrato ?? 3.2;
    const depth = sliders.mix ?? 0.45;
    const room = sliders.room ?? 0.22;
    const level = helpers.velocityToUnit(velocity, 0.92);
    return {
      s: 'square',
      note,
      gain: 0.56,
      velocity: level,
      attack: 0.006,
      decay: 0.16,
      sustain: 0.82,
      release: 0.32,
      vibrato,
      vibratodepth: depth,
      room,
      cutoff: 2800,
      orbit: \`track_\${channel + 1}\`,
      cut: cutId,
      duration: 0.8
    };
  }
})`,
  },
  {
    name: 'Silver Pad',
    script: `({
  description: 'Slow triangle pad that blooms with filter movement.',
  sliders: [
    { id: 'attack', label: 'Attack', min: 0.05, max: 0.9, step: 0.01, default: 0.22, comment: 'Envelope attack (seconds)' },
    { id: 'release', label: 'Release', min: 0.8, max: 3.5, step: 0.05, default: 1.8, comment: 'Envelope release (seconds)' },
    { id: 'cutoff', label: 'Cutoff', min: 400, max: 4200, step: 20, default: 1600, comment: 'Filter cutoff (Hz)' }
  ],
  // Attack/Release set swell speed; Cutoff controls warmth.
  onNoteOn({ note, velocity, cutId, channel }, helpers, sliders = {}) {
    const attack = sliders.attack ?? 0.22;
    const release = sliders.release ?? 1.8;
    const cutoff = sliders.cutoff ?? 1600;
    const level = helpers.velocityToUnit(velocity, 0.78);
    return {
      s: 'triangle',
      note,
      gain: 0.58,
      velocity: level,
      attack,
      decay: 0.55,
      sustain: 0.82,
      release,
      cutoff,
      resonance: 0.72,
      room: 0.36,
      orbit: \`track_\${channel + 1}\`,
      cut: cutId,
      duration: release + 0.8
    };
  }
})`,
  },
  {
    name: 'Bell Cascade',
    script: `({
  description: 'Chiming metallic bell layered with airy tails.',
  sliders: [
    { id: 'tone', label: 'Tone Shift', min: -12, max: 12, step: 1, default: 0, comment: 'Semitone shift for sparkle' },
    { id: 'decay', label: 'Decay', min: 0.4, max: 2.4, step: 0.05, default: 1.0, comment: 'Tail length (seconds)' },
    { id: 'room', label: 'Room', min: 0, max: 0.7, step: 0.02, default: 0.35, comment: 'Reverb amount' }
  ],
  // Tone nudges the chord shimmer, Decay/Room set bell trail.
  onNoteOn({ note, velocity, cutId, channel }, helpers, sliders = {}) {
    const tone = sliders.tone ?? 0;
    const decay = sliders.decay ?? 1.0;
    const room = sliders.room ?? 0.35;
    const level = helpers.velocityToUnit(velocity, 1.18);
    return {
      s: 'zzfx',
      note: note + tone,
      gain: 0.68,
      velocity: level,
      attack: 0.001,
      decay,
      sustain: 0,
      release: decay,
      room,
      orbit: \`track_\${channel + 1}\`,
      cut: cutId,
      duration: decay + 0.3
    };
  }
})`,
  },
  {
    name: 'Hypno Tremor',
    script: `({
  description: 'Slow tremolo sine with optional wobble filter.',
  sliders: [
    { id: 'depth', label: 'Tremolo Depth', min: 0, max: 1, step: 0.05, default: 0.6, comment: 'Amplitude modulation depth' },
    { id: 'rate', label: 'Tremolo Rate', min: 0.2, max: 12, step: 0.1, default: 3.6, comment: 'Modulation rate (Hz)' },
    { id: 'cutoff', label: 'Filter Lift', min: 600, max: 4200, step: 50, default: 2400, comment: 'Low-pass cutoff (Hz)' }
  ],
  // Depth and Rate shape the tremolo wobble; Filter Lift brightens sustain.
  onNoteOn({ note, velocity, cutId, channel }, helpers, sliders = {}) {
    const depth = sliders.depth ?? 0.6;
    const rate = sliders.rate ?? 3.6;
    const cutoff = sliders.cutoff ?? 2400;
    const level = helpers.velocityToUnit(velocity, 0.96);
    return {
      s: 'sine',
      note,
      gain: 0.6,
      velocity: level,
      attack: 0.05,
      decay: 0.24,
      sustain: 0.72,
      release: 0.72,
      tremolo: rate,
      tremolodepth: depth,
      cutoff,
      orbit: \`track_\${channel + 1}\`,
      cut: cutId,
      duration: 1.1
    };
  }
})`,
  },
  {
    name: 'Analog Stack',
    script: `({
  description: 'Dual osc stack with gentle tape wobble.',
  sliders: [
    { id: 'blend', label: 'Blend', min: 0, max: 1, step: 0.05, default: 0.45, comment: 'Square blend inside the stack' },
    { id: 'drive', label: 'Drive', min: 0, max: 0.9, step: 0.05, default: 0.3, comment: 'Saturation amount' },
    { id: 'release', label: 'Release', min: 0.2, max: 1.2, step: 0.02, default: 0.52, comment: 'Release tail (seconds)' }
  ],
  // Blend crossfades oscillators; Drive adds grit; Release shapes tails.
  onNoteOn({ note, velocity, cutId, channel }, helpers, sliders = {}) {
    const blend = sliders.blend ?? 0.45;
    const drive = sliders.drive ?? 0.3;
    const release = sliders.release ?? 0.52;
    const level = helpers.velocityToUnit(velocity, 0.98);
    return {
      s: 'sawtooth',
      note,
      gain: 0.6,
      velocity: level,
      attack: 0.015,
      decay: 0.28,
      sustain: 0.62,
      release,
      distort: drive,
      distortvol: 0.6,
      phaser: 0.3,
      phaserdepth: 0.35,
      spread: 6 + blend * 24,
      room: 0.18 + blend * 0.1,
      orbit: \`track_\${channel + 1}\`,
      duckorbit: 'drum_bus',
      duckdepth: 0.35,
      cut: cutId,
      duration: release + 0.4
    };
  }
})`,
  },
  {
    name: 'Nimbus Pad',
    script: `({
  description: 'Expansive pad that drifts with chorus and delay.',
  sliders: [
    { id: 'air', label: 'Air', min: 0, max: 1, step: 0.05, default: 0.4, comment: 'High-pass mix for clarity' },
    { id: 'delay', label: 'Delay Mix', min: 0, max: 0.8, step: 0.02, default: 0.32, comment: 'Delay send amount' },
    { id: 'release', label: 'Release', min: 1.0, max: 4.5, step: 0.05, default: 2.4, comment: 'Release tail (seconds)' }
  ],
  // Air lifts the highs, Delay mix sets the wash, Release lengthens clouds.
  onNoteOn({ note, velocity, cutId, channel }, helpers, sliders = {}) {
    const air = sliders.air ?? 0.4;
    const delay = sliders.delay ?? 0.32;
    const release = sliders.release ?? 2.4;
    const level = helpers.velocityToUnit(velocity, 0.74);
    return {
      s: 'triangle',
      note,
      gain: 0.52,
      velocity: level,
      attack: 0.3,
      decay: 0.6,
      sustain: 0.82,
      release,
      delay,
      delayfeedback: 0.46,
      room: 0.48,
      hcutoff: 400 + air * 4000,
      orbit: \`track_\${channel + 1}\`,
      cut: cutId,
      duration: release + 1
    };
  }
})`,
  },
  {
    name: 'Pulse Drums',
    script: `({
  description: 'Compact drum kit mapped from C3 upward (kick on C3).',
  sliders: [
    { id: 'kickPunch', label: 'Kick Punch', min: 0.2, max: 1.2, step: 0.02, default: 0.7, comment: 'Kick transient strength' },
    { id: 'hatTight', label: 'Hat Tightness', min: 0.05, max: 0.6, step: 0.01, default: 0.22, comment: 'Hi-hat decay length' },
    { id: 'room', label: 'Room', min: 0, max: 0.6, step: 0.02, default: 0.18, comment: 'Shared drum reverb' }
  ],
  // Kick Punch boosts the thump, Hat Tightness shortens hats, Room sets global verb.
  onNoteOn({ note, velocity, cutId }, helpers, sliders = {}) {
    const level = Math.min(1, velocity / 127);
    const punch = sliders.kickPunch ?? 0.7;
    const hat = sliders.hatTight ?? 0.22;
    const room = sliders.room ?? 0.18;
    const kick = {
      s: 'sbd',
      gain: 0.95 * punch,
      velocity: level,
      decay: 0.38,
      room,
      cut: 'kick',
      orbit: 'drum_bus',
      duration: 0.52,
    };
    if (note === 48) return kick;
    if (note === 49) {
      return {
        s: 'z_noise',
        attack: 0.001,
        decay: 0.16,
        sustain: 0,
        release: 0.2,
        gain: 0.85,
        velocity: level,
        cutoff: 2500,
        room: room * 0.6,
        orbit: 'drum_bus',
        cut: 'rim',
        duration: 0.24,
      };
    }
    if (note === 50) {
      return {
        s: 'z_noise',
        attack: 0.002,
        decay: 0.18,
        sustain: 0,
        release: 0.28,
        gain: 0.92,
        velocity: level,
        cutoff: 2100,
        hcutoff: 1200,
        room,
        orbit: 'drum_bus',
        cut: 'snare',
        duration: 0.32,
      };
    }
    if (note === 51) {
      return {
        s: 'z_noise',
        attack: 0.001,
        decay: 0.12,
        sustain: 0,
        release: 0.2,
        gain: 0.82,
        velocity: level,
        cutoff: 2300,
        room: room * 0.5,
        orbit: 'drum_bus',
        cut: 'clap',
        duration: 0.24,
      };
    }
    if (note === 52) {
      return {
        s: 'z_noise',
        attack: 0.0006,
        decay: hat,
        sustain: 0,
        release: hat * 0.8,
        hcutoff: 9000,
        gain: 0.58,
        velocity: level,
        orbit: 'drum_bus',
        cut: 'hat',
        duration: hat + 0.04,
      };
    }
    if (note === 53) {
      return {
        s: 'z_noise',
        attack: 0.001,
        decay: hat * 2.2,
        sustain: 0,
        release: hat * 2.1,
        hcutoff: 7200,
        gain: 0.6,
        velocity: level,
        orbit: 'drum_bus',
        cut: 'hat',
        duration: hat * 2.4,
      };
    }
    if (note === 54 || note === 55 || note === 56) {
      const midi = note - 12;
      return {
        s: 'sine',
        note: midi,
        gain: 0.6,
        velocity: level,
        attack: 0.002,
        decay: 0.32,
        sustain: 0,
        release: 0.35,
        room: room * 0.4,
        orbit: 'drum_bus',
        cut: 'tom-' + note,
        duration: 0.4,
      };
    }
    if (note === 57) {
      return {
        s: 'z_noise',
        attack: 0.003,
        decay: 0.9,
        sustain: 0,
        release: 1,
        gain: 0.52,
        velocity: level,
        room: room * 1.2,
        orbit: 'drum_bus',
        cut: 'crash',
        duration: 1.1,
      };
    }
    if (note === 58) {
      return {
        s: 'z_noise',
        attack: 0.002,
        decay: 0.75,
        sustain: 0,
        release: 0.82,
        gain: 0.5,
        velocity: level,
        room: room * 0.9,
        orbit: 'drum_bus',
        cut: 'ride',
        duration: 0.85,
      };
    }
    if (note === 59) {
      return {
        s: 'z_noise',
        attack: 0.001,
        decay: 0.18,
        sustain: 0,
        release: 0.22,
        gain: 0.52,
        velocity: level,
        cutoff: 3200,
        orbit: 'drum_bus',
        cut: 'perc',
        duration: 0.28,
      };
    }
    return {
      s: 'z_noise',
      attack: 0.001,
      decay: 0.18,
      sustain: 0,
      release: 0.22,
      gain: 0.5,
      velocity: level,
      room: room * 0.3,
      orbit: 'drum_bus',
      cut: cutId,
      duration: 0.26,
    };
  },
  onNoteOff({ cutId }) {
    return {
      cut: cutId,
      velocity: 0,
      gain: 0,
      duration: 0.05,
    };
  }
})`,
  },
];

const DEFAULT_TRACKS: TrackScriptDefinition[] = [
  ...BASE_TRACKS,
  ...Array.from({ length: Math.max(0, TOTAL_CHANNELS - BASE_TRACKS.length) }, (_, idx) => {
    const channelIndex = BASE_TRACKS.length + idx;
    return {
      name: `Track ${channelIndex + 1}`,
      script: `({
  onNoteOn({ note, velocity, cutId, channel }, helpers) {
    const level = helpers.velocityToUnit(velocity, 1);
    return {
      s: 'sine',
      note,
      velocity: level,
      gain: 0.6,
      attack: 0.01,
      decay: 0.2,
      sustain: 0.6,
      release: 0.4,
      orbit: \`track_\${channel + 1}\`,
      cut: cutId,
      duration: 0.6
    };
  }
})`,
    };
  }),
];

class StrudelBackend implements ISoundBackend {
  private definitions: TrackScriptDefinition[] = DEFAULT_TRACKS.map((d) => ({ ...d }));
  private errors: (string | null)[] = Array(TOTAL_CHANNELS).fill(null);
  private sliderValues: Record<string, number>[] = Array.from({ length: TOTAL_CHANNELS }, () => ({}));
  private runtimes: TrackRuntime[] = this.definitions.map((def, idx) => this.compileTrack(def, idx));
  private initPromise: Promise<void> | null = null;
  private ready = false;
  private activeCuts: Set<string> = new Set();

  noteOn(note: number, velocity = 100, channel = 0): void {
    const idx = this.normalizeChannel(channel);
    const runtime = this.runtimes[idx];
    const handler = runtime?.onNoteOn;
    if (!handler) return;

    const context = this.buildContext(note, velocity, idx);
    this.defer(() => this.invokeAndSchedule(idx, handler, context));
  }

  noteOff(note: number, velocity = 0, channel = 0): void {
    const idx = this.normalizeChannel(channel);
    const runtime = this.runtimes[idx];
    const handler = runtime?.onNoteOff;
    const context = this.buildContext(note, velocity, idx);

    this.defer(() => {
      if (handler) this.invokeAndSchedule(idx, handler, context, true);
      else this.killCut(context.cutId);
    });
  }

  allNotesOff(): void {
    const cuts = Array.from(this.activeCuts);
    this.defer(() => {
      cuts.forEach((cut) => this.killCut(cut));
      this.activeCuts.clear();
    });
  }

  async resume(): Promise<void> {
    await this.ensureInit();
    try {
      const ctx = getAudioContext();
      if (ctx?.state === 'suspended') await ctx.resume();
    } catch {}
  }

  getTrackConfig(channel: number): TrackConfigView {
    const idx = this.normalizeChannel(channel);
    const def = this.definitions[idx];
    const runtime = this.runtimes[idx];
    return {
      name: def.name,
      script: def.script,
      description: runtime?.description,
      error: this.errors[idx],
      sliders: runtime?.sliders ?? [],
      sliderValues: { ...this.sliderValues[idx] },
    };
  }

  getAllTrackConfigs(): TrackConfigView[] {
    return this.definitions.map((_def, idx) => this.getTrackConfig(idx));
  }

  setTrackConfig(channel: number, updates: Partial<TrackPersisted>): TrackConfigView {
    const idx = this.normalizeChannel(channel);
    const current = this.definitions[idx];
    const next: TrackScriptDefinition = {
      name: updates.name?.trim() || current.name,
      script: updates.script !== undefined ? updates.script : current.script,
    };
    this.definitions[idx] = next;
    this.runtimes[idx] = this.compileTrack(next, idx);
    return this.getTrackConfig(idx);
  }

  resetTrack(channel: number): TrackConfigView {
    const idx = this.normalizeChannel(channel);
    this.definitions[idx] = { ...DEFAULT_TRACKS[idx] };
    this.runtimes[idx] = this.compileTrack(this.definitions[idx], idx);
    return this.getTrackConfig(idx);
  }

  resetAllTracks(): TrackConfigView[] {
    this.definitions = DEFAULT_TRACKS.map((d) => ({ ...d }));
    this.runtimes = this.definitions.map((def, idx) => this.compileTrack(def, idx));
    return this.getAllTrackConfigs();
  }

  exportTracks(): TrackPersisted[] {
    return this.definitions.map((d, idx) => ({
      name: d.name,
      script: d.script,
      sliders: { ...this.sliderValues[idx] },
    }));
  }

  importTracks(data: Partial<TrackPersisted>[]): TrackConfigView[] {
    data.forEach((entry, idx) => {
      if (idx >= TOTAL_CHANNELS) return;
      const prev = this.definitions[idx];
      this.definitions[idx] = {
        name: entry.name?.trim() || prev.name,
        script: typeof entry.script === 'string' ? entry.script : prev.script,
      };
      this.runtimes[idx] = this.compileTrack(this.definitions[idx], idx);
      if (entry.sliders && typeof entry.sliders === 'object') {
        this.sliderValues[idx] = { ...entry.sliders };
      } else {
        this.sliderValues[idx] = this.buildDefaultSliderValues(this.runtimes[idx]);
      }
    });
    return this.getAllTrackConfigs();
  }

  setTrackSliderValue(channel: number, sliderId: string, value: number): TrackConfigView {
    const idx = this.normalizeChannel(channel);
    const runtime = this.runtimes[idx];
    const slider = runtime?.sliders?.find((s) => s.id === sliderId);
    if (!slider) return this.getTrackConfig(idx);
    const clamped = clamp(value, slider.min, slider.max);
    const step = slider.step ?? 0;
    const snapped = step > 0 ? Math.round(clamped / step) * step : clamped;
    this.sliderValues[idx][sliderId] = Number(snapped.toFixed(6));
    return this.getTrackConfig(idx);
  }

  private normalizeChannel(channel: number): number {
    return Math.abs(channel | 0) % TOTAL_CHANNELS;
  }

  private buildContext(note: number, velocity: number, channel: number): TrackEventContext {
    return {
      note,
      velocity,
      channel,
      time: this.getAudioTime(),
      cutId: `${channel}:${note}`,
    };
  }

  private getAudioTime(): number {
    try {
      return getAudioContext().currentTime;
    } catch {
      return 0;
    }
  }

  private compileTrack(def: TrackScriptDefinition, index: number): TrackRuntime {
    const runtime: TrackRuntime = {
      name: def.name,
      script: def.script,
    };
    const source = (def.script ?? '').trim();
    if (!source) {
      this.errors[index] = 'Empty script';
      return runtime;
    }

    const wrapped = this.wrapScript(source);

    try {
      const fn = new Function('helpers', `'use strict';\n${wrapped}`);
      const result = fn(helpers);
      const normalized = this.normalizeRuntime(result);
      runtime.onNoteOn = normalized.onNoteOn;
      runtime.onNoteOff = normalized.onNoteOff;
      runtime.description = normalized.description;
      runtime.sliders = normalized.sliders;
      this.sliderValues[index] = this.buildDefaultSliderValues(runtime, this.sliderValues[index]);
      this.errors[index] = null;
    } catch (err) {
      this.errors[index] = err instanceof Error ? err.message : String(err);
      this.sliderValues[index] = this.buildDefaultSliderValues(runtime);
    }

    return runtime;
  }

  private buildDefaultSliderValues(runtime: TrackRuntime | undefined, existing?: Record<string, number>): Record<string, number> {
    const target: Record<string, number> = { ...(existing ?? {}) };
    const sliders = runtime?.sliders ?? [];
    sliders.forEach((slider) => {
      if (typeof target[slider.id] !== 'number' || Number.isNaN(target[slider.id]!)) {
        target[slider.id] = slider.default;
      }
    });
    Object.keys(target).forEach((key) => {
      if (!sliders.find((s) => s.id === key)) delete target[key];
    });
    return target;
  }

  private wrapScript(source: string): string {
    if (/^return\b/.test(source)) return source;
    if (/^([({\[])/.test(source)) return `return ${source};`;
    return `return (${source});`;
  }

  private normalizeRuntime(result: unknown): Required<Pick<TrackRuntime, 'onNoteOn' | 'onNoteOff'>> & {
    description?: string;
    sliders?: TrackSliderConfig[];
  } {
    if (typeof result === 'function') {
      return { onNoteOn: result as TrackEventHandler, onNoteOff: undefined };
    }
    if (Array.isArray(result) || (result && typeof result === 'object' && !('onNoteOn' in (result as any)) && !('onNoteOff' in (result as any)))) {
      return {
        onNoteOn: (_ctx: TrackEventContext, _helpers: typeof helpers, _sliders: Record<string, number>) => result as TrackEventResult,
        onNoteOff: undefined,
      };
    }
    if (result && typeof result === 'object') {
      const obj = result as Record<string, unknown>;
      return {
        onNoteOn: typeof obj.onNoteOn === 'function'
          ? (obj.onNoteOn as TrackEventHandler)
          : (_ctx: TrackEventContext, _helpers: typeof helpers, _sliders: Record<string, number>) => obj.events ?? null,
        onNoteOff: typeof obj.onNoteOff === 'function' ? (obj.onNoteOff as TrackEventHandler) : undefined,
        description: typeof obj.description === 'string' ? obj.description : undefined,
        sliders: Array.isArray(obj.sliders)
          ? (obj.sliders as TrackSliderConfig[]).map((slider) => ({
              id: String(slider.id),
              label: slider.label ?? String(slider.id),
              min: typeof slider.min === 'number' ? slider.min : 0,
              max: typeof slider.max === 'number' ? slider.max : 1,
              step: typeof slider.step === 'number' ? slider.step : undefined,
              default: typeof slider.default === 'number' ? slider.default : 0,
              comment: slider.comment,
            }))
          : undefined,
      };
    }
    return {
      onNoteOn: () => null,
      onNoteOff: undefined,
    };
  }

  private invokeAndSchedule(
    channel: number,
    handler: TrackEventHandler,
    context: TrackEventContext,
    isNoteOff = false,
  ) {
    try {
      const result = handler(context, helpers, this.sliderValues[channel] ?? {});
      this.scheduleResult(result, context, channel, isNoteOff);
    } catch (err) {
      this.errors[channel] = err instanceof Error ? err.message : String(err);
      console.error('[soundBackend] track handler error', err);
    }
  }

  private scheduleResult(
    result: TrackEventResult,
    context: TrackEventContext,
    channel: number,
    isNoteOff: boolean,
  ) {
    if (!result) {
      if (isNoteOff) this.killCut(context.cutId);
      return;
    }
    const items = Array.isArray(result) ? result : [result];
    items.forEach((entry) => this.scheduleEntry(entry, context, channel));
  }

  private scheduleEntry(entry: TrackEventSpec, context: TrackEventContext, channel: number) {
    if (!entry || typeof entry !== 'object') return;
    const { duration, offset, ...rest } = entry;
    const cut = typeof rest.cut === 'string' || typeof rest.cut === 'number' ? String(rest.cut) : context.cutId;
    const orbit = rest.orbit ?? `track_${channel + 1}`;
    const velocity = typeof rest.velocity === 'number' ? rest.velocity : velocityToUnit(context.velocity);
    const gain = typeof rest.gain === 'number' ? rest.gain : undefined;
    const eventDuration = typeof duration === 'number' && isFinite(duration) ? Math.max(0.01, duration) : 0.5;

    const payload: Record<string, unknown> = {
      ...rest,
      cut,
      orbit,
      velocity,
    };
    if (gain !== undefined) payload.gain = gain;

    this.activeCuts.add(cut);
    this.ensureInit()
      .then(() => {
        const now = this.getAudioTime();
        const baseTime = Math.max(now, context.time);
        const eventTime = baseTime + 0.001 + (typeof offset === 'number' ? offset : 0);
        return superdough(payload, eventTime, eventDuration);
      })
      .catch((err) => {
        console.error('[soundBackend] failed to schedule event', err);
        this.errors[channel] = err instanceof Error ? err.message : String(err);
      });
  }

  private killCut(cut: string) {
    const payload = { s: 'sine', gain: 0, velocity: 0, cut };
    this.ensureInit()
      .then(() => {
        const time = this.getAudioTime() + 0.001;
        return superdough(payload, time, 0.05);
      })
      .catch(() => {});
    this.activeCuts.delete(cut);
  }

  private defer(fn: () => void) {
    void this.ensureInit().then(fn).catch(() => {});
  }

  private async ensureInit(): Promise<void> {
    if (this.ready || typeof window === 'undefined') return;
    if (!this.initPromise) this.initPromise = this.init();
    await this.initPromise;
  }

  private async init() {
    try {
      const initStrudel = await loadInitStrudel();
      await initStrudel({});
    } catch {}
    try {
      await initAudioOnFirstClick?.();
    } catch {}
    try {
      registerSynthSounds?.();
      registerZZFXSounds?.();
    } catch {}
    this.ready = true;
  }
}

export const soundBackend: ISoundBackend = new StrudelBackend();
