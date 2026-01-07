import { parse_raw_to_midi_ble } from '~/lib/parsers/midi_parser_ble';
import { Log } from '~/lib/utils/Log';
import { BluetoothManager } from './bluetoothManager';

let log = new Log('midi_service', Log.LEVEL_INFO);

export class MIDIService {
    private characteristicKey: string | null = null;
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
        if (this.characteristicKey && this._boundCharHandler) {
            try { void this.bluetoothManager.removeCharacteristicListener(this.characteristicKey, 'characteristicvaluechanged', this._boundCharHandler); } catch {}
        }
        this.characteristicKey = null; this.midiInitPromise = null;
    }

    public async initialize(): Promise<boolean> {
        if (this.midiInitPromise) { await this.midiInitPromise; return this.characteristicKey !== null; }
        this.midiInitPromise = new Promise<void>(async (resolve, reject) => {
            try {
                // Remove old listener if any
                if (this.characteristicKey && this._boundCharHandler) {
                    try { await this.bluetoothManager.removeCharacteristicListener(this.characteristicKey, 'characteristicvaluechanged', this._boundCharHandler); } catch {}
                }
                this.characteristicKey = await this.bluetoothManager.getCharacteristicKey(this.MIDI_SERVICE_UUID, this.MIDI_CHARACTERISTIC_UUID);
                if (!this.characteristicKey) { reject(new Error('Failed to get MIDI characteristic')); return; }
                await this.bluetoothManager.startNotifications(this.characteristicKey);
                // Bind a stable handler and add exactly once
                if (!this._boundCharHandler) this._boundCharHandler = this._handleMIDIMessage.bind(this);
                await this.bluetoothManager.addCharacteristicListener(this.characteristicKey, 'characteristicvaluechanged', this._boundCharHandler);
                resolve();
            } catch (error) { reject(error); } finally { this.midiInitPromise = null; }
        });
        try { await this.midiInitPromise; return true; } catch { return false; }
    }

    public async sendMIDIMessage(message: Uint8Array): Promise<void> {
        if (!this.characteristicKey) { const ok = await this.initialize(); if (!ok) throw new Error('Failed to initialize MIDI characteristic'); }
        if (!this.characteristicKey) throw new Error('MIDI characteristic not available');
        if (this.midiWritePromise) await this.midiWritePromise;
        this.midiWritePromise = this.bluetoothManager.writeCharacteristicValueWithoutResponse(this.characteristicKey, message);
        await this.midiWritePromise; this.midiWritePromise = null;
    }

    public async sendNoteOn(note: number, velocity: number, channel: number = 0): Promise<void> { await this.sendMIDIMessage(this._buildNoteOnMessage(note, velocity, channel)); }
    public async sendNoteOff(note: number, velocity: number, channel: number = 0): Promise<void> { await this.sendMIDIMessage(this._buildNoteOffMessage(note, velocity, channel)); }
    public async sendControlChange(controller: number, value: number, channel: number = 0): Promise<void> { await this.sendMIDIMessage(this._buildControlChangeMessage(controller, value, channel)); }
    public isInitialized(): boolean { return this.characteristicKey !== null; }

    private _handleMIDIMessage(event: Event): void {
        const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
        const value = characteristic.value;
        if (!value) return;
        const data = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        const hex = Array.from(data).map((b) => b.toString(16).padStart(2, '0')).join(' ');
        log.debug(['packet', hex]);
        this.onMIDIMessage?.(data);

        let midiEvents = parse_raw_to_midi_ble(data);
        for (let event of midiEvents) {
        switch (event.type) {
            case 'note_on':
                this.onNoteOn?.(event.note, event.velocity, event.channel);
                log.debug(`midi note on: ${event}`)
                break;
            
            case 'note_off':
                this.onNoteOff?.(event.note, event.velocity, event.channel);
                log.debug(`midi note off: ${event}`)
                break;
            
            case 'control_change':
                this.onControlChange?.(event.controller, event.value, event.channel);
                log.debug(`midi control change: ${event}`)
                break;
            
            default:
            // Do nothing for these event types
            log.error(`midi event type not handeled: ${event}`);
            break;
        }
        }
    }

    private _buildNoteOnMessage(note: number, velocity: number, channel: number): Uint8Array { const ts = new Uint8Array([0,0]); const status = 0x90 | (channel & 0x0F); return new Uint8Array([...ts, status, note, velocity]); }
    private _buildNoteOffMessage(note: number, velocity: number, channel: number): Uint8Array { const ts = new Uint8Array([0,0]); const status = 0x80 | (channel & 0x0F); return new Uint8Array([...ts, status, note, velocity]); }
    private _buildControlChangeMessage(controller: number, value: number, channel: number): Uint8Array { const ts = new Uint8Array([0,0]); const status = 0xB0 | (channel & 0x0F); return new Uint8Array([...ts, status, controller, value]); }
}
