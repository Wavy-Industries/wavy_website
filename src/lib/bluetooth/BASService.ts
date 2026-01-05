import { BluetoothManager } from './bluetoothManager';

export class BatteryService {
    private readonly BAS_SERVICE_UUID = '0000180f-0000-1000-8000-00805f9b34fb';
    private readonly BATTERY_LEVEL_UUID = '00002a19-0000-1000-8000-00805f9b34fb';

    private bluetoothManager: BluetoothManager;
    private characteristic: BluetoothRemoteGATTCharacteristic | null = null;
    private initPromise: Promise<void> | null = null;
    private _boundCharHandler: ((event: Event) => void) | null = null;
    private cachedLevel: number | null = null;

    public onBatteryLevel: ((level: number) => void) | null = null;

    public constructor(bluetoothManager: BluetoothManager) {
        this.bluetoothManager = bluetoothManager;
    }

    public reset(): void {
        if (this.characteristic && this._boundCharHandler) {
            try { this.characteristic.removeEventListener('characteristicvaluechanged', this._boundCharHandler); } catch {}
        }
        this.characteristic = null;
        this.cachedLevel = null;
        this.initPromise = null;
        this.initialize();
    }

    public async initialize(): Promise<boolean> {
        if (this.initPromise) { await this.initPromise; return this.characteristic !== null; }
        this.initPromise = new Promise<void>(async (resolve, reject) => {
            try {
                if (this.characteristic && this._boundCharHandler) {
                    try { this.characteristic.removeEventListener('characteristicvaluechanged', this._boundCharHandler); } catch {}
                }
                this.characteristic = await this.bluetoothManager.getCharacteristic(this.BAS_SERVICE_UUID, this.BATTERY_LEVEL_UUID);
                if (!this.characteristic) { reject(new Error('Failed to get battery level characteristic')); return; }
                try { await this.characteristic.startNotifications(); } catch {}
                if (!this._boundCharHandler) this._boundCharHandler = this._handleBatteryLevel.bind(this);
                this.characteristic.addEventListener('characteristicvaluechanged', this._boundCharHandler);
                resolve();
            } catch (error) { reject(error); } finally { this.initPromise = null; }
        });
        try { await this.initPromise; return true; } catch { return false; }
    }

    public isInitialized(): boolean { return this.characteristic !== null; }

    public async getBatteryLevel(): Promise<number | null> {
        if (!this.characteristic) { const ok = await this.initialize(); if (!ok || !this.characteristic) return null; }
        const view = await this.characteristic.readValue();
        if (!view || view.byteLength < 1) return null;
        const level = view.getUint8(0);
        this.cachedLevel = level;
        this.onBatteryLevel?.(level);
        return level;
    }

    public get lastBatteryLevel(): number | null { return this.cachedLevel; }

    private _handleBatteryLevel(event: Event): void {
        const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
        const value = characteristic.value;
        if (!value || value.byteLength < 1) return;
        const level = value.getUint8(0);
        this.cachedLevel = level;
        this.onBatteryLevel?.(level);
    }
}
