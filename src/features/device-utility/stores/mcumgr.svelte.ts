import { SMPCharacteristic } from '~/lib/bluetooth/SMPCharacteristic';
import { bluetoothManager } from './bluetooth.svelte';

export const mcumgr = new SMPCharacteristic(bluetoothManager);
