import { describe, it, expect } from 'vitest';
import {
  samplesParser_decode,
  samplesParser_encode,
  sampleParser_validateEvent,
  sampleParser_validatePack,
  sampleParser_validateSamples,
  sampleParser_truncateLoop,
  MAX_TICKS,
  LOOPS_PER_PAGE,
  NUM_PAGES,
  TICKS_PER_BEAT,
  type DeviceSamples,
  type LoopData,
  type SamplePack,
} from '~/lib/parsers/device_storage_parser';
import { canonicalize } from '~/lib/utils/canonicalize';

function makeLoop(numEvents: number, startTick = 0): LoopData {
  const events = Array.from({ length: numEvents }, (_, i) => ({
    note: 36 + (i % 24),
    velocity: 1 + (i % 127),
    time_ticks_press: startTick + i * 6,
    time_ticks_release: startTick + i * 6 + 3,
  }));
  return { length_beats: 16, events };
}

function makePack(name: string, numLoops: number): SamplePack {
  const loops: (LoopData | null)[] = Array(LOOPS_PER_PAGE).fill(null);
  for (let i = 0; i < numLoops; i++) loops[i] = makeLoop(4 + i);
  return { name, loops };
}

function generateDummySamples(): DeviceSamples {
  const pages: (SamplePack | null)[] = Array(NUM_PAGES).fill(null);
  pages[0] = makePack('W-ONE', 15);
  pages[3] = makePack('W-TWO', 4);
  pages[9] = makePack('W-THREE', 1);
  /* encode defaults these to 0xFFFFFFFF, so spell them out for the round-trip comparison */
  return { reserved0: 0xFFFFFFFF, reserved1: 0xFFFFFFFF, reserved2: 0xFFFFFFFF, reserved3: 0xFFFFFFFF, pages };
}

describe('Samples Parser', () => {
  it('should encode and decode sample packs symmetrically', () => {
    const originalSamplePack = generateDummySamples();
    const originalSamplePackCanonical = canonicalize(originalSamplePack);

    const encodedData = samplesParser_encode(originalSamplePack);
    const decodedSamplePack = samplesParser_decode(encodedData);
    const decodedSamplePackCanonical = canonicalize(decodedSamplePack);

    expect(decodedSamplePackCanonical).toEqual(originalSamplePackCanonical);
  });
});

describe('Sample validation', () => {
  it('accepts an encodable event', () => {
    expect(sampleParser_validateEvent({ note: 60, velocity: 90, time_ticks_press: 0, time_ticks_release: 96 })).toBeNull();
  });

  it('rejects ticks that do not fit the 9-bit field', () => {
    const problem = sampleParser_validateEvent({ note: 60, velocity: 90, time_ticks_press: 480, time_ticks_release: 576 });
    expect(problem).toContain('time_ticks_release');
    expect(problem).toContain(String(MAX_TICKS));
  });

  it('rejects a release that is not after its press', () => {
    expect(sampleParser_validateEvent({ note: 60, velocity: 90, time_ticks_press: 96, time_ticks_release: 96 })).toContain('must be after');
  });

  it('points at the loop that holds the bad event', () => {
    const pack = makePack('W-BAD', 3);
    pack.loops[2]!.events[1].time_ticks_release = 576;
    const issues = sampleParser_validatePack(pack);
    expect(issues).toHaveLength(1);
    expect(issues[0].loopIndex).toBe(2);
    expect(issues[0].eventIndex).toBe(1);
    expect(issues[0].message).toContain('Loop 3 event 2');
  });

  it('refuses to encode samples it cannot represent, with a message naming the pack', () => {
    const samples = generateDummySamples();
    samples.pages[0]!.loops[0]!.events[0].time_ticks_release = 576;
    expect(sampleParser_validateSamples(samples)).toHaveLength(1);
    expect(() => samplesParser_encode(samples)).toThrow(/Cannot encode samples: Pack "W-ONE": Loop 1 event 1: time_ticks_release 576/);
  });

  it('encodes cleanly once the samples validate', () => {
    const samples = generateDummySamples();
    expect(sampleParser_validateSamples(samples)).toEqual([]);
    expect(samplesParser_encode(samples).byteLength).toBeGreaterThan(0);
  });
});

describe('Loop truncation', () => {
  it('drops events that start past the end of the loop', () => {
    const loop: LoopData = {
      length_beats: 16,
      events: [
        { note: 60, velocity: 90, time_ticks_press: 0, time_ticks_release: 96 },
        { note: 62, velocity: 90, time_ticks_press: 480, time_ticks_release: 576 },
      ],
    };
    const truncated = sampleParser_truncateLoop(loop)!;
    expect(truncated.events).toHaveLength(1);
    expect(truncated.events[0].note).toBe(60);
  });

  it('cuts a note that hangs over the end back to the loop end', () => {
    const loop: LoopData = {
      length_beats: 16,
      events: [{ note: 60, velocity: 90, time_ticks_press: 360, time_ticks_release: 576 }],
    };
    const truncated = sampleParser_truncateLoop(loop)!;
    expect(truncated.events[0].time_ticks_release).toBe(16 * TICKS_PER_BEAT);
  });

  it('never lets the tick fields exceed what the format can hold', () => {
    const loop: LoopData = {
      length_beats: 64, // 1536 ticks, well past the 9-bit tick field
      events: [{ note: 60, velocity: 90, time_ticks_press: 500, time_ticks_release: 1400 }],
    };
    const truncated = sampleParser_truncateLoop(loop)!;
    expect(truncated.events[0].time_ticks_release).toBe(MAX_TICKS);
    expect(sampleParser_validateLoopHelper(truncated)).toEqual([]);
  });

  it('produces something the encoder always accepts', () => {
    const nasty: LoopData = {
      length_beats: 999,
      events: [
        { note: 200, velocity: 900, time_ticks_press: -5, time_ticks_release: 3 },
        { note: 60, velocity: 90, time_ticks_press: 10, time_ticks_release: 10 },
        { note: 62, velocity: 90, time_ticks_press: 9000, time_ticks_release: 9100 },
      ],
    };
    const truncated = sampleParser_truncateLoop(nasty)!;
    for (const event of truncated.events) expect(sampleParser_validateEvent(event)).toBeNull();
  });
});

// small local helper so the truncation tests can assert loop-level validity
function sampleParser_validateLoopHelper(loop: LoopData) {
  return sampleParser_validatePack({ name: 'W-T', loops: [loop, ...Array(LOOPS_PER_PAGE - 1).fill(null)] });
}
