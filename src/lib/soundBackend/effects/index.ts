import type { EffectInstance, EffectModule } from '../types';
import { ChorusEffect } from './chorus';
import { DelayEffect } from './delay';
import { ReverbEffect } from './reverb';

export function createEffectModule(context: AudioContext, effectInstance: EffectInstance): EffectModule {
  switch (effectInstance.type) {
    case 'reverb':
      return new ReverbEffect(context, effectInstance.id, effectInstance.settings);
    case 'delay':
      return new DelayEffect(context, effectInstance.id, effectInstance.settings);
    case 'chorus':
      return new ChorusEffect(context, effectInstance.id, effectInstance.settings);
    default:
      throw new Error(`Unsupported effect type: ${effectInstance.type}`);
  }
}
