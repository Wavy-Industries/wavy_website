import { TICKS_PER_BEAT, type LoopData } from '~/lib/parsers/device_storage_parser';
import { computeLoopLengthBeatsFromEvents } from '~/lib/utils/loop_utils';

function readStr(buf: Uint8Array, o: number, len: number) { return String.fromCharCode(...buf.slice(o, o+len)); }
function readU32(dv: DataView, o: number) { return dv.getUint32(o); }
function readU16(dv: DataView, o: number) { return dv.getUint16(o); }

function readVLQ(buf: Uint8Array, o: number) {
  let value = 0, i = o, b;
  do { b = buf[i++]; value = (value << 7) | (b & 0x7f); } while (b & 0x80);
  return { value, next: i };
}

type RawEv = { t: number; type: 'on'|'off'; note: number; vel: number };

export function parseMidiToLoop(data: ArrayBuffer): { loop: LoopData } {
  const buf = new Uint8Array(data); const dv = new DataView(data);
  if (readStr(buf, 0, 4) !== 'MThd') throw new Error('Invalid MIDI');
  const headerLen = readU32(dv, 4);
  const format = readU16(dv, 8);
  const ntrks = readU16(dv, 10);
  const division = readU16(dv, 12);
  const ppqn = (division & 0x8000) ? 480 : division; // fallback if SMPTE
  let offset = 8 + headerLen;

  // Read all tracks to raw events
  const raw: RawEv[] = [];
  for (let ti = 0; ti < ntrks; ti++) {
    if (readStr(buf, offset, 4) !== 'MTrk') break;
    const trackLen = readU32(dv, offset+4);
    let i = offset + 8; const end = i + trackLen;
    let abs = 0; let running = 0;
    while (i < end) {
      const vlq = readVLQ(buf, i); i = vlq.next; abs += vlq.value;
      let status = buf[i];
      if (status < 0x80) { // running status
        status = running;
      } else { i++; running = status; }
      if ((status & 0xF0) === 0x90 || (status & 0xF0) === 0x80) {
        const note = buf[i++]; const vel = buf[i++];
        if ((status & 0xF0) === 0x90 && vel > 0) raw.push({ t: abs, type: 'on', note, vel });
        else raw.push({ t: abs, type: 'off', note, vel: 0 });
      } else if ((status & 0xF0) === 0xC0 || (status & 0xF0) === 0xD0) {
        i += 1; // program change/aftertouch
      } else if (status === 0xFF) {
        const metaType = buf[i++]; const len = readVLQ(buf, i); i = len.next + len.value; // skip meta
      } else {
        i += 2; // most other channel messages have 2 data bytes
      }
    }
    offset = end;
  }

  // Sort and build scaled events
  raw.sort((a,b) => a.t - b.t);
  const scale = TICKS_PER_BEAT / (ppqn || 480);
  const events: any[] = [];
  const ongoing: Record<number, { press: number; vel: number } | undefined> = {};
  let maxTick = 0;
  for (const ev of raw) {
    const t = Math.round(ev.t * scale);
    if (ev.type === 'on') {
      // Close any previous unclosed event for same note
      if (ongoing[ev.note] !== undefined) {
        const { press, vel } = ongoing[ev.note]!; delete ongoing[ev.note];
        const release = t <= press ? press + 1 : t;
        events.push({ note: ev.note, time_ticks_press: press, velocity: vel, time_ticks_release: release });
        if (release > maxTick) maxTick = release;
      }
      ongoing[ev.note] = { press: t, vel: ev.vel };
      if (t > maxTick) maxTick = t;
    } else { // off
      const entry = ongoing[ev.note];
      if (entry !== undefined) {
        delete ongoing[ev.note];
        const press = entry.press;
        const release = t <= press ? press + 1 : t;
        events.push({ note: ev.note, time_ticks_press: press, velocity: entry.vel, time_ticks_release: release });
        if (release > maxTick) maxTick = release;
      }
    }
  }
  // Close any lingering notes at end
  for (const n of Object.keys(ongoing)) {
    const entry = ongoing[Number(n)];
    if (entry !== undefined) {
      const press = entry.press;
      const release = press + 1; // at least 1 tick
      events.push({ note: Number(n), time_ticks_press: press, velocity: entry.vel ?? 64, time_ticks_release: release });
      if (release > maxTick) maxTick = release;
    }
  }

  // Compute loop length in beats using shared utility (clamped to device limits)
  const length_beats = computeLoopLengthBeatsFromEvents(events, { minBeats: 4, maxBeats: 16, ticksPerBeat: TICKS_PER_BEAT });

  // Ensure any zero-length events are 1 tick
  for (const ev of events) {
    if (ev.time_ticks_release <= ev.time_ticks_press) ev.time_ticks_release = ev.time_ticks_press + 1;
  }

  return { loop: { length_beats, events } };
}
