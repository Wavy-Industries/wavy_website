import { BatteryService } from '~/lib/bluetooth/BASService';
import { bluetoothManager } from '~/lib/states/bluetooth.svelte';

export const batteryService = new BatteryService(bluetoothManager);

export const batteryState = $state({
  level: null as (number | null),
  isAvailable: false,
});

export const resetBatteryState = () => {
  batteryService.reset();
  batteryService.onBatteryLevel = null;
  batteryState.level = null;
  batteryState.isAvailable = false;
};

export const initializeBatteryState = async (): Promise<void> => {
  batteryService.onBatteryLevel = (level) => { batteryState.level = level; };
  const available = await batteryService.initialize();
  batteryState.isAvailable = available;
  if (available) void batteryService.getBatteryLevel();
};
