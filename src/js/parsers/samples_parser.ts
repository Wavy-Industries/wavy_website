// Define constants (matching C header)
export const TICKS_PER_BEAT = 24; // 24 ticks per beat
export const NUM_PAGES = 10; // SAMPLE_STORAGE_NUM_PAGES
export const LOOPS_PER_PAGE = 15; // SAMPLE_STORAGE_PRESETS_PER_PAGE

/**
 * Encode an ASCII string to a uint8 array with specified max length
 * @param str - The string to encode
 * @param maxLength - Maximum length of the output array
 * @returns uint8 array padded with null bytes to maxLength
 */
export function encodeAsciiString(str: string, maxLength: number): Uint8Array {
    // Validate input
    if (str.length > maxLength) {
        throw new Error(`String "${str}" is longer than maxLength ${maxLength}`);
    }
    
    // Check for ASCII-only characters
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code > 255) {
            throw new Error(`Character '${str[i]}' (code ${code}) is not 8-bit ASCII`);
        }
    }
    
    // Create array and pad with null bytes
    const result = new Uint8Array(maxLength);
    for (let i = 0; i < maxLength; i++) {
        result[i] = i < str.length ? str.charCodeAt(i) : 0;
    }
    
    return result;
}

/**
 * Decode a uint8 array to an ASCII string
 * @param data - The uint8 array to decode
 * @returns The decoded string (null-terminated)
 */
export function decodeAsciiString(data: Uint8Array): string {
    let result = '';
    for (let i = 0; i < data.length; i++) {
        const byte = data[i];
        if (byte === 0) break; // Stop at null terminator
        result += String.fromCharCode(byte);
    }
    return result;
}

class ByteArray {
    data: number[];

    constructor() {
        this.data = [];
    }

    push8(value: number): void {
        if (value < 0 || value > 0xFF) {
            throw new RangeError(`Value ${value} is out of range for an 8-bit unsigned integer`);
        }
        this.data.push(value & 0xFF);
    }

    push16(value: number): void {
        if (value < 0 || value > 0xFFFF) {
            throw new RangeError(`Value ${value} is out of range for a 16-bit unsigned integer`);
        }
        this.data.push(value & 0xFF);
        this.data.push((value >> 8) & 0xFF);
    }

    push32(value: number): void {
        if (value < 0 || value > 0xFFFFFFFF) {
            throw new RangeError(`Value ${value} is out of range for a 32-bit unsigned integer`);
        }
        this.data.push(value & 0xFF);
        this.data.push((value >> 8) & 0xFF);
        this.data.push((value >> 16) & 0xFF);
        this.data.push((value >> 24) & 0xFF);
    }

    pop8(): number {
        if (this.data.length < 1) {
            throw new RangeError("Attempted to pop from an empty array");
        }
        return this.data.shift()!;
    }

    pop16(): number {
        if (this.data.length < 2) {
            throw new RangeError("Not enough data to pop 16 bits");
        }
        const lsb = this.data.shift()!;
        const msb = this.data.shift()!;
        return lsb | (msb << 8);
    }

    pop32(): number {
        if (this.data.length < 4) {
            throw new RangeError("Not enough data to pop 32 bits");
        }
        const b0 = this.data.shift()!;
        const b1 = this.data.shift()!;
        const b2 = this.data.shift()!;
        const b3 = this.data.shift()!;
        let value = b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
        return value >>> 0; // force unsigned interpretation
    }


    add(other: ByteArray): void {
        this.data.push(...other.data);
    }

    static from(array: Uint8Array): ByteArray {
        const byteArray = new ByteArray();
        byteArray.data = Array.from(array); // Convert Uint8Array to a regular array
        return byteArray;
    }
}

// Define new drum event type matching the C struct
export interface DrumEvent {
    note: number; // 7 bits
    time_ticks_press: number; // 9 bits
    velocity: number; // 7 bits
    time_ticks_release: number; // 9 bits
}

// Define loop data structure
export interface LoopData {
    length_beats: number;
    events: DrumEvent[];
}

// Define the type for pages, each page is an array of loops
export interface Page {
    name: string // 8 ASCII characters
    loops: LoopData[]
}

// Define the sample pack type
export interface SamplePack {
    // storage metadata
    reserved0?: number; // uint32_t
    reserved1?: number; // uint32_t
    reserved2?: number; // uint32_t
    reserved3?: number; // uint32_t

    // Pack content - pages can be null if empty
    pages: (Page | null)[];
}

/**
 * Pack a drum event into the 4-byte format matching the C struct
 * struct _drum_event {
 *     uint16_t note: 7;
 *     uint16_t time_ticks_press: 9;
 *     uint16_t velocity : 7;
 *     uint16_t time_ticks_release: 9;
 * } __attribute__((packed));
 */
function packDrumEvent(event: DrumEvent): [number, number] {
    // Validate ranges
    if (event.note < 0 || event.note > 127) {
        throw new RangeError(`Note ${event.note} is out of range (0-127)`);
    }
    if (event.time_ticks_press < 0 || event.time_ticks_press > 511) {
        throw new RangeError(`Press time ${event.time_ticks_press} is out of range (0-511)`);
    }
    if (event.velocity < 0 || event.velocity > 127) {
        throw new RangeError(`Velocity ${event.velocity} is out of range (0-127)`);
    }
    if (event.time_ticks_release < 0 || event.time_ticks_release > 511) {
        throw new RangeError(`Release time ${event.time_ticks_release} is out of range (0-511)`);
    }

    // Pack into two 16-bit values
    const first_word = (event.note & 0x7F) | ((event.time_ticks_press & 0x1FF) << 7);
    const second_word = (event.velocity & 0x7F) | ((event.time_ticks_release & 0x1FF) << 7);
    
    return [first_word, second_word];
}

/**
 * Unpack a drum event from the 4-byte format
 */
function unpackDrumEvent(first_word: number, second_word: number): DrumEvent {
    const note = first_word & 0x7F;
    const time_ticks_press = (first_word >> 7) & 0x1FF;
    const velocity = second_word & 0x7F;
    const time_ticks_release = (second_word >> 7) & 0x1FF;
    
    return {
        note,
        time_ticks_press,
        velocity,
        time_ticks_release
    };
}

export function samplesParser_encode(samplePack: SamplePack): Uint8Array {
    let d = new ByteArray()

    // Write header (4x uint32_t = 16 bytes, 4-byte aligned)
    d.push32(samplePack.reserved0)
    d.push32(samplePack.reserved1)
    d.push32(samplePack.reserved2)
    d.push32(samplePack.reserved3)

    // Write page IDs (in total 64 bits) - 0xFFFFFFFFFFFFFFFF if not set
    const upper: number[] = [];
    const lower: number[] = [];
  
    for (let i = 0; i < NUM_PAGES; i++) {
      const page = samplePack.pages[i];
      if (page === null) {
        upper.push(0xFFFFFFFF >>> 0);
        lower.push(0xFFFFFFFF >>> 0);
        continue;
      }
  
      const nameBytes = encodeAsciiString(page.name || "", 8);
      // little-endian packing of 4 bytes into a u32
      const lo =
        (nameBytes[0]      ) |
        (nameBytes[1] <<  8) |
        (nameBytes[2] << 16) |
        (nameBytes[3] << 24);
  
      const hi =
        (nameBytes[4]      ) |
        (nameBytes[5] <<  8) |
        (nameBytes[6] << 16) |
        (nameBytes[7] << 24);
  
      upper.push(hi >>> 0);
      lower.push(lo >>> 0);
    }
  
    // Write arrays in struct order: UPPER first, then LOWER.
    for (let i = 0; i < NUM_PAGES; i++) d.push32(upper[i]);
    for (let i = 0; i < NUM_PAGES; i++) d.push32(lower[i]);

    // Write preset offsets (uint16_t) - 0xFFFF if not set
    let loopOffsets = new ByteArray()
    let loopData = new ByteArray()
    for (let page_idx = 0; page_idx < NUM_PAGES; page_idx++) {
        let page = samplePack.pages[page_idx]
        if (page === null) {
            // Empty page - all loops are null
            for (let loop_idx = 0; loop_idx < LOOPS_PER_PAGE; loop_idx++) {
                loopOffsets.push16(0xFFFF)
            }
            continue
        }
        for (let loop_idx = 0; loop_idx < LOOPS_PER_PAGE; loop_idx++) {
            let loop = page.loops[loop_idx]
            if (loop == null) {
                loopOffsets.push16(0xFFFF)
                continue
            }
            loopOffsets.push16(loopData.data.length) // offset relative to start of data

            loopData.push8(loop.length_beats) // loop length
            loopData.push8(loop.events.length) // number of events
            for (const event of loop.events) {
                const [first_word, second_word] = packDrumEvent(event);
                loopData.push16(first_word);
                loopData.push16(second_word);
            }
        }
    }

    d.add(loopOffsets)
    d.add(loopData)

    return Uint8Array.from(d.data)
}

export function samplesParser_decode(packedData: Uint8Array): SamplePack {
    let d = ByteArray.from(packedData)
    let p: SamplePack = {
        reserved0: d.pop32(),
        reserved1: d.pop32(),
        reserved2: d.pop32(),
        reserved3: d.pop32(),
        pages: [],
    }

    // extract page names
    // Read arrays in struct order: UPPER first, then LOWER (to match encoder)
    const upper: number[] = [];
    const lower: number[] = [];
    for (let i = 0; i < NUM_PAGES; i++) upper.push(d.pop32());
    for (let i = 0; i < NUM_PAGES; i++) lower.push(d.pop32());

    for (let i = 0; i < NUM_PAGES; i++) {
        const hi = upper[i] >>> 0;
        const lo = lower[i] >>> 0;
        if (hi === 0xFFFFFFFF && lo === 0xFFFFFFFF) {
            p.pages.push(null);
            continue;
        }
        const nameBytes = new Uint8Array(8);
        // lower 32-bits (little endian)
        nameBytes[0] = lo & 0xFF;
        nameBytes[1] = (lo >> 8) & 0xFF;
        nameBytes[2] = (lo >> 16) & 0xFF;
        nameBytes[3] = (lo >> 24) & 0xFF;
        // upper 32-bits (little endian)
        nameBytes[4] = hi & 0xFF;
        nameBytes[5] = (hi >> 8) & 0xFF;
        nameBytes[6] = (hi >> 16) & 0xFF;
        nameBytes[7] = (hi >> 24) & 0xFF;

        const name = decodeAsciiString(nameBytes);
        p.pages.push({ name: name, loops: [] });
    }

    // remove offsets, only interested in loop is set or not
    let loopExists: boolean[] = []
    for (let i = 0; i < NUM_PAGES * LOOPS_PER_PAGE; i++) {
        loopExists.push(d.pop16() === 0xFFFF ? false : true)
    }

    for (let page_idx = 0; page_idx < NUM_PAGES; page_idx++) {
        let page = p.pages[page_idx]
        if (page === null) {
            // Skip null pages - they don't have loops
            continue
        }
        for (let loop_idx = 0; loop_idx < LOOPS_PER_PAGE; loop_idx++) {

            if (loopExists[page_idx * LOOPS_PER_PAGE + loop_idx] == false) {
                page.loops.push(null)
                continue
            }

            let loop: LoopData = {
                length_beats: d.pop8(),
                events: []
            }
            let numEvents = d.pop8()
            for (let i = 0; i < numEvents; i++) {
                const first_word = d.pop16();
                const second_word = d.pop16();
                const event = unpackDrumEvent(first_word, second_word);
                loop.events.push(event);
            }
            page.loops.push(loop)
        }
    }

    return p
}

export function getPageByteSize(page: Page | null): number {
    if (page === null) {
        return 0; // Null pages have no data
    }
    let size = 0;
    page.loops.forEach((loop) => {
        if (loop == null) return;
        size += 1; // add for loop length
        size += 1; // add for number of events (max255)
        loop?.events?.forEach((_) => {
            size += 4 // each drum event is 4 bytes (2x uint16_t)
        })
    })
    return size;
}

export function getPackSize(pack: SamplePack): number {
    let size = 0;
    // dont include reserved as its part of the fixed data
    pack.pages.forEach((page) => size += getPageByteSize(page))
    return size;
}
