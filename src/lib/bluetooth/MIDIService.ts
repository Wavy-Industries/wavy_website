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
        this.characteristic = null; this.midiInitPromise = null; this.initialize();
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
                await this.characteristic.startNotifications();
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
        this.midiWritePromise = this.characteristic.writeValueWithoutResponse(message);
        await this.midiWritePromise; this.midiWritePromise = null;
    }

    public async sendNoteOn(note: number, velocity: number, channel: number = 0): Promise<void> { await this.sendMIDIMessage(this._buildNoteOnMessage(note, velocity, channel)); }
    public async sendNoteOff(note: number, velocity: number, channel: number = 0): Promise<void> { await this.sendMIDIMessage(this._buildNoteOffMessage(note, velocity, channel)); }
    public async sendControlChange(controller: number, value: number, channel: number = 0): Promise<void> { await this.sendMIDIMessage(this._buildControlChangeMessage(controller, value, channel)); }
    public isInitialized(): boolean { return this.characteristic !== null; }

    private _handleMIDIMessage(event: Event): void {
        const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
        const value = new Uint8Array(characteristic.value!.buffer);
        this.onMIDIMessage?.(value);
        this._parseMIDIMessage(value);
    }

    private _parseMIDIMessage(data: Uint8Array): void {
        if (data.length < 5) return;
        const status = data[2]; const type = status & 0xF0; const channel = status & 0x0F; const noteOrController = data[3]; const value = data[4];
        switch (type) {
            case 0x90:  this.onNoteOn?.(noteOrController, value, channel); break;
            case 0x80: this.onNoteOff?.(noteOrController, value, channel); break;
            case 0xB0: this.onControlChange?.(noteOrController, value, channel); break;
        }
    }

    private _buildNoteOnMessage(note: number, velocity: number, channel: number): Uint8Array { const ts = new Uint8Array([0,0]); const status = 0x90 | (channel & 0x0F); return new Uint8Array([...ts, status, note, velocity]); }
    private _buildNoteOffMessage(note: number, velocity: number, channel: number): Uint8Array { const ts = new Uint8Array([0,0]); const status = 0x80 | (channel & 0x0F); return new Uint8Array([...ts, status, note, velocity]); }
    private _buildControlChangeMessage(controller: number, value: number, channel: number): Uint8Array { const ts = new Uint8Array([0,0]); const status = 0xB0 | (channel & 0x0F); return new Uint8Array([...ts, status, controller, value]); }
}

