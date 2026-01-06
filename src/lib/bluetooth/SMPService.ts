// SMPCharacteristic.ts (renamed from MCUManager)
import { Log } from '../utils/Log';
import { BluetoothManager } from './bluetoothManager';
import CBOR from './smp/cbor';

let log = new Log('smpBluetoothCharacteristic', Log.LEVEL_INFO);

export const SMP_ERR_RC: { [code: number]: string } = {
    0: 'No error, OK.',
    1: 'Unknown error.',
    2: 'Not enough memory; this error is reported when there is not enough memory to complete response.',
    3: 'Invalid value; a request contains an invalid value.',
    4: 'Timeout; the operation for some reason could not be completed in assumed time.',
    5: 'No entry; the error means that request frame has been missing some information that is required to perform action. It may also mean that requested information is not available.',
    6: 'Bad state; the error means that application or device is in a state that would not allow it to perform or complete a requested action.',
    7: 'Response too long; this error is issued when buffer assigned for gathering response is not big enough.',
    8: 'Not supported; usually issued when requested Group ID or Command ID is not supported by application.',
    9: 'Corrupted payload received.',
    10: 'Device is busy with processing previous SMP request and may not process incoming one. Client should re-try later.',
    256: 'This is base error number of user defined error codes.'
};

export const MGMT_ERR = {
    EOK: 0,
    EUNKNOWN: 1,
    ENOMEM: 2,
    EINVAL: 3,
    ETIMEOUT: 4,
    ENOENT: 5,
    EBADSTATE: 6,
    EMSGSIZE: 7,
    ENOTSUP: 8,
    ECORRUPT: 9,
    EBUSY: 10,
    EACCESSDENIED: 11,
    UNSUPPORTED_TOO_OLD: 12,
    UNSUPPORTED_TOO_NEW: 13,
    EPERUSER: 256
};

export const MGMT_OP = { READ: 0, READ_RSP: 1, WRITE: 2, WRITE_RSP: 3 };

export interface ResponseError { rc: number; }
interface ResponseResolver { resolve: (data: any) => void; reject: (error: any) => void; }

export class SMPService {
    private smpSequenceNumber: number = 0;
    private responseResolvers: { [sequenceNumber: number]: ResponseResolver } = {};
    private readonly SMP_HEADER_SIZE: number = 8;
    private readonly SMP_HEADER_OP_IDX: number = 0;
    private readonly SMP_HEADER_FLAGS_IDX: number = 1;
    private readonly SMP_HEADER_LEN_HI_IDX: number = 2;
    private readonly SMP_HEADER_LEN_LO_IDX: number = 3;
    private readonly SMP_HEADER_GROUP_HI_IDX: number = 4;
    private readonly SMP_HEADER_GROUP_LO_IDX: number = 5;
    private readonly SMP_HEADER_SEQ_IDX: number = 6;
    private readonly SMP_HEADER_ID_IDX: number = 7;

    private readonly SMP_SERVICE_UUID = '8d53dc1d-1db7-4cd3-868b-8a527460aa84';
    private readonly SMP_CHARACTERISTIC_UUID = 'da2e7828-fbce-4e01-ae9e-261174997c48';
    private smpCharacteristicKey: string | null = null;
    private _boundCharHandler: ((event: Event) => void) | null = null;
    private smpInitialized: boolean = false;
    private smpBuffer: Uint8Array = new Uint8Array([]);
    private smpInitPromise: Promise<void> | null = null;
    private smpWritePromise: Promise<void> | null = null;

    private bluetoothManager: BluetoothManager;

    public constructor(bluetoothManager: BluetoothManager) {
        this.bluetoothManager = bluetoothManager;
    }

    public reset(): void {
        if (this.smpCharacteristicKey && this._boundCharHandler) {
            try { void this.bluetoothManager.removeCharacteristicListener(this.smpCharacteristicKey, 'characteristicvaluechanged', this._boundCharHandler); } catch {}
        }
        this.smpInitPromise = null;
        this.smpInitialized = false;
        this.smpCharacteristicKey = null;
    }

    private async _initializeSMP(): Promise<void> {
        if (this.smpInitPromise) return this.smpInitPromise;
        this.smpInitPromise = new Promise<void>(async (resolve, reject) => {
            try {
                this.smpCharacteristicKey = await this.bluetoothManager.getCharacteristicKey(this.SMP_SERVICE_UUID, this.SMP_CHARACTERISTIC_UUID);
                if (!this.smpCharacteristicKey) { reject(new Error('Failed to get SMP characteristic')); return; }
                await this.bluetoothManager.startNotifications(this.smpCharacteristicKey);
                if (!this._boundCharHandler) this._boundCharHandler = this._handleSMPMessage.bind(this);
                await this.bluetoothManager.addCharacteristicListener(this.smpCharacteristicKey, 'characteristicvaluechanged', this._boundCharHandler);
                this.smpInitialized = true;
                resolve();
            } catch (error) { reject(error); } finally { this.smpInitPromise = null; }
        });
        return this.smpInitPromise;
    }

    public get maxPayloadSize(): number { return this.bluetoothManager.maxPayloadSize; }
    private _buildSMPMessage(op: number, flags: number, group: number, sequenceNumber: number, commandId: number, payload: Uint8Array = new Uint8Array([])): Uint8Array {
        const length = payload.length;
        const header = new Uint8Array(this.SMP_HEADER_SIZE);
        header[this.SMP_HEADER_OP_IDX] = op; header[this.SMP_HEADER_FLAGS_IDX] = flags; header[this.SMP_HEADER_LEN_HI_IDX] = (length >> 8) & 0xFF; header[this.SMP_HEADER_LEN_LO_IDX] = length & 0xFF; header[this.SMP_HEADER_GROUP_HI_IDX] = (group >> 8) & 0xFF; header[this.SMP_HEADER_GROUP_LO_IDX] = group & 0xFF; header[this.SMP_HEADER_SEQ_IDX] = sequenceNumber; header[this.SMP_HEADER_ID_IDX] = commandId; return new Uint8Array([...header, ...payload]);
    }

    public async sendMessage(op: number, group: number, id: number, payload: Uint8Array = new Uint8Array([])): Promise<Object> {
        if (!this.smpInitialized) await this._initializeSMP();
        const sequenceNumber = this.smpSequenceNumber; this.smpSequenceNumber = (this.smpSequenceNumber + 1) % 256; const flags = 0; const message = this._buildSMPMessage(op, flags, group, sequenceNumber, id, payload);
        return new Promise<any>(async (resolve, reject) => {
            this.responseResolvers[sequenceNumber] = { resolve, reject };
            try {
                if (this.smpWritePromise) await this.smpWritePromise;
                if (!this.smpCharacteristicKey) throw new Error('SMP characteristic not available');
                this.smpWritePromise = this.bluetoothManager.writeCharacteristicValueWithoutResponse(this.smpCharacteristicKey, message);
                await this.smpWritePromise; this.smpWritePromise = null;
            } catch (error: any) {
                log.debug(`Failed to send SMP message: ${error}`);
                delete this.responseResolvers[sequenceNumber]; this.smpWritePromise = null;
                if (error.message?.includes('no longer valid') || error.message?.includes('Characteristic')) {
                    this.smpInitialized = false;
                    try { await this._initializeSMP(); if (this.smpCharacteristicKey) { await this.bluetoothManager.writeCharacteristicValueWithoutResponse(this.smpCharacteristicKey, message); return; } } catch {}
                }
                reject(error);
            }
        });
    }

    private async _handleSMPMessage(event: Event): Promise<void> {
        const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
        const dv = characteristic.value!;
        const value = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
        this.smpBuffer = new Uint8Array([...this.smpBuffer, ...value]);
        while (this.smpBuffer.length >= this.SMP_HEADER_SIZE) {
            const length = (this.smpBuffer[2] << 8) | this.smpBuffer[3]; const totalLength = this.SMP_HEADER_SIZE + length;
            if (this.smpBuffer.length >= totalLength) { const message = this.smpBuffer.slice(0, totalLength); await this._processMessage(message); this.smpBuffer = this.smpBuffer.slice(totalLength); } else break;
        }
    }

    private async _processMessage(message: Uint8Array): Promise<void> {
        const payload = message.slice(this.SMP_HEADER_SIZE);
        // Ensure we pass a tightly sliced ArrayBuffer to the decoder
        const ab = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);
        let data; try { data = CBOR.decode(ab); } catch (error) { log.error(`Error decoding CBOR: ${error}`); return; }
        const seq = message[this.SMP_HEADER_SEQ_IDX]; const resolver = this.responseResolvers[seq]; if (resolver) { resolver.resolve(data); delete this.responseResolvers[seq]; }
    }
}
