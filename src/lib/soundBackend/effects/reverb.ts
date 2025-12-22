import type { EffectModule, ReverbSettings } from '../types';

const DEFAULT_REVERB_SETTINGS: ReverbSettings = {
  mix: 0.3,
  time: 1.6,
  decay: 3.0,
  preDelay: 0.02,
};

export class ReverbEffect implements EffectModule {
  readonly id: string;
  readonly type = 'reverb' as const;
  readonly input: GainNode;
  readonly output: GainNode;

  private readonly context: AudioContext;
  private readonly dryGainNode: GainNode;
  private readonly wetGainNode: GainNode;
  private readonly preDelayNode: DelayNode;
  private readonly convolverNode: ConvolverNode;
  private settings: ReverbSettings;
  private lastImpulseTime: number;
  private lastImpulseDecay: number;

  constructor(context: AudioContext, id: string, settings?: Partial<ReverbSettings>) {
    this.context = context;
    this.id = id;
    this.input = this.context.createGain();
    this.output = this.context.createGain();
    this.dryGainNode = this.context.createGain();
    this.wetGainNode = this.context.createGain();
    this.preDelayNode = this.context.createDelay(1.0);
    this.convolverNode = this.context.createConvolver();
    this.settings = { ...DEFAULT_REVERB_SETTINGS, ...(settings ?? {}) };
    this.lastImpulseTime = this.settings.time;
    this.lastImpulseDecay = this.settings.decay;

    this.input.connect(this.dryGainNode);
    this.dryGainNode.connect(this.output);
    this.input.connect(this.preDelayNode);
    this.preDelayNode.connect(this.convolverNode);
    this.convolverNode.connect(this.wetGainNode);
    this.wetGainNode.connect(this.output);

    this.applySettings();
  }

  update(patch: Record<string, number>) {
    this.settings = { ...this.settings, ...(patch as Partial<ReverbSettings>) };
    this.applySettings();
  }

  dispose() {
    try { this.input.disconnect(); } catch {}
    try { this.output.disconnect(); } catch {}
    try { this.preDelayNode.disconnect(); } catch {}
    try { this.convolverNode.disconnect(); } catch {}
    try { this.dryGainNode.disconnect(); } catch {}
    try { this.wetGainNode.disconnect(); } catch {}
  }

  private applySettings() {
    const mix = this.clamp(this.settings.mix, 0, 1);
    const preDelaySeconds = this.clamp(this.settings.preDelay, 0, 1);
    const targetTime = this.clamp(this.settings.time, 0.1, 8);
    const targetDecay = this.clamp(this.settings.decay, 0.5, 10);

    this.dryGainNode.gain.setValueAtTime(1 - mix, this.context.currentTime);
    this.wetGainNode.gain.setValueAtTime(mix, this.context.currentTime);
    this.preDelayNode.delayTime.setValueAtTime(preDelaySeconds, this.context.currentTime);

    if (Math.abs(targetTime - this.lastImpulseTime) > 0.001 || Math.abs(targetDecay - this.lastImpulseDecay) > 0.001) {
      this.lastImpulseTime = targetTime;
      this.lastImpulseDecay = targetDecay;
      this.convolverNode.buffer = this.createImpulseBuffer(targetTime, targetDecay);
    } else if (!this.convolverNode.buffer) {
      this.convolverNode.buffer = this.createImpulseBuffer(targetTime, targetDecay);
    }
  }

  private createImpulseBuffer(seconds: number, decay: number): AudioBuffer {
    const length = Math.max(1, Math.floor(seconds * this.context.sampleRate));
    const buffer = this.context.createBuffer(2, length, this.context.sampleRate);
    for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex++) {
      const channelData = buffer.getChannelData(channelIndex);
      for (let sampleIndex = 0; sampleIndex < length; sampleIndex++) {
        const progress = sampleIndex / length;
        channelData[sampleIndex] = (Math.random() * 2 - 1) * Math.pow(1 - progress, decay);
      }
    }
    return buffer;
  }

  private clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }
}
