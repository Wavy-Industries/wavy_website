import type { EffectInstance, EffectModule } from './types';

type EffectModuleFactory = (effectInstance: EffectInstance) => EffectModule;

export class EffectChain {
  private readonly inputNode: GainNode;
  private readonly outputNode: GainNode;
  private effectModules: EffectModule[] = [];
  private effectModulesById: Map<string, EffectModule> = new Map();

  constructor(context: AudioContext) {
    this.inputNode = context.createGain();
    this.outputNode = context.createGain();
    this.inputNode.connect(this.outputNode);
  }

  get input(): AudioNode {
    return this.inputNode;
  }

  get output(): AudioNode {
    return this.outputNode;
  }

  setEffects(effectInstances: EffectInstance[], createModule: EffectModuleFactory) {
    const nextModules: EffectModule[] = [];
    const nextModulesById = new Map<string, EffectModule>();

    for (const effectInstance of effectInstances) {
      const existing = this.effectModulesById.get(effectInstance.id);
      if (existing && existing.type === effectInstance.type) {
        existing.update(effectInstance.settings as Record<string, number>);
        nextModules.push(existing);
        nextModulesById.set(effectInstance.id, existing);
        continue;
      }
      if (existing) existing.dispose();
      const module = createModule(effectInstance);
      module.update(effectInstance.settings as Record<string, number>);
      nextModules.push(module);
      nextModulesById.set(effectInstance.id, module);
    }

    for (const [effectId, existing] of this.effectModulesById.entries()) {
      if (!nextModulesById.has(effectId)) existing.dispose();
    }

    this.effectModules = nextModules;
    this.effectModulesById = nextModulesById;
    this.reconnect();
  }

  private reconnect() {
    try { this.inputNode.disconnect(); } catch {}
    for (const module of this.effectModules) {
      try { module.output.disconnect(); } catch {}
    }

    let previousNode: AudioNode = this.inputNode;
    for (const module of this.effectModules) {
      previousNode.connect(module.input);
      previousNode = module.output;
    }
    previousNode.connect(this.outputNode);
  }
}
