import { bluetoothManager, bluetoothStateSetConnected, bluetoothStateSetConnecting, bluetoothStateSetDisconnected, bluetoothStateSetConnectionLoss, bluetoothStateSetConnectionReestablished, smpService } from '~/lib/states/bluetooth.svelte';
import { refreshChangelog, refreshDeviceFirmwareVersion } from '~/lib/states/firmware.svelte';
import { updaterNotifyConnectionReestablished } from '~/lib/states/updater.svelte';

export const callbacksSet = () => {
  bluetoothManager.onConnect = () => {
    smpService.reset();
    refreshDeviceFirmwareVersion();
    refreshChangelog();
    bluetoothStateSetConnected();
  };

  bluetoothManager.onConnectionReestablished = () => {
    smpService.reset();
    refreshDeviceFirmwareVersion();
    updaterNotifyConnectionReestablished();
    bluetoothStateSetConnectionReestablished();
  };

  bluetoothManager.onConnecting = () => { bluetoothStateSetConnecting(); };
  bluetoothManager.onDisconnect = () => { bluetoothStateSetDisconnected(); };
  bluetoothManager.onConnectionLoss = () => { bluetoothStateSetConnectionLoss(); };
}
