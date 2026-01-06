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
        // Spec: Empty payload is a no-op.
        if (data.length === 0) return;

        // Spec: BLE MIDI characteristic always delivers BLE-MIDI; byte 0 is timestampHigh.
        const isBlePacket = true;
        let i = 1;

        // Spec: Running status stores the last channel voice status (0x8n-0xEn).
        let runningStatus: number | null = null;

        // Spec: Each BLE-MIDI message begins with timestampLow (0x80-0xBF).
        let expectingTimestamp = isBlePacket;

        while (i < data.length) {
            // Spec: System real-time (0xF8-0xFF) may appear between any bytes, including before timestampLow.
            if (expectingTimestamp) {
                const ts = data[i];
                if (ts >= 0xF8) { i++; continue; }
                // Spec: In BLE packets, timestampLow is required before each message.
                if ((ts & 0x80) === 0 || (ts & 0x40) !== 0) break;
                i++;
                expectingTimestamp = false;
                if (i >= data.length) break;
            }

            // Spec: Status bytes have bit7=1; data bytes have bit7=0.
            const byte = data[i];
            let status: number | null = null;
            let dataIndex = i;

            if ((byte & 0x80) !== 0) {
                status = byte;
                i++;
                dataIndex = i;
            } else if (runningStatus !== null) {
                status = runningStatus;
                dataIndex = i;
            } else {
                i++;
                continue;
            }

            // Spec: System real-time (0xF8-0xFF) is 1 byte and does not affect running status.
            if (status >= 0xF8) { continue; }

            // Spec: System common (0xF0-0xF7) clears running status and has fixed lengths.
            if ((status & 0xF0) === 0xF0) {
                runningStatus = null;
                switch (status) {
                    case 0xF0: { // SysEx start ... SysEx end
                        while (dataIndex < data.length && data[dataIndex] !== 0xF7) dataIndex++;
                        if (dataIndex < data.length) dataIndex++;
                        i = dataIndex;
                        break;
                    }
                    case 0xF1: // MTC quarter frame
                    case 0xF3: { // Song select
                        if (dataIndex + 1 > data.length) { i = data.length; break; }
                        i = dataIndex + 1;
                        break;
                    }
                    case 0xF2: { // Song position pointer
                        if (dataIndex + 2 > data.length) { i = data.length; break; }
                        i = dataIndex + 2;
                        break;
                    }
                    case 0xF6: // Tune request
                    case 0xF7: { // SysEx end (standalone)
                        i = dataIndex;
                        break;
                    }
                    default: {
                        i = data.length;
                        break;
                    }
                }
                expectingTimestamp = isBlePacket;
                continue;
            }

            // Spec: Channel voice status sets running status.
            runningStatus = status;

            const type = status & 0xF0;
            const channel = status & 0x0F;

            // Spec: 0xCn/0xDn have 1 data byte; others have 2 data bytes.
            switch (type) {
                case 0xC0:
                case 0xD0: {
                    if (dataIndex + 1 > data.length) { i = data.length; break; }
                    const data1 = data[dataIndex];
                    if ((data1 & 0x80) !== 0) { i = data.length; break; }
                    i = dataIndex + 1;
                    break;
                }
                case 0x80:
                case 0x90:
                case 0xB0:
                default: {
                    if (dataIndex + 2 > data.length) { i = data.length; break; }
                    const data1 = data[dataIndex];
                    const data2 = data[dataIndex + 1];
                    if ((data1 & 0x80) !== 0 || (data2 & 0x80) !== 0) { i = data.length; break; }
                    i = dataIndex + 2;
                    switch (type) {
                        case 0x90: {
                            // Spec: Note-on with velocity 0 is note-off.
                            if (data2 === 0) {
                                log.debug(['note-off', { note: data1, velocity: data2, channel }]);
                                this.onNoteOff?.(data1, data2, channel);
                            } else {
                                log.debug(['note-on', { note: data1, velocity: data2, channel }]);
                                this.onNoteOn?.(data1, data2, channel);
                            }
                            break;
                        }
                        case 0x80: {
                            log.debug(['note-off', { note: data1, velocity: data2, channel }]);
                            this.onNoteOff?.(data1, data2, channel);
                            break;
                        }
                        case 0xB0: {
                            log.debug(['cc', { controller: data1, value: data2, channel }]);
                            this.onControlChange?.(data1, data2, channel);
                            break;
                        }
                    }
                    break;
                }
            }

            // Spec: In BLE-MIDI, each parsed message is followed by a timestampLow.
            expectingTimestamp = isBlePacket;
        }
    }

    private _buildNoteOnMessage(note: number, velocity: number, channel: number): Uint8Array { const ts = new Uint8Array([0,0]); const status = 0x90 | (channel & 0x0F); return new Uint8Array([...ts, status, note, velocity]); }
    private _buildNoteOffMessage(note: number, velocity: number, channel: number): Uint8Array { const ts = new Uint8Array([0,0]); const status = 0x80 | (channel & 0x0F); return new Uint8Array([...ts, status, note, velocity]); }
    private _buildControlChangeMessage(controller: number, value: number, channel: number): Uint8Array { const ts = new Uint8Array([0,0]); const status = 0xB0 | (channel & 0x0F); return new Uint8Array([...ts, status, controller, value]); }
}
