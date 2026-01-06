import { Log } from '../utils/Log';
import { BluetoothManager } from './bluetoothManager';

let log = new Log('midi', Log.LEVEL_DEBUG);

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
        this._parseMIDIMessage(data);
    }

    private _parseMIDIMessage(data: Uint8Array): void {
        if (data.length === 0) return;
        const isBlePacket = (data[0] & 0x80) !== 0;
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
        const isDataByte = (value: number) => (value & 0x80) === 0;
        const hasDataBytes = (idx: number, len: number) => {
            if (len === 0) return true;
            if (idx + len > data.length) return false;
            for (let j = 0; j < len; j++) {
                if (!isDataByte(data[idx + j])) return false;
            }
            return true;
        };
        const shouldTreatAsStatus = (status: number, idx: number) => {
            if (isRealtime(status)) return true;
            const dataLen = dataLenForStatus(status);
            return hasDataBytes(idx + 1, dataLen);
        };
        const handleChannelMessage = (status: number, data1: number, data2: number) => {
            const type = status & 0xF0;
            const channel = status & 0x0F;
            switch (type) {
                case 0x90:
                    if (data2 === 0) {
                        log.debug(['note-off', { note: data1, velocity: data2, channel }]);
                        this.onNoteOff?.(data1, data2, channel);
                    } else {
                        log.debug(['note-on', { note: data1, velocity: data2, channel }]);
                        this.onNoteOn?.(data1, data2, channel);
                    }
                    break;
                case 0x80:
                    log.debug(['note-off', { note: data1, velocity: data2, channel }]);
                    this.onNoteOff?.(data1, data2, channel);
                    break;
                case 0xB0:
                    log.debug(['cc', { controller: data1, value: data2, channel }]);
                    this.onControlChange?.(data1, data2, channel);
                    break;
            }
        };

        let i = isBlePacket ? 1 : 0;
        while (i < data.length) {
            let status = data[i];
            if ((status & 0x80) !== 0) {
                if (isBlePacket && !shouldTreatAsStatus(status, i)) {
                    // Likely BLE-MIDI timestamp byte; skip it.
                    i++;
                    continue;
                }
                if (isRealtime(status)) { i++; continue; }
                i++;
                if ((status & 0xF0) !== 0xF0) runningStatus = status;
                else if (status < 0xF8) runningStatus = null;
            } else if (runningStatus !== null) {
                status = runningStatus;
            } else {
                i++;
                continue;
            }

            const type = status & 0xF0;
            if (type === 0xF0) {
                if (status === 0xF0) {
                    while (i < data.length && data[i] !== 0xF7) i++;
                    if (i < data.length) i++;
                } else {
                    const sysLen = dataLenForStatus(status);
                    if (i + sysLen > data.length) break;
                    i += sysLen;
                }
                continue;
            }

            const dataLen = dataLenForStatus(status);
            if (!hasDataBytes(i, dataLen)) break;
            const data1 = data[i++];
            const data2 = dataLen === 2 ? data[i++] : 0;
            if (!isDataByte(data1) || (dataLen === 2 && !isDataByte(data2))) continue;
            handleChannelMessage(status, data1, data2);
        }
    }

    private _buildNoteOnMessage(note: number, velocity: number, channel: number): Uint8Array { const ts = new Uint8Array([0,0]); const status = 0x90 | (channel & 0x0F); return new Uint8Array([...ts, status, note, velocity]); }
    private _buildNoteOffMessage(note: number, velocity: number, channel: number): Uint8Array { const ts = new Uint8Array([0,0]); const status = 0x80 | (channel & 0x0F); return new Uint8Array([...ts, status, note, velocity]); }
    private _buildControlChangeMessage(controller: number, value: number, channel: number): Uint8Array { const ts = new Uint8Array([0,0]); const status = 0xB0 | (channel & 0x0F); return new Uint8Array([...ts, status, controller, value]); }
}
