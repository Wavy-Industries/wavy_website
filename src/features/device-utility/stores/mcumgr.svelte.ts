import { MCUManager } from '~/lib/mcumgr/mcumgr';
import { bluetoothManager } from './bluetooth.svelte';

export const mcumgr = new MCUManager(bluetoothManager);
