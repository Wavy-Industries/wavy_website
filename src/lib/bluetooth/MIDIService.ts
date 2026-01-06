import { BluetoothManager } from './bluetoothManager';

export class MIDIService {
    private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
    private _boundCharHandler: ((event: Event) => void) | null = null;
    public onMIDIMessage: ((data: Uint8Array) => void) | null = null;
    public onNoteOn: ((note: number, velocity: number, channel: number) => void) | null = null;
    public onNoteOff: ((note: number, velocity: number, channel: number) => void) | null = null;
    public onControlChange: ((controller: number, value: number, channel: number) => void) | null = null;

    private midiWritePromise: Promise<void> | null = null;
    private midiInitPromise: Promise<void> | null = null;

    private readonly MIDI_SERVICE_UUID = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
    private readonly MIDI_CHARACTERISTIC_UUID = '7772e5db-3868-4112-a1a9-f2669d106bf3';

    private bluetoothManager: BluetoothManager;

    public constructor(bluetoothManager: BluetoothManager) {
        this.bluetoothManager = bluetoothManager;
    }

    public reset(): void {
        if (this.characteristic && this._boundCharHandler) {
            try { this.characteristic.removeEventListener('characteristicvaluechanged', this._boundCharHandler); } catch {}
        }
        this.characteristic = null; this.midiInitPromise = null;
    }

    public async initialize(): Promise<boolean> {
        if (this.midiInitPromise) { await this.midiInitPromise; return this.characteristic !== null; }
        this.midiInitPromise = new Promise<void>(async (resolve, reject) => {
            try {
                // Remove old listener if any
                if (this.characteristic && this._boundCharHandler) {
                    try { this.characteristic.removeEventListener('characteristicvaluechanged', this._boundCharHandler); } catch {}
                }
                this.characteristic = await this.bluetoothManager.getCharacteristic(this.MIDI_SERVICE_UUID, this.MIDI_CHARACTERISTIC_UUID);
                if (!this.characteristic) { reject(new Error('Failed to get MIDI characteristic')); return; }
                await this.bluetoothManager.startNotifications(this.characteristic);
                // Bind a stable handler and add exactly once
                if (!this._boundCharHandler) this._boundCharHandler = this._handleMIDIMessage.bind(this);
                this.characteristic.addEventListener('characteristicvaluechanged', this._boundCharHandler);
                resolve();
            } catch (error) { reject(error); } finally { this.midiInitPromise = null; }
        });
        try { await this.midiInitPromise; return true; } catch { return false; }
    }

    public async sendMIDIMessage(message: Uint8Array): Promise<void> {
        if (!this.characteristic) { const ok = await this.initialize(); if (!ok) throw new Error('Failed to initialize MIDI characteristic'); }
        if (!this.characteristic) throw new Error('MIDI characteristic not available');
        if (this.midiWritePromise) await this.midiWritePromise;
        this.midiWritePromise = this.bluetoothManager.writeCharacteristicValueWithoutResponse(this.characteristic, message);
        await this.midiWritePromise; this.midiWritePromise = null;
    }

    public async sendNoteOn(note: number, velocity: number, channel: number = 0): Promise<void> { await this.sendMIDIMessage(this._buildNoteOnMessage(note, velocity, channel)); }
    public async sendNoteOff(note: number, velocity: number, channel: number = 0): Promise<void> { await this.sendMIDIMessage(this._buildNoteOffMessage(note, velocity, channel)); }
    public async sendControlChange(controller: number, value: number, channel: number = 0): Promise<void> { await this.sendMIDIMessage(this._buildControlChangeMessage(controller, value, channel)); }
    public isInitialized(): boolean { return this.characteristic !== null; }

    private _handleMIDIMessage(event: Event): void {
        const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
        const value = characteristic.value;
        if (!value) return;
        const data = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        this.onMIDIMessage?.(data);
        this._parseMIDIMessage(data);
    }

    private _parseMIDIMessage(data: Uint8Array): void {
        if (data.length === 0) return;
        const hasBleHeader = (data[0] & 0x80) !== 0;
        let i = hasBleHeader ? 1 : 0;
        let runningStatus: number | null = null;

        const isRealtime = (status: number) => status >= 0xF8;
        const dataLenForStatus = (status: number) => {
            const type = status & 0xF0;
            if (type === 0xC0 || type === 0xD0) return 1;
            if (type === 0xF0) {
                if (status === 0xF1 || status === 0xF3) return 1;
                if (status === 0xF2) return 2;
                return 0;
            }
            return 2;
        };
        const hasDataBytes = (idx: number, len: number) => {
            if (len === 0) return true;
            if (idx + len > data.length) return false;
            for (let j = 0; j < len; j++) {
                if ((data[idx + j] & 0x80) !== 0) return false;
            }
            return true;
        };

        while (i < data.length) {
            let status = data[i];
            if ((status & 0x80) !== 0) {
                if (isRealtime(status)) { i++; continue; }

                const dataLen = dataLenForStatus(status);
                if (!hasDataBytes(i + 1, dataLen)) {
                    // Timestamp low byte or incomplete status, skip it.
                    i++;
                    continue;
                }

                i++;
                runningStatus = status;
            } else if (runningStatus !== null) {
                status = runningStatus;
            } else {
                i++;
                continue;
            }

            const type = status & 0xF0;
            const channel = status & 0x0F;
            if (type === 0xF0) {
                if (status === 0xF0) {
                    while (i < data.length && data[i] !== 0xF7) i++;
                    if (i < data.length) i++;
                } else {
                    const sysLen = dataLenForStatus(status);
                    if (!hasDataBytes(i, sysLen)) break;
                    i += sysLen;
                }
                runningStatus = null;
                continue;
            }

            const dataLen = dataLenForStatus(status);
            if (!hasDataBytes(i, dataLen)) break;
            const data1 = data[i++];
            const data2 = dataLen === 2 ? data[i++] : 0;

            switch (type) {
                case 0x90:
                    if (data2 === 0) this.onNoteOff?.(data1, data2, channel);
                    else this.onNoteOn?.(data1, data2, channel);
                    break;
                case 0x80:
                    this.onNoteOff?.(data1, data2, channel);
                    break;
                case 0xB0:
                    this.onControlChange?.(data1, data2, channel);
                    break;
            }
        }
    }

    private _buildNoteOnMessage(note: number, velocity: number, channel: number): Uint8Array { const ts = new Uint8Array([0,0]); const status = 0x90 | (channel & 0x0F); return new Uint8Array([...ts, status, note, velocity]); }
    private _buildNoteOffMessage(note: number, velocity: number, channel: number): Uint8Array { const ts = new Uint8Array([0,0]); const status = 0x80 | (channel & 0x0F); return new Uint8Array([...ts, status, note, velocity]); }
    private _buildControlChangeMessage(controller: number, value: number, channel: number): Uint8Array { const ts = new Uint8Array([0,0]); const status = 0xB0 | (channel & 0x0F); return new Uint8Array([...ts, status, controller, value]); }
}
