// bluetoothManager.svelte.js
import { BluetoothManager } from '~/lib/bluetoothManager';

// Singleton BluetoothManager across HMR and page entries
const G: any = (globalThis as any);
export const bluetoothManager: BluetoothManager = G.__wavy_bt_manager ||= new BluetoothManager();

// Reactive state object
export const bluetoothState = $state({
  connectionState: 'disconnected',
  deviceName: 'unknown device name'
});

// Setup event handlers once to update reactive state properties
if (!G.__wavy_bt_handlers_attached) {
  G.__wavy_bt_handlers_attached = true;
  bluetoothManager.onConnect(() => {
    bluetoothState.connectionState = 'connected';
    bluetoothState.deviceName = bluetoothManager.name || 'unknown device name';
  });
  bluetoothManager.onConnecting(() => {
    bluetoothState.connectionState = 'connecting';
  });
  bluetoothManager.onDisconnect(() => {
    // bluetoothState.connectionState = 'disconnected';
    window.location.reload();
  });
  bluetoothManager.onConnectionLoss(() => {
    bluetoothState.connectionState = 'connectionLoss';
  });
  bluetoothManager.onConnectionReestablished(() => {
    bluetoothState.connectionState = 'connected';
  });
}
