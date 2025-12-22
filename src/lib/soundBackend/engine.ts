// Sound backend library for WebAudio with MIDI-channel awareness.
// - Channels 0-8: simple instrument voices (different timbres per channel)
// - Channel 9: drum kit with common GM-style note mappings
// - Exposes a small interface used by UI (device tester, MIDI editor, MIDI input)
import type { DrumSampleMap, EffectInstance, ISoundBackend, OscType, SynthChannelConfig, TrackId } from './types';
import { DEFAULT_CHANNEL_CONFIG } from './types';
import { EffectChain } from './effectChain';
import { createEffectModule } from './effects';

type Voice = { stop: () => void };

// Detailed voice for live modulation
type LiveVoice = Voice & {
  channel: number;
  filter?: BiquadFilterNode;
  filterBase: number;
  tremDepth?: GainNode; // amount injected into postGain.gain
  postGain?: GainNode;
  vibratoGain?: GainNode;
  depthGains?: GainNode[]; // for mix/am/fm depth control
  oscs?: OscillatorNode[]; // for glide
};

const CC_SLEW_SEC = 0.035; // faster 35ms smoothing for touch-driven CCs (more responsive)

export class WebAudioBackend implements ISoundBackend {
  private ctx: AudioContext | null = null;
  private playing: Set<Voice> = new Set();
  private channelVoices: Map<number, Set<LiveVoice>> = new Map();
  private heldNotes: Map<number, Set<number>> = new Map(); // for monophonic retrigger/glide
  private activeNotes: Map<string, Voice> = new Map(); // key: `${channel}:${note}`
  private drumSamples: DrumSampleMap = new Map();
  private channelCfg: SynthChannelConfig[] = Array.from({ length: 16 }, () => ({ ...DEFAULT_CHANNEL_CONFIG }));
  private masterInputGainNode: GainNode | null = null;
  private masterCompressorNode: DynamicsCompressorNode | null = null;
  private masterEffectChain: EffectChain | null = null;
  private trackEffectChains: Map<string, EffectChain> = new Map();
  private trackEffectState: Map<string, EffectInstance[]> = new Map([
    ['master', [{
      id: 'master-reverb',
      type: 'reverb',
      settings: { mix: 0.1, time: 1.6, decay: 3.0, preDelay: 0.02 },
    }]],
  ]);
  private ccValues: Map<string, number> = new Map(); // key: `${channel}:${controller}`
  private lastNoteTime: Map<number, number> = new Map(); // channel -> last noteOn timestamp

  // Create antialiased custom waveforms using PeriodicWave
  private getCustomWave(ctx: AudioContext, type: OscType): PeriodicWave | null {
    if (type === 'supersaw') {
      // Supersaw: layered sawtooths with slight detune
      const size = 2048;
      const real = new Float32Array(size);
      const imag = new Float32Array(size);
      for (let n = 1; n < size; n++) {
        // Sawtooth harmonics with rolloff
        real[n] = 0;
        imag[n] = (1 / n) * 0.85; // softer than pure saw
      }
      return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    } else if (type === 'fold') {
      // Wave folding effect (controlled harmonic distortion)
      const size = 2048;
      const real = new Float32Array(size);
      const imag = new Float32Array(size);
      for (let n = 1; n < size; n++) {
        // Odd harmonics with folding character
        if (n % 2 === 1) {
          real[n] = (1 / (n * n)) * Math.cos(n * 0.5);
          imag[n] = (1 / (n * n)) * Math.sin(n * 0.5);
        }
      }
      return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    } else if (type === 'pulse') {
      // Pulse wave (narrow pulse, 25% duty cycle)
      const size = 2048;
      const real = new Float32Array(size);
      const imag = new Float32Array(size);
      const duty = 0.25; // 25% pulse width
      for (let n = 1; n < size; n++) {
        real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
      }
      return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    }
    return null;
  }

  constructor() {
    // Initialize musical presets per channel
    // MONKEY device mapping: Device shows CH0-CH9, sends MIDI channels 9,0-8
    // Device CH0 → MIDI channel 9 (drums)
    // Device CH1 → MIDI channel 0 (first synth)
    // Device CH2 → MIDI channel 1 (second synth)
    // ...
    // Device CH9 → MIDI channel 8 (ninth synth)
    
    // CH0 (MIDI 0): SOFT BELL
    this.channelCfg[0] = {
      ...DEFAULT_CHANNEL_CONFIG,
      osc1Type: 'sine', osc2Type: 'sine', osc2Routing: 'fm', osc2Ratio: 2.5, osc2Level: 0.4,
      voices: 1, spreadCents: 0,
      adsr: { attack: 0.001, decay: 0.5, sustain: 0.1, release: 1.8 },
      masterGain: 0.08,
      filterType: 'lowpass', filterFrequency: 2800, filterQ: 1.2, filterEnvAmount: 0.25,
      eqLowGain: -4,
      mod: { cutoff: 0.7, vibrato: 0.25, tremolo: 0, osc2Depth: 0.45, spread: 0 },
    };
    // CH1 (MIDI 1): PLUCK (with chorus for spatial effect)
    this.channelCfg[1] = {
      ...DEFAULT_CHANNEL_CONFIG,
      osc1Type: 'sawtooth', osc2Routing: 'off', voices: 1, spreadCents: 0,
      adsr: { attack: 0.001, decay: 0.15, sustain: 0.05, release: 0.18 },
      masterGain: 0.08,
      filterType: 'lowpass', filterFrequency: 5000, filterQ: 1.5, filterEnvAmount: 0.5,
      chorusMix: 0.25, chorusDepthMs: 2.5, chorusRateHz: 1.2,
      mod: { cutoff: 0.8, vibrato: 0.0, tremolo: 0.0, osc2Depth: 0, spread: 0 },
    };
    // CH2 (MIDI 2): SAW LEAD (monophonic)
    this.channelCfg[2] = {
      ...DEFAULT_CHANNEL_CONFIG,
      osc1Type: 'sawtooth', osc2Routing: 'off', voices: 2, spreadCents: 8,
      adsr: { attack: 0.001, decay: 0.12, sustain: 0.55, release: 0.22 },
      masterGain: 0.4,
      filterType: 'lowpass', filterFrequency: 2200, filterQ: 1.8, filterEnvAmount: 0.35,
      monophonic: true,
      portamentoSec: 0.06,
      mod: { cutoff: 1, vibrato: 0.7, tremolo: 0, osc2Depth: 0, spread: 0.2 },
    };
    // CH3 (MIDI 3): SQUARE ORGAN
    this.channelCfg[3] = {
      ...DEFAULT_CHANNEL_CONFIG,
      osc1Type: 'square', osc2Routing: 'off', voices: 1, spreadCents: 0,
      adsr: { attack: 0.005, decay: 0.08, sustain: 0.8, release: 0.15 },
      masterGain: 0.05,
      filterType: 'lowpass', filterFrequency: 2000, filterQ: 1, filterEnvAmount: 0,
      mod: { cutoff: 0.5, vibrato: 0.0, tremolo: 0.6, osc2Depth: 0, spread: 0 },
    };
    // CH4 (MIDI 4): MELLOW PAD
    this.channelCfg[4] = {
      ...DEFAULT_CHANNEL_CONFIG,
      osc1Type: 'triangle', osc2Routing: 'off', voices: 4, spreadCents: 15,
      adsr: { attack: 0.2, decay: 0.4, sustain: 0.7, release: 1.2 },
      masterGain: 0.16,
      filterType: 'lowpass', filterFrequency: 8000, filterQ: 0.9, filterEnvAmount: 0.25,
      mod: { cutoff: 0.7, vibrato: 0.4, tremolo: 0.2, osc2Depth: 0, spread: 0.2 },
    };
    // CH5 (MIDI 5): REED ORGAN
    this.channelCfg[5] = {
      ...DEFAULT_CHANNEL_CONFIG,
      osc1Type: 'sawtooth', osc2Type: 'square', osc2Routing: 'mix', osc2Ratio: 2.0, osc2Level: 0.3,
      voices: 1, spreadCents: 0,
      adsr: { attack: 0.01, decay: 0.1, sustain: 0.75, release: 0.25 },
      masterGain: 0.18,
      filterType: 'bandpass', filterFrequency: 1500, filterQ: 3.0, filterEnvAmount: 0.15,
      mod: { cutoff: 0.6, vibrato: 0.0, tremolo: 0.6, osc2Depth: 0, spread: 0 },
    };
    // CH6 (MIDI 6): SYNTH BASS (monophonic)
    this.channelCfg[6] = {
      ...DEFAULT_CHANNEL_CONFIG,
      osc1Type: 'sawtooth', osc2Type: 'square', osc2Routing: 'mix', osc2Ratio: 1.0, osc2Level: 0.3,
      voices: 1, spreadCents: 0,
      adsr: { attack: 0.002, decay: 0.18, sustain: 0.55, release: 0.18 },
      masterGain: 0.08,
      filterType: 'lowpass', filterFrequency: 700, filterQ: 4.0, filterEnvAmount: 0.65,
      monophonic: true,
      portamentoSec: 0.045,
      mod: { cutoff: 1, vibrato: 0, tremolo: 0, osc2Depth: 0.4, spread: 0 },
    };
    // CH7 (MIDI 7): SYNTH PAD (glassy bandpass - polyphonic)
    this.channelCfg[7] = {
      ...DEFAULT_CHANNEL_CONFIG,
      osc1Type: 'triangle', osc2Type: 'square', osc2Routing: 'mix', osc2Ratio: 2.0, osc2Level: 0.25,
      voices: 4, spreadCents: 12,
      adsr: { attack: 0.18, decay: 0.35, sustain: 0.72, release: 1.1 },
      masterGain: 0.23,
      filterType: 'bandpass', filterFrequency: 1600, filterQ: 2.2, filterEnvAmount: 0.2,
      monophonic: false,
      mod: { cutoff: 0.6, vibrato: 0.2, tremolo: 0.5, osc2Depth: 0.2, spread: 0.1 },
    };
    // CH8 (MIDI 8): WIDE PAD (lush LP, more detune)
    this.channelCfg[8] = {
      ...DEFAULT_CHANNEL_CONFIG,
      osc1Type: 'sawtooth', osc2Type: 'triangle', osc2Routing: 'mix', osc2Level: 0.28, osc2Ratio: 1.0,
      voices: 6, spreadCents: 35,
      adsr: { attack: 0.22, decay: 0.5, sustain: 0.78, release: 1.9 },
      masterGain: 0.04,
      filterType: 'lowpass', filterFrequency: 2200, filterQ: 1.0, filterEnvAmount: 0.25,
      mod: { cutoff: 0.8, vibrato: 0.6, tremolo: 0.0, osc2Depth: 0, spread: 0.3 },
    };
    // Channel 9: DRUMS (device CH0) - Synth layer for tonal percussion
    this.channelCfg[9] = {
      ...DEFAULT_CHANNEL_CONFIG,
      osc1Type: 'sine', osc2Type: 'sine', osc2Routing: 'fm', osc2Ratio: 1.5, osc2Level: 0.6,
      voices: 1, spreadCents: 0,
      adsr: { attack: 0.001, decay: 0.08, sustain: 0.0, release: 0.05 },
      masterGain: 0.0, // Start muted, can be increased for synth layer
      filterType: 'lowpass', filterFrequency: 8000, filterQ: 1.0, filterEnvAmount: 0.5,
      mod: { cutoff: 0.5, vibrato: 0, tremolo: 0, osc2Depth: 0.3, spread: 0 },
    };
  }

  private ensureCtx() {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return this.ctx!;
  }

  private clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v));
  }

  private ensureAudioGraph() {
    const context = this.ensureCtx();
    if (this.masterInputGainNode && this.masterEffectChain && this.masterCompressorNode) return;

    this.masterInputGainNode = context.createGain();
    this.masterInputGainNode.gain.value = 1.0;

    this.masterEffectChain = new EffectChain(context);
    this.masterInputGainNode.connect(this.masterEffectChain.input);

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-8, context.currentTime);
    compressor.knee.setValueAtTime(12, context.currentTime);
    compressor.ratio.setValueAtTime(8, context.currentTime);
    compressor.attack.setValueAtTime(0.003, context.currentTime);
    compressor.release.setValueAtTime(0.25, context.currentTime);
    this.masterCompressorNode = compressor;

    this.masterEffectChain.output.connect(this.masterCompressorNode);
    this.masterCompressorNode.connect(context.destination);

    this.applyEffectsToChain('master', this.masterEffectChain);
  }

  private ensureTrackChain(trackKey: string): EffectChain {
    const context = this.ensureCtx();
    this.ensureAudioGraph();

    let chain = this.trackEffectChains.get(trackKey);
    if (!chain) {
      chain = new EffectChain(context);
      chain.output.connect(this.masterInputGainNode!);
      this.trackEffectChains.set(trackKey, chain);
      this.applyEffectsToChain(trackKey, chain);
    }
    return chain;
  }

  private applyEffectsToChain(trackKey: string, chain: EffectChain) {
    if (!this.ctx) return;
    const effectInstances = this.trackEffectState.get(trackKey) ?? [];
    chain.setEffects(effectInstances, (effectInstance) => createEffectModule(this.ctx!, effectInstance));
  }

  private trackKeyFromId(trackId: TrackId): string {
    return trackId === 'master' ? 'master' : String(trackId);
  }

  private getTrackInputNode(channel: number): AudioNode {
    const trackKey = this.trackKeyFromId((channel | 0) & 0x0f);
    const chain = this.ensureTrackChain(trackKey);
    return chain.input;
  }

  async resume(): Promise<void> {
    const ctx = this.ensureCtx();
    if (ctx.state !== 'running') await ctx.resume();
    this.ensureAudioGraph();
  }

  setCC(controller: number, value: number, channel: number) {
    const ch = (channel | 0) & 0x0f;
    const key = `${ch}:${controller | 0}`;
    const v = Math.max(0, Math.min(127, value | 0));
    // If holding mod wheel, ignore hardware resets to 0; UI can override
    const cfg = this.channelCfg[ch];
    if (controller === 1 && cfg.modWheelHold && v === 0) {
      // ignore reset-to-zero from touch release
    } else {
      this.ccValues.set(key, v);
    }
    // Live update on active voices for this channel
    const voices = this.channelVoices.get(ch);
    if (!voices || voices.size === 0) return;
    const cc1 = this.getCC(1, ch);
    const cc74 = this.getCC(74, ch);
    const ccMod = Math.pow(Math.max(cc1, cc74) / 127, 0.6);
    const t = this.ensureCtx().currentTime + 0.002;
    for (const lv of voices) {
      // Filter cutoff
      if (lv.filter) {
        const base = lv.filterBase;
        const sens = Math.max(0, Math.min(2, cfg.modSensitivity ?? 1));
        const modAmt = (cfg.mod?.cutoff ?? 0) * sens * Math.pow(cc1 / 127, 0.6);
        const scaled = base * (0.6 + 2.4 * modAmt);
        lv.filter.frequency.setTargetAtTime(Math.max(20, Math.min(20000, scaled)), t, CC_SLEW_SEC);
      }
      // Tremolo depth (amp LFO)
      if (lv.tremDepth && lv.postGain) {
        const baseDepth = Math.max(0, Math.min(1, cfg.lfoDepth ?? 0));
        const ccScale = Math.max(0, Math.min(1, cfg.lfoCc1Scale ?? 1));
        const sens = Math.max(0, Math.min(2, cfg.modSensitivity ?? 1));
        const depth = (baseDepth + ccScale * ccMod * sens) * 0.5; // normalized
        lv.tremDepth.gain.setTargetAtTime(depth, t, CC_SLEW_SEC);
        lv.postGain.gain.setTargetAtTime(1 - depth, t, CC_SLEW_SEC);
      }
      // Vibrato depth
      if (lv.vibratoGain) {
        const sens = Math.max(0, Math.min(2, cfg.modSensitivity ?? 1));
        const vib = Math.max(0, Math.min(1, (cfg.mod?.vibrato ?? 0) * sens * Math.pow(cc1 / 127, 0.6)));
        // Increase range for audibility
        lv.vibratoGain.gain.setTargetAtTime(vib * 7, t, CC_SLEW_SEC);
      }
      // Osc2 depth nodes
      if (lv.depthGains && lv.depthGains.length) {
        const sens = Math.max(0, Math.min(2, cfg.modSensitivity ?? 1));
        const add = (cfg.mod?.osc2Depth ?? 0) * sens * Math.pow(cc1 / 127, 0.6);
        for (const g of lv.depthGains) {
          const base = g.gain.value; // approximate
          const next = Math.max(0, Math.min(2, base + add * (1 - base)));
          g.gain.setTargetAtTime(next, t, CC_SLEW_SEC);
        }
      }
    }
  }

  private getCC(controller: number, channel: number): number {
    const key = `${(channel | 0) & 0x0f}:${controller | 0}`;
    return this.ccValues.get(key) ?? 0;
  }

  getCCValue(controller: number, channel: number): number {
    return this.getCC(controller, channel);
  }

  setCCUI(controller: number, value: number, channel: number) {
    const ch = (channel | 0) & 0x0f;
    const key = `${ch}:${controller | 0}`;
    const v = Math.max(0, Math.min(127, value | 0));
    this.ccValues.set(key, v);
    // trigger same live update path as setCC
    const voices = this.channelVoices.get(ch);
    if (!voices || voices.size === 0) return;
    const cfg = this.channelCfg[ch];
    const cc1 = this.getCC(1, ch);
    const cc74 = this.getCC(74, ch);
    const ccMod = Math.pow(Math.max(cc1, cc74) / 127, 0.6);
    const t = this.ensureCtx().currentTime + 0.002;
    for (const lv of voices) {
      if (lv.filter) {
        const base = lv.filterBase;
        const sens = Math.max(0, Math.min(2, cfg.modSensitivity ?? 1));
        const modAmt = (cfg.mod?.cutoff ?? 0) * sens * Math.pow(cc1 / 127, 0.6);
        const scaled = base * (0.6 + 2.4 * modAmt);
        lv.filter.frequency.setTargetAtTime(Math.max(20, Math.min(20000, scaled)), t, CC_SLEW_SEC);
      }
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

  getTrackEffects(trackId: TrackId): EffectInstance[] {
    const trackKey = this.trackKeyFromId(trackId);
    const effects = this.trackEffectState.get(trackKey) ?? [];
    return effects.map((effect) => ({ ...effect, settings: { ...effect.settings } }));
  }

  setTrackEffects(trackId: TrackId, effects: EffectInstance[]) {
    const trackKey = this.trackKeyFromId(trackId);
    const clonedEffects = effects.map((effect) => ({ ...effect, settings: { ...effect.settings } }));
    this.trackEffectState.set(trackKey, clonedEffects);
    if (!this.ctx) return;
    if (trackKey === 'master') {
      this.ensureAudioGraph();
      if (this.masterEffectChain) this.applyEffectsToChain(trackKey, this.masterEffectChain);
    } else {
      const chain = this.ensureTrackChain(trackKey);
      this.applyEffectsToChain(trackKey, chain);
    }
  }

  noteOn(note: number, velocity: number = 100, channel: number = 0) {
    const ctx = this.ensureCtx();
    this.ensureAudioGraph();
    const t = ctx.currentTime + 0.001;
    const v = Math.max(0.01, Math.min(1, velocity / 127));
    const k = this.key(channel, note);
    let voice: Voice;
    if ((channel|0) === 9) {
      // Drums on channel 9 (MONKEY device CH0 sends MIDI channel 9)
      const prev = this.activeNotes.get(k);
      if (prev) {
        try { prev.stop(); } catch {}
        this.activeNotes.delete(k);
      }
      voice = this.playDrum(ctx, note|0, v, t);
    } else {
      const ch = (channel|0) & 0x0f;
      const cfg = this.channelCfg[ch];
      // Track held notes and check if this note was already playing
      if (!this.heldNotes.has(ch)) this.heldNotes.set(ch, new Set());
      const held = this.heldNotes.get(ch)!;
      const wasAlreadyHeld = held.has(note|0);
      held.add(note|0);
      
      // Monophonic glide: if a live voice exists, retune instead of recreating
      const liveSet = this.channelVoices.get(ch);
      const glideSec = Math.max(0, Math.min(1, cfg.portamentoSec ?? 0));
      if (cfg.monophonic && liveSet && liveSet.size > 0) {
        const fTarget = 440 * Math.pow(2, ((note|0) - 69) / 12);
        // Legato detection: if other notes were already held when this note pressed, use glide
        // If no notes held (staccato), jump immediately
        const wasLegato = held.size > 1; // held already has current note, so >1 means others held
        
        for (const lv of liveSet) {
          // Always retrigger envelope on any note (including same note)
          if (lv.postGain) {
            lv.postGain.gain.cancelScheduledValues(t);
            lv.postGain.gain.setValueAtTime(0, t);
            lv.postGain.gain.linearRampToValueAtTime(1, t + Math.max(0.001, cfg.adsr.attack));
          }
          if (lv.oscs) {
            for (const o of lv.oscs) {
              try {
                o.frequency.cancelScheduledValues(t);
                // Staccato (no overlap): jump immediately. Legato (overlap): smooth glide
                if (!wasLegato || glideSec < 0.001) {
                  o.frequency.setValueAtTime(fTarget, t);
                } else {
                  // Use setTargetAtTime for smooth glide on legato playing
                  o.frequency.setTargetAtTime(fTarget, t, glideSec * 0.2);
                }
              } catch {}
            }
          }
        }
        // Reuse existing voice
        voice = Array.from(liveSet)[0];
      } else {
        voice = this.playInstrument(ctx, ch, note|0, v, t);
      }
    }
    this.playing.add(voice);
    this.activeNotes.set(k, voice);
  }

  noteOff(note: number, _velocity: number = 0, channel: number = 0) {
    const ch = (channel|0) & 0x0f;
    const cfg = this.channelCfg[ch];
    const k = this.key(channel, note);
    
    // Remove from held notes
    const held = this.heldNotes.get(ch);
    if (held) held.delete(note|0);
    
    // Monophonic: only stop voice if no other notes are held
    if (cfg.monophonic && held && held.size > 0) {
      // Don't stop voice, but remove this specific note mapping
      this.activeNotes.delete(k);
      return;
    }
    
    const voice = this.activeNotes.get(k);
    if (voice) {
      try { voice.stop(); } catch {}
      this.activeNotes.delete(k);
      // For monophonic, clear the channelVoices so next note creates fresh voice
      if (cfg.monophonic) {
        this.channelVoices.delete(ch);
      }
    }
  }

  // -------- Instruments (channels 0-8) --------
  private playInstrument(ctx: AudioContext, channel: number, note: number, v: number, t: number): LiveVoice {
    const cfg = this.channelCfg[(channel|0) & 0x0f];
    const freq = 440 * Math.pow(2, (note - 69) / 12);

    const outGain = ctx.createGain();
    outGain.gain.setValueAtTime(cfg.masterGain * v, t);
    const destinationNode = this.getTrackInputNode(channel);
    outGain.connect(destinationNode);

    // Filter (optional, between envelope and output)
    let filterNode: BiquadFilterNode | null = null;
    let filterEnvNode: AudioParam | null = null;
    let live: LiveVoice = { stop: () => {}, channel, filterBase: Math.max(20, Math.min(20000, cfg.filterFrequency)) } as LiveVoice;

    if (cfg.filterType && cfg.filterType !== 'none') {
      filterNode = ctx.createBiquadFilter();
      filterNode.type = cfg.filterType;
    const cc1 = this.getCC(1, channel); // mod wheel
    const cc74 = this.getCC(74, channel); // brightness
    // perceptual curve: gamma < 1 -> stronger at low/mid range
    const gamma = 0.6;
    const ccCurve = Math.pow(Math.max(cc1, cc74) / 127, gamma); // 0..1
    const sens = Math.max(0, Math.min(2, cfg.modSensitivity ?? 1));
    const cutoffAmt = Math.max(0, Math.min(1, (cfg.mod?.cutoff ?? 0) * sens));
    const baseCut = Math.max(20, Math.min(20000, cfg.filterFrequency));
    // CC boosts cutoff proportional to amount & sensitivity (up to ~3x when cutoffAmt=1)
    const ccScaled = baseCut * (0.6 + 2.4 * cutoffAmt * ccCurve);
    const baseFreq = Math.max(20, Math.min(20000, ccScaled));
      filterNode.frequency.setValueAtTime(baseFreq, t);
      filterNode.Q.setValueAtTime(Math.max(0.1, Math.min(20, cfg.filterQ)), t);
      filterNode.connect(outGain);
      filterEnvNode = filterNode.frequency;
      live.filter = filterNode; live.filterBase = baseFreq;
      
      // Apply filter envelope if configured
      if (cfg.filterEnvAmount && Math.abs(cfg.filterEnvAmount) > 0.01) {
        const envAmt = Math.max(-1, Math.min(1, cfg.filterEnvAmount));
        const envRange = baseFreq * envAmt * 2; // ±2 octaves scaled by amount
        const peakFreq = Math.max(20, Math.min(20000, baseFreq + envRange));
        
        // Filter envelope follows ADSR
        filterEnvNode.setValueAtTime(baseFreq, t);
        filterEnvNode.linearRampToValueAtTime(peakFreq, t + Math.max(0.001, cfg.adsr.attack));
        filterEnvNode.linearRampToValueAtTime(
          baseFreq + envRange * Math.max(0, Math.min(1, cfg.adsr.sustain)),
          t + Math.max(0.001, cfg.adsr.attack) + Math.max(0.001, cfg.adsr.decay)
        );
      }
    }

    // Envelope gain applied to voice bus
    const envGain = ctx.createGain();
    envGain.gain.setValueAtTime(0.0001, t);
    if (filterNode) envGain.connect(filterNode);
    else envGain.connect(outGain);

    // ADSR attack/decay/sustain
    // Velocity scaling (pluck/bass): reduce attack, increase sustain
    const v01 = Math.max(0, Math.min(1, v));
    const atkScale = 1 - Math.max(0, Math.min(1, cfg.velToAttack ?? 0)) * v01 * 0.8;
    const susScale = (cfg.velToSustain ?? 0) * v01;
    const { attack, decay, sustain, release } = cfg.adsr;
    const a = Math.max(0.001, attack * atkScale);
    const s = Math.max(0, Math.min(1, sustain * (1 - (cfg.velToSustain ?? 0)) + sustain * 0.5 * susScale + susScale));
    envGain.gain.linearRampToValueAtTime(1, t + a);
    envGain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, s)), t + a + Math.max(0.001, decay));
    envGain.gain.linearRampToValueAtTime(1, t + Math.max(0.001, attack));
    envGain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, sustain)), t + Math.max(0.001, attack) + Math.max(0.001, decay));

    // Build detuned voices
    const n = Math.max(1, Math.min(8, Math.floor(cfg.voices || 1)));
    const mw = this.getCC(1, channel) / 127;
    const spreadBase = Math.max(0, Math.min(200, cfg.spreadCents || 0));
    const spread = spreadBase + (cfg.mod?.spread ?? 0) * mw * 30;
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
      const customWave1 = this.getCustomWave(ctx, cfg.osc1Type);
      if (customWave1) {
        osc1.setPeriodicWave(customWave1);
      } else if (cfg.osc1Type !== 'noise') {
        osc1.type = cfg.osc1Type as OscillatorType;
      }
      osc1.frequency.setValueAtTime(f1, t);

      const voiceEnders: OscillatorNode[] = [osc1];

      // Build routing
      if (cfg.osc2Routing === 'off') {
        osc1.connect(subGain);
        osc1.start(t);
      } else if (cfg.osc2Routing === 'mix') {
        const mixGain1 = ctx.createGain(); mixGain1.gain.value = 1;
        const baseLevel = Math.max(0, Math.min(1, cfg.osc2Level));
        const mixGain2 = ctx.createGain(); mixGain2.gain.value = baseLevel + (cfg.mod?.osc2Depth ?? 0) * mw * (1 - baseLevel);
        const osc2 = ctx.createOscillator();
        const customWave2 = this.getCustomWave(ctx, cfg.osc2Type);
        if (customWave2) {
          osc2.setPeriodicWave(customWave2);
        } else if (cfg.osc2Type !== 'noise') {
          osc2.type = cfg.osc2Type as OscillatorType;
        }
        osc2.frequency.setValueAtTime(f1 * Math.max(0.01, cfg.osc2Ratio || 1), t);
        osc1.connect(mixGain1).connect(subGain);
        osc2.connect(mixGain2).connect(subGain);
        osc1.start(t); osc2.start(t);
        voiceEnders.push(osc2);
      } else if (cfg.osc2Routing === 'am') {
        // amplitude modulation: osc1 -> amGain -> subGain. osc2 -> depth -> amGain.gain
        const amGain = ctx.createGain();
        const baseDepth = Math.max(0, Math.min(1, cfg.osc2Level));
        const depth = baseDepth + (cfg.mod?.osc2Depth ?? 0) * mw * (1 - baseDepth);
        // Center gain around 1 - depth/2 to keep average level similar
        amGain.gain.setValueAtTime(1 - depth * 0.5, t);
        const depthGain = ctx.createGain(); depthGain.gain.value = depth * 0.5; // [-0.5..0.5]
        const osc2 = ctx.createOscillator();
        const customWave2AM = this.getCustomWave(ctx, cfg.osc2Type);
        if (customWave2AM) {
          osc2.setPeriodicWave(customWave2AM);
        } else if (cfg.osc2Type !== 'noise') {
          osc2.type = cfg.osc2Type as OscillatorType;
        }
        osc2.frequency.setValueAtTime(f1 * Math.max(0.01, cfg.osc2Ratio || 1), t);
        osc2.connect(depthGain).connect(amGain.gain);
        osc1.connect(amGain).connect(subGain);
        osc1.start(t); osc2.start(t);
        voiceEnders.push(osc2);
      } else { // 'fm'
        const fmGain = ctx.createGain();
        const baseDepth = Math.max(0, Math.min(1, cfg.osc2Level));
        const depth = baseDepth + (cfg.mod?.osc2Depth ?? 0) * mw * (1 - baseDepth);
        // map depth 0..1 to a sensible Hz range relative to base
        const maxHz = Math.max(10, Math.min(1200, f1 * 0.5));
        fmGain.gain.setValueAtTime(depth * maxHz, t);
        const osc2 = ctx.createOscillator();
        const customWave2FM = this.getCustomWave(ctx, cfg.osc2Type);
        if (customWave2FM) {
          osc2.setPeriodicWave(customWave2FM);
        } else if (cfg.osc2Type !== 'noise') {
          osc2.type = cfg.osc2Type as OscillatorType;
        }
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

    let didStop = false;
    const stopAt = (end: number) => {
      if (didStop) return; // guard double-stop
      didStop = true;
      const now = ctx.currentTime;
      const relStart = Math.max(now, end);
      envGain.gain.cancelScheduledValues(relStart);
      // de-click envelope: short linear ramp to current level, then exponential
      const current = envGain.gain.value;
      envGain.gain.setValueAtTime(current, relStart);
      envGain.gain.linearRampToValueAtTime(0.0001, relStart + Math.max(0.05, release));
      const stopTime = relStart + Math.max(0.1, release) + 0.12;
      for (const s of subNodes) { try { s.oscs.forEach(o => o.stop(stopTime)); } catch {} }
    };

    // Optional LFOs driven by mod wheel
    const vibratoAmt = (cfg.mod?.vibrato ?? 0) * mw;
    const tremAmt = (cfg.mod?.tremolo ?? 0) * mw;

    // Always create a post-gain stage to allow tremolo and level control
    const postGain = ctx.createGain();
    envGain.disconnect();
    envGain.connect(postGain);
    live.postGain = postGain;

    // Build tail chain for FX
    let tail: AudioNode = postGain;
    if (filterNode) { postGain.connect(filterNode); tail = filterNode; }

    // Drive (waveshaper)
    if ((cfg.drive ?? 0) > 0.001) {
      const amount = Math.max(0, Math.min(1, cfg.drive!));
      const pre = ctx.createGain(); pre.gain.value = 1 + amount * 9; // up to ~+20dB
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(4096);
      const k = 2 + amount * 50; // shape factor
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = (1 + k) * x / (1 + k * Math.abs(x)); // soft clip
      }
      shaper.curve = curve; shaper.oversample = '4x';
      tail.connect(pre).connect(shaper);
      tail = shaper;
    }

    // Chorus (simple delay modulation)
    let chorRouted = false;
    if ((cfg.chorusMix ?? 0) > 0.001 && (cfg.chorusDepthMs ?? 0) > 0) {
      const mix = Math.max(0, Math.min(1, cfg.chorusMix!));
      const depth = Math.max(0, Math.min(30, cfg.chorusDepthMs!)) / 1000; // to seconds
      const rate = Math.max(0.1, Math.min(7, cfg.chorusRateHz ?? 0.5));
      const wet = ctx.createGain(); wet.gain.value = mix;
      const dry = ctx.createGain(); dry.gain.value = 1 - mix;
      const d = ctx.createDelay(0.05); d.delayTime.value = 0.012;
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.setValueAtTime(rate, t);
      const lfoG = ctx.createGain(); lfoG.gain.value = depth;
      lfo.connect(lfoG).connect(d.delayTime);
      tail.connect(d).connect(wet);
      tail.connect(dry);
      wet.connect(outGain); dry.connect(outGain);
      lfo.start(t);
      chorRouted = true;
    }

    // 3-band EQ (always apply, even with no gain for consistency)
    const eqLow = (cfg.eqLowGain ?? 0);
    const eqMid = (cfg.eqMidGain ?? 0);
    const eqHigh = (cfg.eqHighGain ?? 0);
    
    // Low shelf at 100Hz
    const lowFilter = ctx.createBiquadFilter();
    lowFilter.type = 'lowshelf';
    lowFilter.frequency.setValueAtTime(100, t);
    lowFilter.gain.setValueAtTime(Math.max(-12, Math.min(12, eqLow)), t);
    
    // Mid peak at 1kHz
    const midFilter = ctx.createBiquadFilter();
    midFilter.type = 'peaking';
    midFilter.frequency.setValueAtTime(1000, t);
    midFilter.Q.setValueAtTime(1.0, t);
    midFilter.gain.setValueAtTime(Math.max(-12, Math.min(12, eqMid)), t);
    
    // High shelf at 8kHz
    const highFilter = ctx.createBiquadFilter();
    highFilter.type = 'highshelf';
    highFilter.frequency.setValueAtTime(8000, t);
    highFilter.gain.setValueAtTime(Math.max(-12, Math.min(12, eqHigh)), t);
    
    // Always connect EQ in series
    if (!chorRouted) {
      tail.connect(lowFilter).connect(midFilter).connect(highFilter).connect(outGain);
    } else {
      // Chorus routed to outGain - can't easily insert EQ, but we could refactor later
      // For now just skip EQ when chorus is active
    }

    // Tremolo (channel LFO) using configurable rate/depth with CC1 scaling
    if (tremAmt > 0 || (cfg.lfoDepth ?? 0) > 0) {
      const trem = ctx.createOscillator();
      trem.type = 'sine'; trem.frequency.setValueAtTime(Math.max(0.1, Math.min(20, cfg.lfoRateHz ?? 5.5)), t);
      const tremDepth = ctx.createGain();
      const baseDepth = Math.max(0, Math.min(1, cfg.lfoDepth ?? 0));
      const ccScale = Math.max(0, Math.min(1, cfg.lfoCc1Scale ?? 1));
      const cc1 = this.getCC(1, channel) / 127;
      const depth = Math.max(0, Math.min(0.9, baseDepth + ccScale * cc1));
      tremDepth.gain.value = depth * 0.5;
      // base around 1 - depth to avoid DC gain change
      postGain.gain.setValueAtTime(1 - tremDepth.gain.value, t);
      trem.connect(tremDepth).connect(postGain.gain);
      trem.start(t);
      live.tremDepth = tremDepth; live.postGain = postGain;
    }

    // Add gentle vibrato via LFO to each oscillator
    if (vibratoAmt > 0) {
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.setValueAtTime(5.5, t);
      const depthHz = Math.max(0.1, (freq * 0.01) * Math.min(1, vibratoAmt));
      const lfoGain = ctx.createGain(); lfoGain.gain.value = depthHz;
      live.vibratoGain = lfoGain;
      // Route to oscillators' frequency for each sub voice
      for (const s of subNodes) {
        for (const o of s.oscs) { lfo.connect(lfoGain).connect((o as OscillatorNode).frequency); }
      }
      lfo.start(t);
      const stopLFO = () => { try { lfo.stop(); } catch {} };
      const origStop2 = () => stopAt(ctx.currentTime);
      const voiceObj2: Voice = { stop: () => { stopLFO(); origStop2(); } };
    }

    // Prepare live voice registration
    live.stop = () => stopAt(ctx.currentTime);
    // Collect osc references for glide
    const allOscs: OscillatorNode[] = [];
    for (const s of subNodes) allOscs.push(...s.oscs);
    live.oscs = allOscs;

    // Register for live CC updates
    if (!this.channelVoices.has(channel)) this.channelVoices.set(channel, new Set());
    this.channelVoices.get(channel)!.add(live);

    const voice: LiveVoice = live;
    // clean-up: when the last osc ends, remove from playing
    const lastOsc = subNodes[subNodes.length - 1]?.oscs[0];
    if (lastOsc) lastOsc.onended = () => { this.playing.delete(voice); const set = this.channelVoices.get(channel); if (set) set.delete(live); };
    return voice;
  }

  // -------- Drums (channel 9) --------
  private playDrum(ctx: AudioContext, note: number, v: number, t: number): Voice {
    const destinationNode = this.getTrackInputNode(9);
    // If a sample exists for the note, use it
    const sample = this.drumSamples.get(note);
    if (sample) {
      const src = ctx.createBufferSource(); const g = ctx.createGain();
      g.gain.setValueAtTime(0.7 * v, t);
      src.buffer = sample; src.connect(g).connect(destinationNode);
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
    const destinationNode = this.getTrackInputNode(9);
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.9 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(destinationNode); o.start(t); o.stop(t + 0.3);
    const voice: Voice = { stop: () => { try { o.stop(); } catch {} } };
    o.onended = () => this.playing.delete(voice);
    return voice;
  }

  private drumSnare(ctx: AudioContext, t: number, v: number): Voice {
    const destinationNode = this.getTrackInputNode(9);
    const bufferSize = Math.floor(0.2 * ctx.sampleRate);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.setValueAtTime(1200, t);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.6 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    noise.connect(hp).connect(g).connect(destinationNode);
    noise.start(t); noise.stop(t + 0.2);
    const voice: Voice = { stop: () => { try { noise.stop(); } catch {} } };
    noise.onended = () => this.playing.delete(voice);
    return voice;
  }

  private drumClap(ctx: AudioContext, t: number, v: number): Voice {
    const destinationNode = this.getTrackInputNode(9);
    const mkNoise = () => {
      const bufferSize = Math.floor(0.3 * ctx.sampleRate);
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer; return noise;
    };
    const g = ctx.createGain(); g.gain.setValueAtTime(0.5 * v, t);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.setValueAtTime(800, t);
    g.connect(destinationNode);
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
    const destinationNode = this.getTrackInputNode(9);
    const bufferSize = Math.floor(0.1 * ctx.sampleRate);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.setValueAtTime(6000, t);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.25 * v, t);
    const dur = open ? 0.35 : 0.06;
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(hp).connect(g).connect(destinationNode);
    noise.start(t); noise.stop(t + dur);
    const voice: Voice = { stop: () => { try { noise.stop(); } catch {} } };
    noise.onended = () => this.playing.delete(voice);
    return voice;
  }

  private drumTom(ctx: AudioContext, t: number, v: number, f: number): Voice {
    const destinationNode = this.getTrackInputNode(9);
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.8, t + 0.08);
    g.gain.setValueAtTime(0.4 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(destinationNode); o.start(t); o.stop(t + 0.25);
    const voice: Voice = { stop: () => { try { o.stop(); } catch {} } };
    o.onended = () => this.playing.delete(voice);
    return voice;
  }

  private drumCymbal(ctx: AudioContext, t: number, v: number, crash: boolean): Voice {
    const destinationNode = this.getTrackInputNode(9);
    const bufferSize = Math.floor(0.6 * ctx.sampleRate);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(crash ? 6000 : 5000, t); bp.Q.value = crash ? 0.7 : 1.2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.2 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + (crash ? 1.2 : 0.8));
    noise.connect(bp).connect(g).connect(destinationNode);
    noise.start(t); noise.stop(t + (crash ? 1.3 : 0.9));
    const voice: Voice = { stop: () => { try { noise.stop(); } catch {} } };
    noise.onended = () => this.playing.delete(voice);
    return voice;
  }
}
