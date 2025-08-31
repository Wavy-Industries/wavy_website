export type Kit = '808' | 'Jazz' | 'Acoustic';

type Voice = { stop: () => void };

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private playing: Set<Voice> = new Set();

  private ensureCtx() {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return this.ctx!;
  }

  stopAll() {
    for (const v of Array.from(this.playing)) try { v.stop(); } catch {}
    this.playing.clear();
  }

  private kick(ctx: AudioContext, t: number, v: number) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.1);
    g.gain.setValueAtTime(0.8 * v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g).connect(ctx.destination);
    o.start(t); o.stop(t + 0.3);
    const voice: Voice = { stop: () => { try { o.stop(); } catch {} } };
    this.playing.add(voice);
    o.onended = () => this.playing.delete(voice);
    return voice;
  }

  private snare(ctx: AudioContext, t: number, v: number) {
    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource(); noise.buffer = noiseBuffer;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.7 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    noise.connect(g).connect(ctx.destination);
    noise.start(t); noise.stop(t + 0.2);
    const voice: Voice = { stop: () => { try { noise.stop(); } catch {} } };
    this.playing.add(voice);
    noise.onended = () => this.playing.delete(voice);
    return voice;
  }

  private hat(ctx: AudioContext, t: number, v: number) {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(8000, t);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.2 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.07);
    const voice: Voice = { stop: () => { try { o.stop(); } catch {} } };
    this.playing.add(voice);
    o.onended = () => this.playing.delete(voice);
    return voice;
  }

  private mapNoteToDrum(note: number, kit: Kit): 'kick'|'snare'|'hat' {
    // Rough mapping: C2..E2 = kick, F2..B2 = snare, >= C#3 = hat
    if (note <= 40) return 'kick';
    if (note <= 50) return 'snare';
    return 'hat';
  }

  playLoop(loop: { length_beats: number; events: Array<{ note: number; time_ticks_press: number; velocity?: number }> }, bpm: number, kit: Kit) {
    const ctx = this.ensureCtx();
    const start = ctx.currentTime + 0.05;
    const secPerBeat = 60 / Math.max(30, Math.min(240, bpm));
    const ticksPerBeat = 24; // matches TICKS_PER_BEAT
    for (const ev of loop.events) {
      const when = start + (ev.time_ticks_press / ticksPerBeat) * secPerBeat;
      const drum = this.mapNoteToDrum(ev.note, kit);
      const v = Math.max(0.05, Math.min(1, (ev.velocity ?? 100) / 127));
      if (drum === 'kick') this.kick(ctx, when, v);
      else if (drum === 'snare') this.snare(ctx, when, v);
      else this.hat(ctx, when, v);
    }
  }
}
