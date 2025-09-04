import { SMPService, MGMT_OP, MGMT_ERR } from '../SMPService';
import { Log } from '../../utils/Log';
import CBOR from './cbor';

let log = new Log('img_mgr', Log.LEVEL_WARNING);

enum IMG_MGMT_ID { STATE = 0, UPLOAD = 1, FILE = 2, CORELIST = 3, CORELOAD = 4, ERASE = 5 }
enum IMG_STATE_TRANSITION { START_UPLOAD = 0, UPLOAD_COMPLETE = 1, UPLOAD_ERROR = 2 }
enum IMG_STATE { IDLE = 0, UPLOADING = 1 }

export interface FirmwareVersion { versionString: string; major: Number; minor: Number; revision: Number }

export const firmwareRhsIsNewer = (lhs: FirmwareVersion, rhs: FirmwareVersion): boolean => {
  if (rhs.major > lhs.major) return true;
  if (rhs.major === lhs.major) {
    if (rhs.minor > lhs.minor) return true;
    if (rhs.minor === lhs.minor) return rhs.revision > lhs.revision;
  }
  return false;
};

const imageHash = (image: ArrayBuffer) => crypto.subtle.digest('SHA-256', image);

class FirmwareManager {
  private readonly IMAGE_GROUP_ID = 1;
  private state: IMG_STATE = IMG_STATE.IDLE;
  constructor(private smpBluetoothCharacteristic: SMPService) {}

  async uploadImage(image: ArrayBuffer, uploadProgressUpdate?: (percent: number) => void): Promise<boolean> {
    if (this.state === IMG_STATE.UPLOADING) return false;
    this.state = IMG_STATE.UPLOADING;
    let offset = 0;
    const totalLength = image.byteLength;
    try {
      const hash = new Uint8Array(await imageHash(image));
      const maxPayloadSize = this.smpBluetoothCharacteristic.maxPayloadSize;
      while (offset < totalLength) {
        let payload: any = { off: offset, data: new Uint8Array([]) };
        if (offset === 0) { payload.len = totalLength; payload.sha = hash; }
        let encodedPayload = CBOR.encode(payload);
        const initialPayloadLength = encodedPayload.byteLength;
        const maxDataSize = maxPayloadSize - initialPayloadLength - 20;
        if (maxDataSize <= 0) { this.state = IMG_STATE.IDLE; return false; }
        const dataEnd = Math.min(offset + maxDataSize, totalLength);
        payload.data = new Uint8Array(image.slice(offset, dataEnd));
        encodedPayload = CBOR.encode(payload);
        const response = await this.smpBluetoothCharacteristic.sendMessage(MGMT_OP.WRITE, this.IMAGE_GROUP_ID, IMG_MGMT_ID.UPLOAD, new Uint8Array(encodedPayload)) as any;
        if (response.rc !== undefined && response.rc !== MGMT_ERR.EOK) { this.state = IMG_STATE.IDLE; return false; }
        const { off } = response as any;
        offset = off;
        uploadProgressUpdate?.(Math.floor((offset / totalLength) * 100));
      }
      this.state = IMG_STATE.IDLE; return true;
    } catch (e) { this.state = IMG_STATE.IDLE; return false; }
  }

  async getFirmwareVersion(): Promise<FirmwareVersion | null> {
    try {
      const response = await this.smpBluetoothCharacteristic.sendMessage(MGMT_OP.READ, this.IMAGE_GROUP_ID, IMG_MGMT_ID.STATE) as any;
      if (!response.images?.length) { log.error('No images in response'); return null; }
      const activeImage = response.images.find((i: any) => i.active);
      if (!activeImage) { log.error('No active image found'); return null; }
      const [major, minor, revision] = activeImage.version.split('.').map(Number);
      return { versionString: activeImage.version, major, minor, revision };
    } catch (e) { log.error(`Error getting firmware version: ${e}`); return null; }
}
}
export { FirmwareManager };

