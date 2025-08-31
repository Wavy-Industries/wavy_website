// Sound backend library for WebAudio with MIDI-channel awareness.
// - Channels 0-8: simple instrument voices (different timbres per channel)
// - Channel 9: drum kit with common GM-style note mappings
// - Exposes a small interface used by UI (device tester, MIDI editor, MIDI input)

export type DrumSampleMap = Map<number, AudioBuffer>;

export type OscType = 'sine' | 'square' | 'sawtooth' | 'triangle';
export type ModRouting = 'off' | 'mix' | 'am' | 'fm';
export type ADSR = { attack: number; decay: number; sustain: number; release: number };

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
};

export interface ISoundBackend {
  noteOn(note: number, velocity?: number, channel?: number): void;
  noteOff(note: number, velocity?: number, channel?: number): void;
  allNotesOff(): void;
  setDrumSample(note: number, buffer: AudioBuffer | null): void; // null to remove
  loadDrumSample(note: number, url: string): Promise<void>;
  resume(): Promise<void>;
  // Synth configuration per channel (0-15)
  getChannelConfig(channel: number): SynthChannelConfig;
  setChannelConfig(channel: number, patch: Partial<SynthChannelConfig>): void;
}

type Voice = { stop: () => void };

class WebAudioBackend implements ISoundBackend {
  private ctx: AudioContext | null = null;
  private playing: Set<Voice> = new Set();
  private activeNotes: Map<string, Voice> = new Map(); // key: `${channel}:${note}`
  private drumSamples: DrumSampleMap = new Map();
  private channelCfg: SynthChannelConfig[] = Array.from({ length: 16 }, () => ({ ...DEFAULT_CHANNEL_CONFIG }));
  private master: GainNode | null = null;

  constructor() {
    // Initialize musical presets per channel (0-8 synths, 9 = drums)
    // 0: Sine basic
    this.channelCfg[0] = {
      ...DEFAULT_CHANNEL_CONFIG,
      osc1Type: 'sine', osc2Routing: 'off', voices: 1, spreadCents: 0,
      adsr: { attack: 0.005, decay: 0.12, sustain: 0.6, release: 0.25 },
      masterGain: 0.25,
    };
    // 1: Pluck (short, bright)
    this.channelCfg[1] = {
      ...DEFAULT_CHANNEL_CONFIG,
      osc1Type: 'sawtooth', osc2Routing: 'off', voices: 1, spreadCents: 0,
      adsr: { attack: 0.002, decay: 0.18, sustain: 0.08, release: 0.12 },
      masterGain: 0.25,
    };
    // 2: Saw lead (slight unison)
    this.channelCfg[2] = {
      ...DEFAULT_CHANNEL_CONFIG,
      osc1Type: 'sawtooth', osc2Routing: 'off', voices: 3, spreadCents: 12,
      adsr: { attack: 0.01, decay: 0.16, sustain: 0.5, release: 0.22 },
      masterGain: 0.22,
    };
    // 3: Square organ
    this.channelCfg[3] = {
      ...DEFAULT_CHANNEL_CONFIG,
      osc1Type: 'square', osc2Routing: 'off', voices: 1, spreadCents: 0,
      adsr: { attack: 0.005, decay: 0.08, sustain: 0.8, release: 0.2 },
      masterGain: 0.22,
    };
    // 4: Triangle pad
    this.channelCfg[4] = {
      ...DEFAULT_CHANNEL_CONFIG,
      osc1Type: 'triangle', voices: 4, spreadCents: 18,
      adsr: { attack: 0.12, decay: 0.4, sustain: 0.7, release: 0.8 },
      masterGain: 0.2,
    };
    // 5: FM bell (sine carrier, sine mod)
    this.channelCfg[5] = {
      ...DEFAULT_CHANNEL_CONFIG,
      osc1Type: 'sine', osc2Type: 'sine', osc2Routing: 'fm', osc2Ratio: 2.0, osc2Level: 0.55,
      voices: 1, spreadCents: 0,
      adsr: { attack: 0.002, decay: 0.35, sustain: 0.0, release: 1.2 },
      masterGain: 0.2,
    };
    // 6: AM trem (sine carrier, slow AM)
    this.channelCfg[6] = {
      ...DEFAULT_CHANNEL_CONFIG,
      osc1Type: 'sine', osc2Type: 'sine', osc2Routing: 'am', osc2Ratio: 0.02, osc2Level: 0.6,
      voices: 1, spreadCents: 0,
      adsr: { attack: 0.02, decay: 0.18, sustain: 0.7, release: 0.35 },
      masterGain: 0.22,
    };
    // 7: Dual mix (saw+square), wider
    this.channelCfg[7] = {
      ...DEFAULT_CHANNEL_CONFIG,
      osc1Type: 'sawtooth', osc2Type: 'square', osc2Routing: 'mix', osc2Ratio: 1.0, osc2Level: 0.4,
      voices: 5, spreadCents: 20,
      adsr: { attack: 0.015, decay: 0.22, sustain: 0.55, release: 0.4 },
      masterGain: 0.18,
    };
    // 8: Wide pad
    this.channelCfg[8] = {
      ...DEFAULT_CHANNEL_CONFIG,
      osc1Type: 'sawtooth', osc2Type: 'triangle', osc2Routing: 'mix', osc2Level: 0.25, osc2Ratio: 1.0,
      voices: 6, spreadCents: 35,
      adsr: { attack: 0.15, decay: 0.6, sustain: 0.75, release: 1.2 },
      masterGain: 0.16,
    };
    // Drums at 9 (synth config not used)
  }

  private ensureCtx() {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return this.ctx!;
  }

  async resume(): Promise<void> {
    const ctx = this.ensureCtx();
    if (ctx.state !== 'running') await ctx.resume();
    // lazily create master
    if (!this.master) {
      const g = ctx.createGain();
      g.gain.value = 1.0;
      g.connect(ctx.destination);
      this.master = g;
    }
  }

  allNotesOff() {
    for (const v of Array.from(this.playing)) try { v.stop(); } catch {}
    this.playing.clear();
    this.activeNotes.clear();
  }

  setDrumSample(note: number, buffer: AudioBuffer | null) {
    if (!buffer) this.drumSamples.delete(note); else this.drumSamples.set(note, buffer);
  }

  async loadDrumSample(note: number, url: string): Promise<void> {
    const ctx = this.ensureCtx();
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(arr);
    this.drumSamples.set(note, buf);
  }

  private key(channel: number, note: number) { return `${channel|0}:${note|0}`; }

  getChannelConfig(channel: number): SynthChannelConfig {
    return { ...this.channelCfg[(channel|0) & 0x0f] };
  }

  setChannelConfig(channel: number, patch: Partial<SynthChannelConfig>) {
    const idx = (channel|0) & 0x0f;
    this.channelCfg[idx] = { ...this.channelCfg[idx], ...patch };
  }

  noteOn(note: number, velocity: number = 100, channel: number = 0) {
    const ctx = this.ensureCtx();
    const t = ctx.currentTime + 0.001;
    const v = Math.max(0.01, Math.min(1, velocity / 127));
    const k = this.key(channel, note);
    // Simple de-dupe: stop any prior active voice for the same key
    const prev = this.activeNotes.get(k);
    if (prev) {
      try { prev.stop(); } catch {}
      this.activeNotes.delete(k);
    }
    let voice: Voice;
    if ((channel|0) === 9) voice = this.playDrum(ctx, note|0, v, t);
    else voice = this.playInstrument(ctx, channel|0, note|0, v, t);
    this.playing.add(voice);
    this.activeNotes.set(k, voice);
  }

  noteOff(note: number, _velocity: number = 0, channel: number = 0) {
    const k = this.key(channel, note);
    const voice = this.activeNotes.get(k);
    if (voice) {
      try { voice.stop(); } catch {}
      this.activeNotes.delete(k);
    }
  }

  // -------- Instruments (channels 0-8) --------
  private playInstrument(ctx: AudioContext, channel: number, note: number, v: number, t: number): Voice {
    const cfg = this.channelCfg[(channel|0) & 0x0f];
    const freq = 440 * Math.pow(2, (note - 69) / 12);

    const outGain = ctx.createGain();
    outGain.gain.setValueAtTime(cfg.masterGain * v, t);
    (this.master ?? ctx.destination) && outGain.connect(this.master ?? ctx.destination);

    // Envelope gain applied to voice bus
    const envGain = ctx.createGain();
    envGain.gain.setValueAtTime(0.0001, t);
    envGain.connect(outGain);

    // ADSR attack/decay/sustain
    const { attack, decay, sustain, release } = cfg.adsr;
    envGain.gain.linearRampToValueAtTime(1, t + Math.max(0.001, attack));
    envGain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, sustain)), t + Math.max(0.001, attack) + Math.max(0.001, decay));

    // Build detuned voices
    const n = Math.max(1, Math.min(8, Math.floor(cfg.voices || 1)));
    const spread = Math.max(0, Math.min(200, cfg.spreadCents || 0));
    const subNodes: { oscs: OscillatorNode[]; stop: () => void }[] = [];
    const mid = (n - 1) / 2;
    for (let i = 0; i < n; i++) {
      const pos = mid === 0 ? 0 : (i - mid) / mid; // -1..1
      const cents = pos * spread;
      const ratio = Math.pow(2, cents / 1200);
      const f1 = freq * ratio;
      const weight = mid === 0 ? 1 : 1 - 0.85 * Math.abs(pos); // louder center, quieter edges

      // per-voice submix to control weighting
      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(weight, t);
      subGain.connect(envGain);

      // Primary oscillator
      const osc1 = ctx.createOscillator();
      osc1.type = cfg.osc1Type;
      osc1.frequency.setValueAtTime(f1, t);

      const voiceEnders: OscillatorNode[] = [osc1];

      // Build routing
      if (cfg.osc2Routing === 'off') {
        osc1.connect(subGain);
        osc1.start(t);
      } else if (cfg.osc2Routing === 'mix') {
        const mixGain1 = ctx.createGain(); mixGain1.gain.value = 1;
        const mixGain2 = ctx.createGain(); mixGain2.gain.value = Math.max(0, Math.min(1, cfg.osc2Level));
        const osc2 = ctx.createOscillator();
        osc2.type = cfg.osc2Type;
        osc2.frequency.setValueAtTime(f1 * Math.max(0.01, cfg.osc2Ratio || 1), t);
        osc1.connect(mixGain1).connect(subGain);
        osc2.connect(mixGain2).connect(subGain);
        osc1.start(t); osc2.start(t);
        voiceEnders.push(osc2);
      } else if (cfg.osc2Routing === 'am') {
        // amplitude modulation: osc1 -> amGain -> subGain. osc2 -> depth -> amGain.gain
        const amGain = ctx.createGain();
        const depth = Math.max(0, Math.min(1, cfg.osc2Level));
        // Center gain around 1 - depth/2 to keep average level similar
        amGain.gain.setValueAtTime(1 - depth * 0.5, t);
        const depthGain = ctx.createGain(); depthGain.gain.value = depth * 0.5; // [-0.5..0.5]
        const osc2 = ctx.createOscillator();
        osc2.type = cfg.osc2Type;
        osc2.frequency.setValueAtTime(f1 * Math.max(0.01, cfg.osc2Ratio || 1), t);
        osc2.connect(depthGain).connect(amGain.gain);
        osc1.connect(amGain).connect(subGain);
        osc1.start(t); osc2.start(t);
        voiceEnders.push(osc2);
      } else { // 'fm'
        const fmGain = ctx.createGain();
        const depth = Math.max(0, Math.min(1, cfg.osc2Level));
        // map depth 0..1 to a sensible Hz range relative to base
        const maxHz = Math.max(10, Math.min(1200, f1 * 0.5));
        fmGain.gain.setValueAtTime(depth * maxHz, t);
        const osc2 = ctx.createOscillator();
        osc2.type = cfg.osc2Type;
        osc2.frequency.setValueAtTime(f1 * Math.max(0.01, cfg.osc2Ratio || 1), t);
        osc2.connect(fmGain).connect(osc1.frequency);
        osc1.connect(subGain);
        osc1.start(t); osc2.start(t);
        voiceEnders.push(osc2);
      }

      subNodes.push({ oscs: voiceEnders, stop: () => {
        for (const o of voiceEnders) { try { o.stop(); } catch {} }
      } });
    }

    const stopAt = (end: number) => {
      const now = ctx.currentTime;
      const relStart = Math.max(now, end);
      envGain.gain.cancelScheduledValues(relStart);
      envGain.gain.setTargetAtTime(0.0001, relStart, Math.max(0.001, release));
      const stopTime = relStart + Math.max(0.02, release) + 0.05;
      for (const s of subNodes) { try { s.oscs.forEach(o => o.stop(stopTime)); } catch {} }
    };

    const voice: Voice = { stop: () => stopAt(ctx.currentTime) };
    // clean-up: when the last osc ends, remove from playing
    const lastOsc = subNodes[subNodes.length - 1]?.oscs[0];
    if (lastOsc) lastOsc.onended = () => this.playing.delete(voice);
    return voice;
  }

  // -------- Drums (channel 9) --------
  private playDrum(ctx: AudioContext, note: number, v: number, t: number): Voice {
    // If a sample exists for the note, use it
    const sample = this.drumSamples.get(note);
    if (sample) {
      const src = ctx.createBufferSource(); const g = ctx.createGain();
      g.gain.setValueAtTime(0.7 * v, t);
      src.buffer = sample; src.connect(g).connect(ctx.destination);
      src.start(t);
      const voice: Voice = { stop: () => { try { src.stop(); } catch {} } };
      src.onended = () => this.playing.delete(voice);
      return voice;
    }

    // Synthesis fallbacks
    const drum = this.mapDrum(note);
    switch (drum) {
      case 'kick': return this.drumKick(ctx, t, v);
      case 'snare': return this.drumSnare(ctx, t, v);
      case 'clap': return this.drumClap(ctx, t, v);
      case 'ch': return this.drumHat(ctx, t, v, false);
      case 'oh': return this.drumHat(ctx, t, v, true);
      case 'toml': return this.drumTom(ctx, t, v, 90);
      case 'tomm': return this.drumTom(ctx, t, v, 140);
      case 'tomh': return this.drumTom(ctx, t, v, 200);
      case 'crash': return this.drumCymbal(ctx, t, v, true);
      case 'ride': return this.drumCymbal(ctx, t, v, false);
      default: return this.drumHat(ctx, t, v, false);
    }
  }

  private mapDrum(note: number): 'kick'|'snare'|'clap'|'ch'|'oh'|'toml'|'tomm'|'tomh'|'crash'|'ride' {
    // Common GM mapping
    if (note === 35 || note === 36) return 'kick';
    if (note === 38 || note === 40) return 'snare';
    if (note === 39) return 'clap';
    if (note === 42 || note === 44) return 'ch';
    if (note === 46) return 'oh';
    if (note === 41 || note === 43) return 'toml';
    if (note === 45 || note === 47) return 'tomm';
    if (note === 48 || note === 50) return 'tomh';
    if (note === 49 || note === 57) return 'crash';
    if (note === 51 || note === 59) return 'ride';
    // Defaults
    if (note <= 41) return 'kick';
    if (note <= 45) return 'snare';
    if (note <= 48) return 'ch';
    if (note <= 50) return 'oh';
    return 'ch';
  }

  private drumKick(ctx: AudioContext, t: number, v: number): Voice {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.9 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.3);
    const voice: Voice = { stop: () => { try { o.stop(); } catch {} } };
    o.onended = () => this.playing.delete(voice);
    return voice;
  }

  private drumSnare(ctx: AudioContext, t: number, v: number): Voice {
    const bufferSize = Math.floor(0.2 * ctx.sampleRate);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.setValueAtTime(1200, t);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.6 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    noise.connect(hp).connect(g).connect(ctx.destination);
    noise.start(t); noise.stop(t + 0.2);
    const voice: Voice = { stop: () => { try { noise.stop(); } catch {} } };
    noise.onended = () => this.playing.delete(voice);
    return voice;
  }

  private drumClap(ctx: AudioContext, t: number, v: number): Voice {
    const mkNoise = () => {
      const bufferSize = Math.floor(0.3 * ctx.sampleRate);
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer; return noise;
    };
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5 * v, t);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.setValueAtTime(800, t);
    g.connect(ctx.destination);
    const bursts = [0, 0.02, 0.04, 0.08];
    bursts.forEach((d, i) => {
      const n = mkNoise();
      const gg = ctx.createGain(); gg.gain.setValueAtTime(0.7 * v / (i+1), t + d); gg.gain.exponentialRampToValueAtTime(0.001, t + d + 0.12);
      n.connect(hp).connect(gg).connect(g);
      n.start(t + d); n.stop(t + d + 0.15);
    });
    const voice: Voice = { stop: () => { /* bursts are short-lived; nothing to stop */ } };
    return voice;
  }

  private drumHat(ctx: AudioContext, t: number, v: number, open: boolean): Voice {
    const bufferSize = Math.floor(0.1 * ctx.sampleRate);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.setValueAtTime(6000, t);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.25 * v, t);
    const dur = open ? 0.35 : 0.06;
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(hp).connect(g).connect(ctx.destination);
    noise.start(t); noise.stop(t + dur);
    const voice: Voice = { stop: () => { try { noise.stop(); } catch {} } };
    noise.onended = () => this.playing.delete(voice);
    return voice;
  }

  private drumTom(ctx: AudioContext, t: number, v: number, f: number): Voice {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.8, t + 0.08);
    g.gain.setValueAtTime(0.4 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.25);
    const voice: Voice = { stop: () => { try { o.stop(); } catch {} } };
    o.onended = () => this.playing.delete(voice);
    return voice;
  }

  private drumCymbal(ctx: AudioContext, t: number, v: number, crash: boolean): Voice {
    const bufferSize = Math.floor(0.6 * ctx.sampleRate);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(crash ? 6000 : 5000, t); bp.Q.value = crash ? 0.7 : 1.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.2 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + (crash ? 1.2 : 0.8));
    noise.connect(bp).connect(g).connect(ctx.destination);
    noise.start(t); noise.stop(t + (crash ? 1.3 : 0.9));
    const voice: Voice = { stop: () => { try { noise.stop(); } catch {} } };
    noise.onended = () => this.playing.delete(voice);
    return voice;
  }
}

export const soundBackend: ISoundBackend = new WebAudioBackend();
