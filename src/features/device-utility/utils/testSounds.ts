/**
 * Test sound utilities for device tester
 *
 * Provides simple audio feedback sounds using Web Audio API.
 * Reuses a single AudioContext instance for better resource management.
 */

let audioContext: AudioContext | null = null;
let soundEnabled = true;

function getAudioContext(): AudioContext {
    if (!audioContext) {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContext;
}

/**
 * Enable or disable test sounds globally
 */
export function setTestSoundEnabled(enabled: boolean): void {
    soundEnabled = enabled;
}

/**
 * Check if test sounds are enabled
 */
export function isTestSoundEnabled(): boolean {
    return soundEnabled;
}

interface ToneOptions {
    frequency: number;
    gain: number;
    duration: number;
}

/**
 * Play a simple sine wave tone
 */
function playTone(options: ToneOptions): void {
    if (!soundEnabled) return;

    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = options.frequency;
    gainNode.gain.value = options.gain;

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start();
    oscillator.stop(ctx.currentTime + options.duration);
}

/**
 * Play a tick sound for successful key press (400Hz, short)
 */
export function playTickSound(): void {
    playTone({ frequency: 400, gain: 0.2, duration: 0.05 });
}

/**
 * Play a fail sound for debounce failure (200Hz, longer)
 */
export function playFailSound(): void {
    playTone({ frequency: 200, gain: 0.2, duration: 0.1 });
}

/**
 * Play a CC modulation sound (500Hz, short, quieter)
 */
export function playCCSound(): void {
    playTone({ frequency: 500, gain: 0.1, duration: 0.05 });
}
