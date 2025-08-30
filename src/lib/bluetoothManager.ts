import { Log } from './utilities';

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
    private _onConnect = new Set<() => void>();
    private _onDisconnect = new Set<() => void>();
    private _onConnecting = new Set<() => void>();
    private _onConnectionLoss = new Set<() => void>();
    private _onConnectionReestablished = new Set<() => void>();
    private _onDataReceived = new Set<(data: Uint8Array) => void>();
    private _onDeviceSelection = new Set<() => void>();
    private _onDeviceSelectionCancel = new Set<() => void>();

    public onConnect(callback: () => void) { this._onConnect.add(callback); }
    public onDisconnect(callback: () => void) { this._onDisconnect.add(callback); }
    public onConnecting(callback: () => void) { this._onConnecting.add(callback); }
    public onConnectionLoss(callback: () => void) { this._onConnectionLoss.add(callback); }
    public onConnectionReestablished(callback: () => void) { this._onConnectionReestablished.add(callback); }
    public onDataReceived(callback: (data: Uint8Array) => void) { this._onDataReceived.add(callback); }
    public onDeviceSelection(callback: () => void) { this._onDeviceSelection.add(callback); }
    public onDeviceSelectionCancel(callback: () => void) { this._onDeviceSelectionCancel.add(callback); }

    constructor() {}

    public get connectedDevice(): BluetoothDevice | null { return this.device; }
    public get gattServer(): BluetoothRemoteGATTServer | null { return this.device?.gatt || null; }

    public async getCharacteristic(serviceUUID: string, characteristicUUID: string): Promise<BluetoothRemoteGATTCharacteristic | null> {
        if (!this.device || !this.device.gatt) { console.error('No device connected'); return null; }
        try {
            const service = await this.device.gatt.getPrimaryService(serviceUUID);
            const characteristic = await service.getCharacteristic(characteristicUUID);
            return characteristic;
        } catch (error) {
            console.error(`Failed to get characteristic ${characteristicUUID} from service ${serviceUUID}:`, error);
            return null;
        }
    }

    private async _requestDevice(filters?: BluetoothLEScanFilter[]): Promise<BluetoothDevice> {
        const params = { optionalServices: ['03b80e5a-ede8-4b33-a751-6ce34ec4c700','8d53dc1d-1db7-4cd3-868b-8a527460aa84'] } as RequestDeviceOptions;
        if (filters) (params as { filters: BluetoothLEScanFilter[] }).filters = filters; else (params as { acceptAllDevices: boolean }).acceptAllDevices = true;
        this._onDeviceSelection.forEach(cb => cb());
        return navigator.bluetooth.requestDevice(params);
    }

    public async connect(filters?: BluetoothLEScanFilter[]): Promise<void> {
        if (this.state.type !== 'disconnected') { console.warn('Already connecting or connected.'); return; }
        this.state = { type: 'selectingDevice' };
        try {
            this.device = await this._requestDevice(filters);
            this.state = { type: 'connecting' }; this._onConnecting.forEach(cb => cb());
            this.device.addEventListener('gattserverdisconnected', this._handleDisconnection.bind(this));
            await this._connectDevice();
        } catch (error: any) {
            if (error.name === 'NotFoundError') { this.state = { type: 'disconnected' }; this._onDeviceSelectionCancel.forEach(cb => cb()); }
            else { console.error('Connection error:', error); await this._handleDisconnected(); }
        }
    }

    private async _connectDevice(): Promise<void> {
        if (!this.device) { console.error('No device to connect to'); return; }
        try {
            await this.device.gatt!.connect();
            if (this.state.type === 'connecting' || this.state.type === 'connectionLoss') {
                if (this.state.type === 'connectionLoss') this._onConnectionReestablished.forEach(cb => cb());
                else this._onConnect.forEach(cb => cb());
                this.state = { type: 'connected' };
            }
        } catch (error) { console.error('Error during connection:', error); await this._handleDisconnected(); }
    }

    public disconnect(): void {
        if (this.state.type !== 'connected') { console.warn('Cannot disconnect because not connected.'); return; }
        this.state = { type: 'disconnecting' };
        this.device?.gatt?.disconnect();
    }

    private async _handleDisconnection(): Promise<void> {
        if (this.state.type === 'connected') { this.state = { type: 'connectionLoss' }; this._onConnectionLoss.forEach(cb => cb()); await this._reconnect(); }
        else if (this.state.type === 'disconnecting') { await this._handleDisconnected(); }
    }

    private async _reconnect(): Promise<void> { try { await new Promise(r => setTimeout(r, 1000)); await this._connectDevice(); } catch (e) { console.error('Reconnection error:', e); } }
    private async _handleDisconnected(): Promise<void> { this.state = { type: 'disconnected' }; this._onDisconnect.forEach(cb => cb()); this.device = null; }
    public get name(): string | undefined { return this.device?.name; }
    public get maxPayloadSize(): number { const MTU_OVERHEAD = 3; return this.mtu - MTU_OVERHEAD - 8; }
}
