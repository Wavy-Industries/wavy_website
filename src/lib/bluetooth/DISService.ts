// DeviceInformationService.ts
import { BluetoothManager } from './bluetoothManager';
import { Log } from '../utils/Log';

let log = new Log('dis_service', Log.LEVEL_INFO);

export class DeviceInformationService {
  private readonly DIS_SERVICE_UUID = '0000180a-0000-1000-8000-00805f9b34fb';
  private readonly CH = {
    manufacturerName: '00002a29-0000-1000-8000-00805f9b34fb',
    modelNumber:      '00002a24-0000-1000-8000-00805f9b34fb',
    hardwareRev:      '00002a27-0000-1000-8000-00805f9b34fb',
    firmwareRev:      '00002a26-0000-1000-8000-00805f9b34fb',
  } as const;

  private initPromise: Promise<boolean> | null = null;
  private cache: Partial<Record<keyof typeof this.CH, string | null>> = {};
  private inflight: Partial<Record<keyof typeof this.CH, Promise<string | null>>> = {};

  private bluetoothManager: BluetoothManager;

  public constructor(bluetoothManager: BluetoothManager) {
    this.bluetoothManager = bluetoothManager;
  }

  public reset(): void {
    this.initPromise = null;
    this.cache = {};
    this.inflight = {};
  }

  public async initialize(): Promise<boolean> {
    // Deduplicate concurrent calls - return existing promise if initialization is in progress
    if (this.initPromise) return this.initPromise;
    // Touch one char to ensure the service is reachable
    this.initPromise = (async () => {
      try {
        const key = await this.bluetoothManager.getCharacteristicKey(this.DIS_SERVICE_UUID, this.CH.modelNumber);
        if (!key) {
          log.warning('Device does not support Device Information Service');
          return false;
        }
        return true;
      } catch (error) {
        log.warning('Device does not support Device Information Service:', error);
        return false;
      } finally {
        this.initPromise = null;
      }
    })();
    return this.initPromise;
  }

  // ---- Cached getters ----
  public async getManufacturerName(): Promise<string | null> { return this.readString('manufacturerName'); }
  public async getModelNumber(): Promise<string | null>      { return this.readString('modelNumber'); }
  public async getHardwareRevision(): Promise<string | null> { return this.readString('hardwareRev'); }
  public async getFirmwareRevision(): Promise<string | null> { return this.readString('firmwareRev'); }

  // Convenience: read everything that exists, using cache
  public async readAll(): Promise<Partial<{
    manufacturerName: string;
    modelNumber: string;
    hardwareRevision: string;
    firmwareRevision: string;
  }>> {
    const [
      manufacturerName, modelNumber,
      hardwareRevision, firmwareRevision,
    ] = await Promise.all([
      this.getManufacturerName(),
      this.getModelNumber(),
      this.getHardwareRevision(),
      this.getFirmwareRevision(),
    ]);

    const out: Record<string, string> = {};
    if (manufacturerName) out.manufacturerName = manufacturerName;
    if (modelNumber)      out.modelNumber = modelNumber;
    if (hardwareRevision) out.hardwareRevision = hardwareRevision;
    if (firmwareRevision) out.firmwareRevision = firmwareRevision;
    return out;
  }

  // ---- Internals with caching & de-duping ----
  private async readString<K extends keyof typeof this.CH>(key: K): Promise<string | null> {
    // Return cached value if present (including null meaning "missing on device")
    if (key in this.cache) return this.cache[key] ?? null;

    // If a read is already in-flight for this key, await it
    if (this.inflight[key]) return this.inflight[key]!;

    const p = (async (): Promise<string | null> => {
      if (!(await this.initialize())) return null;

      const charUuid = this.CH[key];
      const charKey = await this.bluetoothManager.getCharacteristicKey(this.DIS_SERVICE_UUID, charUuid);
      if (!charKey) return null;

      const view = await this.bluetoothManager.readCharacteristicValue(charKey);
      if (!view) return null;

      const u8 = new Uint8Array(view.buffer);
      // Trim trailing NULs some devices append
      let end = u8.length; while (end > 0 && u8[end - 1] === 0) end--;
      return new TextDecoder('utf-8').decode(u8.subarray(0, end));
    })();

    this.inflight[key] = p;

    try {
      const value = await p;
      this.cache[key] = value ?? null; // store result (including null)
      return value ?? null;
    } finally {
      delete this.inflight[key];
    }
  }
}
