import { disService } from '~/lib/states/bluetooth.svelte';

export const disState = $state({
  manufacturerName: null as string | null,
  modelNumber: null as string | null,
  hardwareRevision: null as string | null,
  firmwareRevision: null as string | null,
});

export const loadingStatus = $state({
  message: '',
  error: null as string | null,
});

export const resetDisState = () => {
  disService.reset();
  disState.manufacturerName = null;
  disState.modelNumber = null;
  disState.hardwareRevision = null;
  disState.firmwareRevision = null;
  loadingStatus.message = '';
  loadingStatus.error = null;
};

export const refreshDisState = async (): Promise<void> => {
  const info = await disService.readAll();
  disState.manufacturerName = info.manufacturerName ?? null;
  disState.modelNumber = info.modelNumber ?? null;
  disState.hardwareRevision = info.hardwareRevision ?? null;
  disState.firmwareRevision = info.firmwareRevision ?? null;

  if (disState.modelNumber == null) {
    throw new Error('Device did not provide a model number via DIS');
  }
};
