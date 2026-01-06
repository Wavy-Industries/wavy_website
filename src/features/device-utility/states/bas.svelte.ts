import { BatteryService } from '~/lib/bluetooth/BASService';
import { bluetoothManager } from '~/lib/states/bluetooth.svelte';

export const batteryService = new BatteryService(bluetoothManager);

export const batteryState = $state({
  level: null as (number | null)
});

export const resetBatteryState = () => {
  batteryService.reset();
  batteryService.onBatteryLevel = null;
  batteryState.level = null;
};

export const initializeBatteryState = async (): Promise<void> => {
  batteryService.onBatteryLevel = (level) => { batteryState.level = level; };
  await batteryService.initialize();
  void batteryService.getBatteryLevel();
};
