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

export type MIDIPolyAftertouchEvent = {
  type: 'poly_aftertouch';
  timestamp: number;
  channel: number;
  note: number;
  pressure: number;
};

export type MIDIControlChangeEvent = {
  type: 'control_change';
  timestamp: number;
  channel: number;
  controller: number;
  value: number;
};

export type MIDIProgramChangeEvent = {
  type: 'program_change';
  timestamp: number;
  channel: number;
  program: number;
};

export type MIDIChannelAftertouchEvent = {
  type: 'channel_aftertouch';
  timestamp: number;
  channel: number;
  pressure: number;
};

export type MIDIPitchBendEvent = {
  type: 'pitch_bend';
  timestamp: number;
  channel: number;
  value: number;
};

export type MIDISystemEvent = {
  type: 'system';
  timestamp: number;
  status: number;
  data: number[];
};

export type MIDIEvent =
  | MIDINoteOnEvent
  | MIDINoteOffEvent
  | MIDIPolyAftertouchEvent
  | MIDIControlChangeEvent
  | MIDIProgramChangeEvent
  | MIDIChannelAftertouchEvent
  | MIDIPitchBendEvent
  | MIDISystemEvent;

/**
 * Parse BLE-MIDI raw data into structured MIDI events
 * 
 * @param data Raw BLE-MIDI packet data
 * @returns Array of parsed MIDI events
 */
export function parse_raw_to_midi_ble(data: Uint8Array): MIDIEvent[] {
  const events: MIDIEvent[] = [];
  let offset = 0;
  let timestampHigh = 0;

  while (offset < data.length) {
    // SPEC: BLE-MIDI Header byte format
    // Bit 7: Always 1 (marks as header byte)
    // Bits 6-0: Timestamp high (6 bits) or timestamp low (7 bits)
    const header = data[offset];
    const isFirstMessage = offset === 0;
    
    // SPEC: First message contains timestamp high (6 bits) in header
    // Subsequent messages only contain timestamp low (7 bits)
    if (isFirstMessage) {
      if (offset + FIRST_MESSAGE_LENGTH > data.length) break;
      
      timestampHigh = (header & TIMESTAMP_HIGH_BITS) << 7;
      offset++;
      
      // SPEC: Second byte contains timestamp low (7 bits)
      const timestampLowByte = data[offset];
      const timestampLow = timestampLowByte & TIMESTAMP_LOW_BITS;
      const timestamp = timestampHigh | timestampLow;
      offset++;
      
      // SPEC: Third byte is the MIDI status byte
      const statusByte = data[offset];
      const status = statusByte & STATUS_MASK;
      const channel = statusByte & CHANNEL_MASK;
      offset++;
      
      // SPEC: Parse MIDI message based on status byte
      switch (status) {
        // SPEC: Note Off (0x8n) - 3 bytes: status, note, velocity
        case STATUS_NOTE_OFF: {
          const note = data[offset] & DATA_BYTE_MASK;
          const velocity = data[offset + 1] & DATA_BYTE_MASK;
          events.push({
            type: 'note_off',
            timestamp,
            channel,
            note,
            velocity,
          });
          offset += 2;
          break;
        }
        
        // SPEC: Note On (0x9n) - 3 bytes: status, note, velocity
        case STATUS_NOTE_ON: {
          const note = data[offset] & DATA_BYTE_MASK;
          const velocity = data[offset + 1] & DATA_BYTE_MASK;
          events.push({
            type: 'note_on',
            timestamp,
            channel,
            note,
            velocity,
          });
          offset += 2;
          break;
        }
        
        // SPEC: Polyphonic Aftertouch (0xAn) - 3 bytes: status, note, pressure
        case STATUS_POLY_AFTERTOUCH: {
          const note = data[offset] & DATA_BYTE_MASK;
          const pressure = data[offset + 1] & DATA_BYTE_MASK;
          events.push({
            type: 'poly_aftertouch',
            timestamp,
            channel,
            note,
            pressure,
          });
          offset += 2;
          break;
        }
        
        // SPEC: Control Change (0xBn) - 3 bytes: status, controller, value
        case STATUS_CONTROL_CHANGE: {
          const controller = data[offset] & DATA_BYTE_MASK;
          const value = data[offset + 1] & DATA_BYTE_MASK;
          events.push({
            type: 'control_change',
            timestamp,
            channel,
            controller,
            value,
          });
          offset += 2;
          break;
        }
        
        // SPEC: Program Change (0xCn) - 2 bytes: status, program
        case STATUS_PROGRAM_CHANGE: {
          const program = data[offset] & DATA_BYTE_MASK;
          events.push({
            type: 'program_change',
            timestamp,
            channel,
            program,
          });
          offset += 1;
          break;
        }
        
        // SPEC: Channel Aftertouch (0xDn) - 2 bytes: status, pressure
        case STATUS_CHANNEL_AFTERTOUCH: {
          const pressure = data[offset] & DATA_BYTE_MASK;
          events.push({
            type: 'channel_aftertouch',
            timestamp,
            channel,
            pressure,
          });
          offset += 1;
          break;
        }
        
        // SPEC: Pitch Bend (0xEn) - 3 bytes: status, LSB, MSB
        // Value range: 0-16383 (0x0000-0x3FFF), center at 8192 (0x2000)
        case STATUS_PITCH_BEND: {
          const lsb = data[offset] & DATA_BYTE_MASK;
          const msb = data[offset + 1] & DATA_BYTE_MASK;
          const value = (msb << 7) | lsb;
          events.push({
            type: 'pitch_bend',
            timestamp,
            channel,
            value,
          });
          offset += 2;
          break;
        }
        
        // SPEC: System Messages (0xFn) - variable length
        case STATUS_SYSTEM: {
          const systemData: number[] = [];
          while (offset < data.length && (data[offset] & HEADER_TIMESTAMP_HIGH_MASK) === 0) {
            systemData.push(data[offset] & DATA_BYTE_MASK);
            offset++;
          }
          events.push({
            type: 'system',
            timestamp,
            status: statusByte,
            data: systemData,
          });
          break;
        }
        
        default:
          // Unknown status, skip this message
          offset++;
          break;
      }
    } else {
      // SPEC: Subsequent messages (4 bytes) - no timestamp high
      if (offset + SUBSEQUENT_MESSAGE_LENGTH > data.length) break;
      
      // SPEC: First byte is header with timestamp low only
      const timestampLow = header & TIMESTAMP_LOW_BITS;
      const timestamp = timestampHigh | timestampLow;
      offset++;
      
      // SPEC: Second byte is the MIDI status byte
      const statusByte = data[offset];
      const status = statusByte & STATUS_MASK;
      const channel = statusByte & CHANNEL_MASK;
      offset++;
      
      // SPEC: Parse MIDI message based on status byte (same as first message)
      switch (status) {
        case STATUS_NOTE_OFF: {
          const note = data[offset] & DATA_BYTE_MASK;
          const velocity = data[offset + 1] & DATA_BYTE_MASK;
          events.push({
            type: 'note_off',
            timestamp,
            channel,
            note,
            velocity,
          });
          offset += 2;
          break;
        }
        
        case STATUS_NOTE_ON: {
          const note = data[offset] & DATA_BYTE_MASK;
          const velocity = data[offset + 1] & DATA_BYTE_MASK;
          events.push({
            type: 'note_on',
            timestamp,
            channel,
            note,
            velocity,
          });
          offset += 2;
          break;
        }
        
        case STATUS_POLY_AFTERTOUCH: {
          const note = data[offset] & DATA_BYTE_MASK;
          const pressure = data[offset + 1] & DATA_BYTE_MASK;
          events.push({
            type: 'poly_aftertouch',
            timestamp,
            channel,
            note,
            pressure,
          });
          offset += 2;
          break;
        }
        
        case STATUS_CONTROL_CHANGE: {
          const controller = data[offset] & DATA_BYTE_MASK;
          const value = data[offset + 1] & DATA_BYTE_MASK;
          events.push({
            type: 'control_change',
            timestamp,
            channel,
            controller,
            value,
          });
          offset += 2;
          break;
        }
        
        case STATUS_PROGRAM_CHANGE: {
          const program = data[offset] & DATA_BYTE_MASK;
          events.push({
            type: 'program_change',
            timestamp,
            channel,
            program,
          });
          offset += 1;
          break;
        }
        
        case STATUS_CHANNEL_AFTERTOUCH: {
          const pressure = data[offset] & DATA_BYTE_MASK;
          events.push({
            type: 'channel_aftertouch',
            timestamp,
            channel,
            pressure,
          });
          offset += 1;
          break;
        }
        
        case STATUS_PITCH_BEND: {
          const lsb = data[offset] & DATA_BYTE_MASK;
          const msb = data[offset + 1] & DATA_BYTE_MASK;
          const value = (msb << 7) | lsb;
          events.push({
            type: 'pitch_bend',
            timestamp,
            channel,
            value,
          });
          offset += 2;
          break;
        }
        
        case STATUS_SYSTEM: {
          const systemData: number[] = [];
          while (offset < data.length && (data[offset] & HEADER_TIMESTAMP_HIGH_MASK) === 0) {
            systemData.push(data[offset] & DATA_BYTE_MASK);
            offset++;
          }
          events.push({
            type: 'system',
            timestamp,
            status: statusByte,
            data: systemData,
          });
          break;
        }
        
        default:
          offset++;
          break;
      }
    }
  }

  return events;
}