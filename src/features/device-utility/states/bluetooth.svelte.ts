// bluetoothManager.svelte.js
import { BluetoothManager } from '~/lib/bluetooth/bluetoothManager';
import { MIDIService } from '~/lib/bluetooth/MIDIService';
import { SMPService } from '~/lib/bluetooth/SMPService';

export const bluetoothManager: BluetoothManager = new BluetoothManager();
export const smpService = new SMPService(bluetoothManager);
export const midiService = new MIDIService(bluetoothManager);

// Reactive state object
export const bluetoothState = $state({
  connectionState: 'disconnected',
  deviceName: 'unknown device name'
});

export const bluetoothStateSetConnected = () => {
  bluetoothState.connectionState = 'connected';
  bluetoothState.deviceName = bluetoothManager.name || 'unknown device name';
}

export const bluetoothStateSetConnecting = () => {
  bluetoothState.connectionState = 'connecting';
}

export const bluetoothStateSetDisconnected = () => {
  bluetoothState.connectionState = 'disconnected';
}

export const bluetoothStateSetConnectionLoss = () => {
  bluetoothState.connectionState = 'connectionLoss';
}

export const bluetoothStateSetConnectionReestablished = () => {
  bluetoothState.connectionState = 'connected';
}

