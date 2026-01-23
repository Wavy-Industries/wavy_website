// bluetoothManager shared state for app-wide use
import { BluetoothManager } from '~/lib/bluetooth/bluetoothManager';
import { DeviceStateService } from '~/lib/bluetooth/DeviceStateService';
import { DeviceInformationService } from '~/lib/bluetooth/DISService';
import { MIDIService } from '~/lib/bluetooth/MIDIService';
import { SMPService } from '~/lib/bluetooth/SMPService';

export const bluetoothManager: BluetoothManager = new BluetoothManager();
export const deviceStateService = new DeviceStateService(bluetoothManager);
export const disService = new DeviceInformationService(bluetoothManager);
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
  bluetoothState.deviceName = bluetoothManager.name || 'unknown device name';
}

/** Check if device is connected. Shows alert and returns false if not connected. */
export function requireDeviceConnection(): boolean {
  if (bluetoothState.connectionState !== 'connected') {
    alert('Device not connected. Please reconnect first.');
    return false;
  }
  return true;
}
