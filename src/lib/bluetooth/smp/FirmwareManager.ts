import { SMPService, MGMT_OP, MGMT_ERR } from '../SMPService';
import { Log } from '../../utils/Log';
import CBOR from './cbor';

let log = new Log('img_mgr', Log.LEVEL_INFO);

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
    log.info("starting image upload")
    if (this.state === IMG_STATE.UPLOADING) {
      log.warning("already uploading")
      return false;
    }
    this.state = IMG_STATE.UPLOADING;
    let offset = 0;
    const totalLength = image.byteLength;
    try {
      const hash = new Uint8Array(await imageHash(image));
      const maxPayloadSize = this.smpBluetoothCharacteristic.maxPayloadSize;
      log.info("upload loop start, maxPayloadSize:", maxPayloadSize, "totalLength:", totalLength);
      while (offset < totalLength) {
        let payload: any = { off: offset, data: new Uint8Array([]) };
        if (offset === 0) { payload.len = totalLength; payload.sha = hash; }

        // Estimate initial overhead with empty data, then iteratively shrink to fit
        log.debug("encoding header")
        const emptyEncoded = CBOR.encode(payload);
        let dataSize = maxPayloadSize - emptyEncoded.byteLength;
        if (dataSize <= 0) { 
          log.error("no available space for the payload. Missing", dataSize, "bytes")
          this.state = IMG_STATE.IDLE; return false;
        }

        log.debug("encoding payload")
        let encodedPayload: ArrayBuffer;
        // Iteratively reduce data size until encoded payload fits (handles CBOR length prefix variance)
        while (dataSize > 0) {
          const dataEnd = Math.min(offset + dataSize, totalLength);
          payload.data = new Uint8Array(image.slice(offset, dataEnd));
          encodedPayload = CBOR.encode(payload);
          if (encodedPayload.byteLength <= maxPayloadSize) break;
          dataSize--; // Shrink by 1 byte and retry
        }
        if (dataSize <= 0) { 
          log.error("failed to shrink payload to available space")
          this.state = IMG_STATE.IDLE; return false;
        }

        log.debug("encoded payload size:", encodedPayload!.byteLength, "max:", maxPayloadSize);
        const response = await this.smpBluetoothCharacteristic.sendMessage(MGMT_OP.WRITE, this.IMAGE_GROUP_ID, IMG_MGMT_ID.UPLOAD, new Uint8Array(encodedPayload!)) as any;
        if (response.rc !== undefined && response.rc !== MGMT_ERR.EOK) {
          log.error("device returned error code:", response.rc, response);
          this.state = IMG_STATE.IDLE;
          return false;
        }
        const { off } = response as any;
        offset = off;
        uploadProgressUpdate?.(Math.floor((offset / totalLength) * 100));
      }
      this.state = IMG_STATE.IDLE; return true;
    } catch (e) {
      log.error("upload failed:", e);
      this.state = IMG_STATE.IDLE;
      return false;
    }
  }

  async getFirmwareVersion(): Promise<FirmwareVersion | null> {
    try {
      const response = await this.smpBluetoothCharacteristic.sendMessage(MGMT_OP.READ, this.IMAGE_GROUP_ID, IMG_MGMT_ID.STATE) as any;
      if (!response.images?.length) { log.warning('No images in response, no support'); return null; }
      const activeImage = response.images.find((i: any) => i.active);
      if (!activeImage) { log.error('No active image found'); return null; }
      const [major, minor, revision] = activeImage.version.split('.').map(Number);
      return { versionString: activeImage.version, major, minor, revision };
    } catch (e) { log.error(`Error getting firmware version: ${e}`); return null; }
}
}
export { FirmwareManager };

