import { Log } from '../utils/Log';
import { BluetoothManager } from './bluetoothManager';

let log = new Log('device_state', Log.LEVEL_DEBUG);

const BT_STATE_CMD_OCTAVE = 0x0001;
const BT_STATE_CMD_CHANNEL = 0x0002;
const BT_STATE_CMD_MUTE_MASK = 0x0003;
const BT_STATE_CMD_PLAYBACK = 0x0005;
const BT_STATE_CMD_RECORDING = 0x0006;
const BT_STATE_CMD_BPM = 0x0007;
const BT_STATE_CMD_EFFECT = 0x0008;
const BT_STATE_CMD_EFFECT_PRESET = 0x0009;
const BT_STATE_CMD_HOLD = 0x000a;
const BT_STATE_CMD_UNDO_SESSION = 0x000b;
const DEVICE_STATE_CMD_POWER_STATE = 0x000c;
const DEVICE_STATE_CMD_BT_CONN_INTERVAL = 0x000d;
const DEVICE_STATE_CMD_BT_CONN_LATENCY = 0x000e;
const DEVICE_STATE_CMD_BT_CONN_TIMEOUT = 0x000f;

export type DeviceStateSnapshot = {
    octave: number | null;
    channel: number | null;
    muteMask: number | null;
    playback: boolean | null;
    recording: boolean | null;
    bpm: number | null;
    effectId: number | null;
    effectPreset: number | null;
    hold: boolean | null;
    undoSession: number | null;
    powerState: number | null;
    btConnInterval: number | null;
    btConnLatency: number | null;
    btConnTimeout: number | null;
};

export class DeviceStateService {
    private readonly STATE_SERVICE_UUID = '1a9f2b31-1c1a-4ef0-9fb2-6a5e26c03db9';
    private readonly STATE_CHARACTERISTIC_UUID = '1a9f2b32-1c1a-4ef0-9fb2-6a5e26c03db9';

    private readonly effectLabels: { [key: number]: string } = {
        0: 'none',
        1: 'arpeggio',
        2: 'double',
        3: 'drum',
        4: 'stutter',
        5: 'echo',
        6: 'pattern',
    };

    private bluetoothManager: BluetoothManager;
    private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
    private stateInitPromise: Promise<void> | null = null;
    private _boundCharHandler: ((event: Event) => void) | null = null;
    private deviceState: DeviceStateSnapshot = {
        octave: null as number | null,
        channel: null as number | null,
        muteMask: null as number | null,
        playback: null as boolean | null,
        recording: null as boolean | null,
        bpm: null as number | null,
        effectId: null as number | null,
        effectPreset: null as number | null,
        hold: null as boolean | null,
        undoSession: null as number | null,
        powerState: null as number | null,
        btConnInterval: null as number | null,
        btConnLatency: null as number | null,
        btConnTimeout: null as number | null,
    };

    public onStateUpdate: ((state: DeviceStateSnapshot) => void) | null = null;

    public constructor(bluetoothManager: BluetoothManager) {
        this.bluetoothManager = bluetoothManager;
    }

    public reset(): void {
        this.characteristic = null;
        this.stateInitPromise = null;
        this.initialize();
    }

    public async initialize(): Promise<boolean> {
        if (this.stateInitPromise) { await this.stateInitPromise; return this.characteristic !== null; }
        this.stateInitPromise = new Promise<void>(async (resolve, reject) => {
            try {
                if (this.characteristic && this._boundCharHandler) {
                    try { this.characteristic.removeEventListener('characteristicvaluechanged', this._boundCharHandler); } catch {}
                }
                this.characteristic = await this.bluetoothManager.getCharacteristic(this.STATE_SERVICE_UUID, this.STATE_CHARACTERISTIC_UUID);
                if (!this.characteristic) { reject(new Error('Failed to get device state characteristic')); return; }
                await this.characteristic.startNotifications();
                if (!this._boundCharHandler) this._boundCharHandler = this._handleStateMessage.bind(this);
                this.characteristic.addEventListener('characteristicvaluechanged', this._boundCharHandler);
                resolve();
            } catch (error) { reject(error); } finally { this.stateInitPromise = null; }
        });
        try { await this.stateInitPromise; return true; } catch { return false; }
    }

    public isInitialized(): boolean { return this.characteristic !== null; }

    // A single snapshot log helps verify the full device state after any update.
    public logStateSnapshot(): void {
        const effectLabel = this.deviceState.effectId === null ? 'unset' : (this.effectLabels[this.deviceState.effectId] ?? `unknown(${this.deviceState.effectId})`);
        const list = [
            `octave=${this.deviceState.octave ?? 'unset'}`,
            `channel=${this.deviceState.channel ?? 'unset'}`,
            `muteMask=${this.deviceState.muteMask === null ? 'unset' : `0x${this.deviceState.muteMask.toString(16).padStart(4, '0')}`}`,
            `playback=${this.deviceState.playback ?? 'unset'}`,
            `recording=${this.deviceState.recording ?? 'unset'}`,
            `bpm=${this.deviceState.bpm ?? 'unset'}`,
            `effect=${effectLabel}`,
            `effectPreset=${this.deviceState.effectPreset ?? 'unset'}`,
            `hold=${this.deviceState.hold ?? 'unset'}`,
            `undoSession=${this.deviceState.undoSession ?? 'unset'}`,
            `powerState=${this.deviceState.powerState ?? 'unset'}`,
            `btConnInterval=${this.deviceState.btConnInterval ?? 'unset'}`,
            `btConnLatency=${this.deviceState.btConnLatency ?? 'unset'}`,
            `btConnTimeout=${this.deviceState.btConnTimeout ?? 'unset'}`,
        ];
        log.info(list);
    }

    private _handleStateMessage(event: Event): void {
        const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
        const value = characteristic.value;
        if (!value) return;

        log.debug(`Received ${value.byteLength} bytes of device state`)

        const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
        if (view.byteLength < 4) return;

        let didUpdate = false;
        for (let offset = 0; offset + 4 <= view.byteLength; offset += 4) {
            const cmd = view.getUint16(offset, true);
            const rawValue = view.getUint16(offset + 2, true);
            const signedValue = view.getInt16(offset + 2, true);

            switch (cmd) {
                case BT_STATE_CMD_OCTAVE: {
                    log.debug(`Device state octave ${signedValue}`)

                    this.deviceState.octave = signedValue;
                    didUpdate = true;
                    break;
                }
                case BT_STATE_CMD_CHANNEL: {
                    log.debug(`Device state channel ${signedValue}`)
                    this.deviceState.channel = rawValue & 0xff;
                    didUpdate = true;
                    break;
                }
                case BT_STATE_CMD_MUTE_MASK: {
                    log.debug(`Device state mute mask ${signedValue}`)
                    this.deviceState.muteMask = rawValue;
                    didUpdate = true;
                    break;
                }
                case BT_STATE_CMD_PLAYBACK: {
                    log.debug(`Device state playback ${signedValue}`)
                    this.deviceState.playback = rawValue !== 0;
                    didUpdate = true;
                    break;
                }
                case BT_STATE_CMD_RECORDING: {
                    log.debug(`Device state recording ${signedValue}`)
                    this.deviceState.recording = rawValue !== 0;
                    didUpdate = true;
                    break;
                }
                case BT_STATE_CMD_BPM: {
                    log.debug(`Device state bpm ${signedValue}`)
                    this.deviceState.bpm = rawValue;
                    didUpdate = true;
                    break;
                }
                case BT_STATE_CMD_EFFECT: {
                    log.debug(`Device state effect ${signedValue}`)
                    this.deviceState.effectId = rawValue;
                    didUpdate = true;
                    break;
                }
                case BT_STATE_CMD_EFFECT_PRESET: {
                    log.debug(`Device state effect preset ${signedValue}`)
                    this.deviceState.effectPreset = rawValue;
                    didUpdate = true;
                    break;
                }
                case BT_STATE_CMD_HOLD: {
                    log.debug(`Device state hold ${signedValue}`)
                    this.deviceState.hold = rawValue !== 0;
                    didUpdate = true;
                    break;
                }
                case BT_STATE_CMD_UNDO_SESSION: {
                    log.debug(`Device state undo session ${signedValue}`)
                    this.deviceState.undoSession = rawValue;
                    didUpdate = true;
                    break;
                }
                case DEVICE_STATE_CMD_POWER_STATE: {
                    log.debug(`Device state power state ${signedValue}`)
                    this.deviceState.powerState = rawValue;
                    didUpdate = true;
                    break;
                }
                case DEVICE_STATE_CMD_BT_CONN_INTERVAL: {
                    log.debug(`Device state bt conn interval ${signedValue}`)
                    this.deviceState.btConnInterval = rawValue;
                    didUpdate = true;
                    break;
                }
                case DEVICE_STATE_CMD_BT_CONN_LATENCY: {
                    log.debug(`Device state bt conn latency ${signedValue}`)
                    this.deviceState.btConnLatency = rawValue;
                    didUpdate = true;
                    break;
                }
                case DEVICE_STATE_CMD_BT_CONN_TIMEOUT: {
                    log.debug(`Device state bt conn timeout ${signedValue}`)
                    this.deviceState.btConnTimeout = rawValue;
                    didUpdate = true;
                    break;
                }
                default: {
                    log.warning(`state unknown cmd 0x${cmd.toString(16)} value ${rawValue}`);
                    break;
                }
            }
        }

        if (didUpdate) {
            this.onStateUpdate?.({ ...this.deviceState });
            this.logStateSnapshot();
        }
    }
}
