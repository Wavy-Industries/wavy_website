// bluetoothManager shared state for app-wide use
import { BatteryService } from '~/lib/bluetooth/BASService';
import { BluetoothManager } from '~/lib/bluetooth/bluetoothManager';
import { DeviceStateService } from '~/lib/bluetooth/DeviceStateService';
import { MIDIService } from '~/lib/bluetooth/MIDIService';
import { SMPService } from '~/lib/bluetooth/SMPService';

export const bluetoothManager: BluetoothManager = new BluetoothManager();
export const deviceStateService = new DeviceStateService(bluetoothManager);
export const smpService = new SMPService(bluetoothManager);
export const midiService = new MIDIService(bluetoothManager);
export const batteryService = new BatteryService(bluetoothManager);

// Reactive state object
export const bluetoothState = $state({
  connectionState: 'disconnected',
  deviceName: 'unknown device name'
});

export const batteryState = $state({
  level: null as (number | null)
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
