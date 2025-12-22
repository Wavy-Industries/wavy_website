import { WebAudioBackend } from './engine';

export * from './types';

export const soundBackend = new WebAudioBackend();
