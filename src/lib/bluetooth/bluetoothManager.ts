import { Log } from '../utils/Log';

let log = new Log('bluetooth', Log.LEVEL_INFO);

type ConnectionState =
  | { type: 'disconnected' }
  | { type: 'selectingDevice' }
  | { type: 'connecting' }
  | { type: 'connected' }
  | { type: 'disconnecting' }
  | { type: 'connectionLoss' };

export class BluetoothManager {
    private device: BluetoothDevice | null = null;
    private mtu: number = 250;
    private state: ConnectionState = { type: 'disconnected' };
    private gattQueue: Promise<void> = Promise.resolve();
    private characteristicCache: Map<string, BluetoothRemoteGATTCharacteristic> = new Map();

    public onConnect: (() => void) | null = null;
    public onDisconnect: (() => void) | null = null;
    public onConnecting: (() => void) | null = null;
    public onConnectionLoss: (() => void) | null = null;
    public onConnectionReestablished: (() => void) | null = null;
    public onDataReceived: ((data: Uint8Array) => void) | null = null;
    public onDeviceSelection: (() => void) | null = null;
    public onDeviceSelectionCancel: (() => void) | null = null;

    constructor() {}

    public get connectedDevice(): BluetoothDevice | null { return this.device; }
    public get gattServer(): BluetoothRemoteGATTServer | null { return this.device?.gatt || null; }

    public async getCharacteristicKey(serviceUUID: string, characteristicUUID: string): Promise<string | null> {
        const key = this._buildCharacteristicKey(serviceUUID, characteristicUUID);
        if (this.characteristicCache.has(key)) return key;
        const characteristic = await this._getCharacteristicForKey(key);
        return characteristic ? key : null;
    }

    public async startNotifications(characteristicKey: string): Promise<void> {
        const characteristic = await this._getCharacteristicForKey(characteristicKey);
        if (!characteristic) throw new Error('Characteristic not available');
        await this._queueGattOperation(() => characteristic.startNotifications());
    }

    public async stopNotifications(characteristicKey: string): Promise<void> {
        const characteristic = await this._getCharacteristicForKey(characteristicKey);
        if (!characteristic) throw new Error('Characteristic not available');
        await this._queueGattOperation(() => characteristic.stopNotifications());
    }

    public async readCharacteristicValue(characteristicKey: string): Promise<DataView> {
        const characteristic = await this._getCharacteristicForKey(characteristicKey);
        if (!characteristic) throw new Error('Characteristic not available');
        return this._queueGattOperation(() => characteristic.readValue());
    }

    public async writeCharacteristicValueWithoutResponse(characteristicKey: string, value: BufferSource): Promise<void> {
        const characteristic = await this._getCharacteristicForKey(characteristicKey);
        if (!characteristic) throw new Error('Characteristic not available');
        await this._queueGattOperation(() => characteristic.writeValueWithoutResponse(value));
    }

    public async addCharacteristicListener(characteristicKey: string, eventName: string, handler: EventListener): Promise<void> {
        const characteristic = await this._getCharacteristicForKey(characteristicKey);
        if (!characteristic) throw new Error('Characteristic not available');
        characteristic.addEventListener(eventName, handler);
    }

    public async removeCharacteristicListener(characteristicKey: string, eventName: string, handler: EventListener): Promise<void> {
        const characteristic = this.characteristicCache.get(characteristicKey);
        if (!characteristic) return;
        characteristic.removeEventListener(eventName, handler);
    }

    private async _requestDevice(filters?: BluetoothLEScanFilter[]): Promise<BluetoothDevice> {
        const params = { optionalServices: ['03b80e5a-ede8-4b33-a751-6ce34ec4c700', '8d53dc1d-1db7-4cd3-868b-8a527460aa84', '1a9f2b31-1c1a-4ef0-9fb2-6a5e26c03db9', '0000180f-0000-1000-8000-00805f9b34fb', '0000180a-0000-1000-8000-00805f9b34fb'] } as RequestDeviceOptions;
        if (filters) (params as { filters: BluetoothLEScanFilter[] }).filters = filters; else (params as { acceptAllDevices: boolean }).acceptAllDevices = true;
        this.onDeviceSelection?.();
        return navigator.bluetooth.requestDevice(params);
    }

    public async connect(filters?: BluetoothLEScanFilter[]): Promise<void> {
        if (this.state.type !== 'disconnected') { console.warn('Already connecting or connected.'); return; }
        this.state = { type: 'selectingDevice' };
        try {
            this.device = await this._requestDevice(filters);
            this.state = { type: 'connecting' }; this.onConnecting?.()
            this.device.addEventListener('gattserverdisconnected', this._handleDisconnection.bind(this));
            await this._connectDevice();
        } catch (error: any) {
            if (error.name === 'NotFoundError') { this.state = { type: 'disconnected' }; this.onDeviceSelectionCancel?.(); }
            else { console.error('Connection error:', error); await this._handleDisconnected(); }
        }
    }

    private async _connectDevice(): Promise<void> {
        if (!this.device) { console.error('No device to connect to'); return; }
        // Already connected; normalize state and fire events
        if (this.device.gatt?.connected) {
            if (this.state.type === 'connectionLoss') this.onConnectionReestablished?.();
            else this.onConnect()
            this.state = { type: 'connected' };
            return;
        }
        // Exponential backoff retry
        const MAX_ATTEMPTS = 20; // configurable upper bound
        const BASE_DELAY = 300;   // ms
        const MAX_DELAY = 5000;   // ms
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                await this.device.gatt!.connect();
                if (this.state.type === 'connecting' || this.state.type === 'connectionLoss') {
                    if (this.state.type === 'connectionLoss') this.onConnectionReestablished?.();
                    else this.onConnect()
                    this.state = { type: 'connected' };
                }
                return;
            } catch (error) {
                // If state changed to disconnecting, abort
                if (this.state.type === 'disconnecting') break;
                const delay = Math.min(MAX_DELAY, BASE_DELAY * Math.pow(2, attempt - 1));
                await new Promise(r => setTimeout(r, delay));
            }
        }
        // Failed after attempts
        await this._handleDisconnected();
    }

    public disconnect(): void {
        if (this.state.type !== 'connected') { console.warn('Cannot disconnect because not connected.'); return; }
        this.state = { type: 'disconnecting' };
        this.device?.gatt?.disconnect();
    }

    private async _handleDisconnection(): Promise<void> {
        this._resetCharacteristicCache();
        if (this.state.type === 'connected') { this.state = { type: 'connectionLoss' }; this.onConnectionLoss?.(); await this._reconnect(); }
        else if (this.state.type === 'disconnecting') { await this._handleDisconnected?.(); }
    }

    private async _reconnect(): Promise<void> { try { await this._connectDevice(); } catch (e) { console.error('Reconnection error:', e); } }
    private async _handleDisconnected(): Promise<void> {
        this._resetCharacteristicCache();
        this.state = { type: 'disconnected' };
        this.onDisconnect?.();
        this.device = null;
    }
    public get name(): string | undefined { return this.device?.name; }
    public get maxPayloadSize(): number { const MTU_OVERHEAD = 3; return this.mtu - MTU_OVERHEAD - 8; }

    // Serialize GATT operations to avoid overlapping requests on some platforms.
    private _queueGattOperation<T>(operation: () => Promise<T>): Promise<T> {
        const run = () => operation();
        const result = this.gattQueue.then(run, run);
        this.gattQueue = result.then(() => undefined, () => undefined);
        return result;
    }

    private _buildCharacteristicKey(serviceUUID: string, characteristicUUID: string): string {
        return `${serviceUUID.toLowerCase()}:${characteristicUUID.toLowerCase()}`;
    }

    private async _getCharacteristicForKey(characteristicKey: string): Promise<BluetoothRemoteGATTCharacteristic | null> {
        const cached = this.characteristicCache.get(characteristicKey);
        if (cached) return cached;
        if (!this.device || !this.device.gatt) { console.error('No device connected'); return null; }
        const [serviceUUID, characteristicUUID] = characteristicKey.split(':');
        if (!serviceUUID || !characteristicUUID) { console.error(`Invalid characteristic key ${characteristicKey}`); return null; }
        try {
            const characteristic = await this._queueGattOperation(async () => {
                const service = await this.device!.gatt!.getPrimaryService(serviceUUID);
                return service.getCharacteristic(characteristicUUID);
            });
            this.characteristicCache.set(characteristicKey, characteristic);
            return characteristic;
        } catch (error) {
            console.error(`Failed to get characteristic ${characteristicUUID} from service ${serviceUUID}:`, error);
            return null;
        }
    }

    private _resetCharacteristicCache(): void {
        this.characteristicCache.clear();
    }
}
