import { BT_MIDI_SERVICE_UUID } from '~/lib/bluetooth/MIDIService';

// Bluetooth connection filters for WAVY devices
export const BT_DEVICE_FILTERS: BluetoothLEScanFilter[] = [
    { namePrefix: 'WAVY', services: [BT_MIDI_SERVICE_UUID] }
];
