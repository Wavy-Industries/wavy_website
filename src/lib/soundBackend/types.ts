export type DrumSampleMap = Map<number, AudioBuffer>;

export type DrumKitIndexEntry = {
  id: string;
  name: string;
  path: string;
};

export type DrumKitLayer = {
  sample: string;
  minVelocity?: number;
  maxVelocity?: number;
  gain?: number;
  tune?: number; // semitones
};

export type DrumKitSlot = {
  label?: string;
  layers: DrumKitLayer[];
  gain?: number;
  tune?: number;
  pan?: number; // -1..1
  chokeGroup?: string;
  roundRobin?: boolean;
  cutOnRelease?: boolean;
};

export type DrumKitManifest = {
  id: string;
  name: string;
  cutOnRelease?: boolean;
  notes: Record<string, DrumKitSlot>;
};

export type OscType = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'supersaw' | 'fold' | 'pulse' | 'noise';
export type ModRouting = 'off' | 'mix' | 'am' | 'fm';
export type FilterType = 'none' | 'lowpass' | 'highpass' | 'bandpass';
export type ADSR = { attack: number; decay: number; sustain: number; release: number };

export type ModMatrix = {
  cutoff: number;   // 0..1 amount to open filter via CC1
  vibrato: number;  // 0..1 depth (scales ~1% of pitch at 1.0)
  tremolo: number;  // 0..1 depth multiplier for amp LFO
  osc2Depth: number;// 0..1 additional osc2Level under CC1
  spread: number;   // 0..1 additional detune spread under CC1 (in cents up to +30)
};

export type SynthChannelConfig = {
  osc1Type: OscType;
  osc2Type: OscType;
  osc2Routing: ModRouting; // off/mix/am/fm
  osc2Ratio: number; // relative frequency of osc2 to base (e.g., 1.0)
  osc2Level: number; // mix level (mix) or depth (am/fm), 0..1
  voices: number; // 1..8
  spreadCents: number; // detune spread total range in cents
  adsr: ADSR; // seconds for a,d,r; sustain 0..1
  masterGain: number; // 0..1
  filterType: FilterType;
  filterFrequency: number; // Hz, 20-20000
  filterQ: number; // resonance, 0.1-20
  filterEnvAmount: number; // filter envelope depth, -1 to 1
  monophonic?: boolean; // if true, one note at a time
  mod?: ModMatrix; // CC1 routing amounts
  modSensitivity?: number; // 0..2 global scale for mod wheel effects (1 = default)
  modWheelHold?: boolean; // if true, ignore CC1=0 from hardware; UI controls value
  // Channel LFO (tremolo or future routing). Depth 0..1, cc1Scale multiplies depth via CC1
  lfoRateHz?: number;
  lfoDepth?: number;
  lfoCc1Scale?: number;
  // Portamento for monophonic
  portamentoSec?: number; // 0..1s
  // Post-filter effects
  drive?: number; // 0..1
  chorusDepthMs?: number; // 0..20
  chorusRateHz?: number; // 0.1..7
  chorusMix?: number; // 0..1
  // Velocity mappings
  velToAttack?: number; // 0..1 (reduce attack with velocity)
  velToSustain?: number; // 0..1 (increase sustain with velocity)
  // 3-band EQ
  eqLowGain?: number; // -12..12 dB (boost/cut at 100Hz)
  eqMidGain?: number; // -12..12 dB (boost/cut at 1kHz)
  eqHighGain?: number; // -12..12 dB (boost/cut at 8kHz)
};

export const DEFAULT_CHANNEL_CONFIG: Readonly<SynthChannelConfig> = {
  osc1Type: 'sawtooth',
  osc2Type: 'sine',
  osc2Routing: 'off',
  osc2Ratio: 2,
  osc2Level: 0.5,
  voices: 1,
  spreadCents: 8,
  adsr: { attack: 0.01, decay: 0.12, sustain: 0.6, release: 0.2 },
  masterGain: 0.25,
  filterType: 'none',
  filterFrequency: 2000,
  filterQ: 1,
  filterEnvAmount: 0,
  monophonic: false,
  mod: { cutoff: 1, vibrato: 0, tremolo: 0, osc2Depth: 0, spread: 0 },
  modSensitivity: 1,
  modWheelHold: false,
  lfoRateHz: 5.5,
  lfoDepth: 0,
  lfoCc1Scale: 1,
  portamentoSec: 0,
  drive: 0,
  chorusDepthMs: 0,
  chorusRateHz: 0.5,
  chorusMix: 0,
  velToAttack: 0,
  velToSustain: 0,
  eqLowGain: 0,
  eqMidGain: 0,
  eqHighGain: 0,
};

export type ReverbSettings = {
  mix: number;
  time: number;
  decay: number;
  preDelay: number;
};

export type DelaySettings = {
  mix: number;
  time: number;
  feedback: number;
};

export type ChorusSettings = {
  mix: number;
  depth: number;
  rate: number;
};

export type EffectSettingsByType = {
  reverb: ReverbSettings;
  delay: DelaySettings;
  chorus: ChorusSettings;
};

export type EffectType = keyof EffectSettingsByType;

export type EffectInstance<T extends EffectType = EffectType> = {
  id: string;
  type: T;
  settings: EffectSettingsByType[T];
};

export type TrackId = number | 'master';

export interface EffectModule {
  id: string;
  type: EffectType;
  input: AudioNode;
  output: AudioNode;
  update(settings: Record<string, number>): void;
  dispose(): void;
}

export interface ISoundBackend {
  noteOn(note: number, velocity?: number, channel?: number): void;
  noteOff(note: number, velocity?: number, channel?: number): void;
  allNotesOff(): void;
  setDrumSample(note: number, buffer: AudioBuffer | null): void; // null to remove
  loadDrumSample(note: number, url: string): Promise<void>;
  loadDrumKitFromPath(path: string, kitId?: string): Promise<void>;
  getDrumKitId(): string | null;
  resume(): Promise<void>;
  // Synth configuration per channel (0-15)
  getChannelConfig(channel: number): SynthChannelConfig;
  setChannelConfig(channel: number, patch: Partial<SynthChannelConfig>): void;
  // Track effects (per channel or master)
  getTrackEffects(trackId: TrackId): EffectInstance[];
  setTrackEffects(trackId: TrackId, effects: EffectInstance[]): void;
  // CC modulation
  setCC(controller: number, value: number, channel: number): void; // from MIDI/hardware
  setCCUI(controller: number, value: number, channel: number): void; // from UI, bypasses hold
  getCCValue(controller: number, channel: number): number;
}
