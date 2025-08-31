// bluetoothManager.svelte.js
import { BluetoothManager } from '~/lib/bluetooth/bluetoothManager';

// Singleton BluetoothManager across HMR and page entries (no globalThis)
const H = (import.meta as any).hot;
const DATA: any = H?.data || (H ? (H.data = {}) : {});
export const bluetoothManager: BluetoothManager = DATA.__wavy_bluetooth_manager ||= new BluetoothManager();

// Reactive state object
export const bluetoothState = $state({
  connectionState: 'disconnected',
  deviceName: 'unknown device name'
});

// Declarative: call once to wire store to manager lifecycle
export function initBluetoothStore() {
  if (DATA.__wavy_bt_store_attached) return;
  DATA.__wavy_bt_store_attached = true;

  const onConnect = () => {
    bluetoothState.connectionState = 'connected';
    bluetoothState.deviceName = bluetoothManager.name || 'unknown device name';
  };
  const onConnecting = () => {
    bluetoothState.connectionState = 'connecting';
  };
  const onDisconnect = () => {
    bluetoothState.connectionState = 'disconnected';
  };
  const onLoss = () => {
    bluetoothState.connectionState = 'connectionLoss';
  };
  const onReestablished = () => {
    bluetoothState.connectionState = 'connected';
  };

  // Save handlers so HMR can re-use or detach later if we add off()-APIs
  DATA.__wavy_bt_handlers = { onConnect, onConnecting, onDisconnect, onLoss, onReestablished };

  bluetoothManager.onConnect(onConnect);
  bluetoothManager.onConnecting(onConnecting);
  bluetoothManager.onDisconnect(onDisconnect);
  bluetoothManager.onConnectionLoss(onLoss);
  bluetoothManager.onConnectionReestablished(onReestablished);
}

// During HMR, keep state wiring intact; cleanup hooks can be added if .off() exists
H?.accept?.(() => {});
