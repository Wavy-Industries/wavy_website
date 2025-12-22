import type { DelaySettings, EffectModule } from '../types';

const DEFAULT_DELAY_SETTINGS: DelaySettings = {
  mix: 0.25,
  time: 0.35,
  feedback: 0.4,
};

export class DelayEffect implements EffectModule {
  readonly id: string;
  readonly type = 'delay' as const;
  readonly input: GainNode;
  readonly output: GainNode;

  private readonly context: AudioContext;
  private readonly dryGainNode: GainNode;
  private readonly wetGainNode: GainNode;
  private readonly delayNode: DelayNode;
  private readonly feedbackGainNode: GainNode;
  private settings: DelaySettings;

  constructor(context: AudioContext, id: string, settings?: Partial<DelaySettings>) {
    this.context = context;
    this.id = id;
    this.input = this.context.createGain();
    this.output = this.context.createGain();
    this.dryGainNode = this.context.createGain();
    this.wetGainNode = this.context.createGain();
    this.delayNode = this.context.createDelay(2.0);
    this.feedbackGainNode = this.context.createGain();
    this.settings = { ...DEFAULT_DELAY_SETTINGS, ...(settings ?? {}) };

    this.input.connect(this.dryGainNode);
    this.dryGainNode.connect(this.output);

    this.input.connect(this.delayNode);
    this.delayNode.connect(this.wetGainNode);
    this.wetGainNode.connect(this.output);

    this.delayNode.connect(this.feedbackGainNode);
    this.feedbackGainNode.connect(this.delayNode);

    this.applySettings();
  }

  update(patch: Record<string, number>) {
    this.settings = { ...this.settings, ...(patch as Partial<DelaySettings>) };
    this.applySettings();
  }

  dispose() {
    try { this.input.disconnect(); } catch {}
    try { this.output.disconnect(); } catch {}
    try { this.delayNode.disconnect(); } catch {}
    try { this.feedbackGainNode.disconnect(); } catch {}
    try { this.dryGainNode.disconnect(); } catch {}
    try { this.wetGainNode.disconnect(); } catch {}
  }

  private applySettings() {
    const mix = this.clamp(this.settings.mix, 0, 1);
    const delaySeconds = this.clamp(this.settings.time, 0.01, 1.5);
    const feedback = this.clamp(this.settings.feedback, 0, 0.9);

    this.dryGainNode.gain.setValueAtTime(1 - mix, this.context.currentTime);
    this.wetGainNode.gain.setValueAtTime(mix, this.context.currentTime);
    this.delayNode.delayTime.setValueAtTime(delaySeconds, this.context.currentTime);
    this.feedbackGainNode.gain.setValueAtTime(feedback, this.context.currentTime);
  }

  private clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }
}
