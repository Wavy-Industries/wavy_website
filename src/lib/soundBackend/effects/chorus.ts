import type { ChorusSettings, EffectModule } from '../types';

const DEFAULT_CHORUS_SETTINGS: ChorusSettings = {
  mix: 0.2,
  depth: 0.4,
  rate: 1.4,
};

export class ChorusEffect implements EffectModule {
  readonly id: string;
  readonly type = 'chorus' as const;
  readonly input: GainNode;
  readonly output: GainNode;

  private readonly context: AudioContext;
  private readonly dryGainNode: GainNode;
  private readonly wetGainNode: GainNode;
  private readonly delayNode: DelayNode;
  private readonly lfoNode: OscillatorNode;
  private readonly lfoDepthGainNode: GainNode;
  private settings: ChorusSettings;

  constructor(context: AudioContext, id: string, settings?: Partial<ChorusSettings>) {
    this.context = context;
    this.id = id;
    this.input = this.context.createGain();
    this.output = this.context.createGain();
    this.dryGainNode = this.context.createGain();
    this.wetGainNode = this.context.createGain();
    this.delayNode = this.context.createDelay(0.05);
    this.lfoNode = this.context.createOscillator();
    this.lfoDepthGainNode = this.context.createGain();
    this.settings = { ...DEFAULT_CHORUS_SETTINGS, ...(settings ?? {}) };

    this.input.connect(this.dryGainNode);
    this.dryGainNode.connect(this.output);

    this.input.connect(this.delayNode);
    this.delayNode.connect(this.wetGainNode);
    this.wetGainNode.connect(this.output);

    this.lfoNode.connect(this.lfoDepthGainNode);
    this.lfoDepthGainNode.connect(this.delayNode.delayTime);
    this.lfoNode.start();

    this.applySettings();
  }

  update(patch: Record<string, number>) {
    this.settings = { ...this.settings, ...(patch as Partial<ChorusSettings>) };
    this.applySettings();
  }

  dispose() {
    try { this.lfoNode.stop(); } catch {}
    try { this.input.disconnect(); } catch {}
    try { this.output.disconnect(); } catch {}
    try { this.delayNode.disconnect(); } catch {}
    try { this.dryGainNode.disconnect(); } catch {}
    try { this.wetGainNode.disconnect(); } catch {}
    try { this.lfoNode.disconnect(); } catch {}
    try { this.lfoDepthGainNode.disconnect(); } catch {}
  }

  private applySettings() {
    const mix = this.clamp(this.settings.mix, 0, 1);
    const rateHz = this.clamp(this.settings.rate, 0.1, 5);
    const depthNormalized = this.clamp(this.settings.depth, 0, 1);
    const baseDelaySeconds = 0.015;
    const depthSeconds = 0.008 * depthNormalized;

    this.dryGainNode.gain.setValueAtTime(1 - mix, this.context.currentTime);
    this.wetGainNode.gain.setValueAtTime(mix, this.context.currentTime);
    this.delayNode.delayTime.setValueAtTime(baseDelaySeconds, this.context.currentTime);
    this.lfoNode.frequency.setValueAtTime(rateHz, this.context.currentTime);
    this.lfoDepthGainNode.gain.setValueAtTime(depthSeconds, this.context.currentTime);
  }

  private clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }
}
