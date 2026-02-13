/**
 * MIDI-BLE Parser
 * 
 * Parses MIDI 1.0 messages from BLE (Bluetooth Low Energy) MIDI format.
 * Each message follows the BLE-MIDI specification where:
 * - First message in packet: 5 bytes (header + timestamp high + timestamp low + MIDI data)
 * - Subsequent messages: 4 bytes (header + timestamp low + MIDI data)
 * 
 * The parser handles standard MIDI 1.0 channel voice messages and system messages.
 */

// MIDI Status Byte Constants (high nibble)
const STATUS_NOTE_OFF = 0x80;
const STATUS_NOTE_ON = 0x90;
const STATUS_POLY_AFTERTOUCH = 0xa0;
const STATUS_CONTROL_CHANGE = 0xb0;
const STATUS_PROGRAM_CHANGE = 0xc0;
const STATUS_CHANNEL_AFTERTOUCH = 0xd0;
const STATUS_PITCH_BEND = 0xe0;
const STATUS_SYSTEM = 0xf0;

// BLE-MIDI Header Constants
const HEADER_TIMESTAMP_HIGH_MASK = 0x80;
const HEADER_TIMESTAMP_LOW_MASK = 0x80;
const TIMESTAMP_HIGH_BITS = 0x3f;
const TIMESTAMP_LOW_BITS = 0x7f;
const STATUS_MASK = 0xf0;
const CHANNEL_MASK = 0x0f;
const DATA_BYTE_MASK = 0x7f;

// Message Length Constants
const FIRST_MESSAGE_LENGTH = 5;
const SUBSEQUENT_MESSAGE_LENGTH = 4;

// MIDI Event Types
export type MIDINoteOnEvent = {
  type: 'note_on';
  timestamp: number;
  channel: number;
  note: number;
  velocity: number;
};

export type MIDINoteOffEvent = {
  type: 'note_off';
  timestamp: number;
  channel: number;
  note: number;
  velocity: number;
};

export type MIDIControlChangeEvent = {
  type: 'control_change';
  timestamp: number;
  channel: number;
  controller: number;
  value: number;
};

export type MIDIEvent =
  | MIDINoteOnEvent
  | MIDINoteOffEvent
  | MIDIControlChangeEvent


/**
 * Parse BLE-MIDI raw data into structured MIDI events
 * 
 * @param data Raw BLE-MIDI packet data
 * @returns Array of parsed MIDI events
 */
export function parse_raw_to_midi_ble(data: Uint8Array): MIDIEvent[] {
  const events: MIDIEvent[] = [];
  let offset = 0;

  while (offset < data.length) {

    // find and skip timestamp bytes
    let consecutiveStatusBits = 0
    let j = offset
    while (j < data.length && (data[j] & 0x80) == 0x80) {
      consecutiveStatusBits++;
      j++;
    }
  
    // Handle based on count:
    // - 1 consecutive: keep it (MIDI status)
    // - 2 consecutive: remove first (1 timestamp)
    // - 3 consecutive: remove first 2 (2 timestamps)
    // - more => error
    let slice_start, timestamp
    switch (consecutiveStatusBits) {
      case 1:
        timestamp = 0
        slice_start = offset
        break
      case 2:
        timestamp = data[offset] & 0b01111111
        slice_start = offset + 1
        break
      case 3:
        timestamp = (data[offset] & 0b00111111) << 7 & (data[offset+1] & 0b01111111)
        slice_start = offset + 2
        break
      default:
        console.error("error parsing ble midi events", data, consecutiveStatusBits)
        return []
    }

    const slice = data.slice(slice_start, slice_start+3)
    const command = slice[0] & 0b11110000
    const channel = slice[0] & 0b00001111
    const d1 = slice[1]
    const d2 = slice[2]

    switch (command) {
      case STATUS_NOTE_OFF:
        events.push({type: 'note_off', timestamp: timestamp, channel: channel, note: d1, velocity: d2})
        break
      case STATUS_NOTE_ON:
        events.push({type: 'note_on', timestamp: timestamp, channel: channel, note: d1, velocity: d2})
        break
      case STATUS_CONTROL_CHANGE:
        events.push({type: 'control_change', timestamp: timestamp, channel: channel, controller: d1, value: d2})
        break
    }

    offset = slice_start + 3;
  }

  return events;
}