import { MCUManager, MGMT_OP, MGMT_ERR } from './mcumgr';
import { imageHash, Log } from '../utilities';
import CBOR from './cbor';

let log = new Log('img_mgr', Log.LEVEL_WARNING);

enum IMG_MGMT_ID { STATE = 0, UPLOAD = 1, FILE = 2, CORELIST = 3, CORELOAD = 4, ERASE = 5 }
enum IMG_STATE_TRANSITION { START_UPLOAD = 0, UPLOAD_COMPLETE = 1, UPLOAD_ERROR = 2 }
enum IMG_STATE { IDLE = 0, UPLOADING = 1 }

interface ImageState { image?: number; slot: number; version: string; hash?: Uint8Array; bootable?: boolean; pending?: boolean; confirmed?: boolean; active?: boolean; permanent?: boolean; }
interface ImageStateResponse { images: ImageState[]; splitStatus?: Number; }
interface ImageUploadRequest { image?: number; len?: number; off: number; sha?: Uint8Array; data: Uint8Array; upgrade?: boolean; }
interface ImageUploadSuccessResponse { off: number; match?: boolean; }
interface ImageUploadErrorResponse { rc: number; rsn?: string; }
type ImageUploadResponse = ImageUploadSuccessResponse | ImageUploadErrorResponse;

export interface ImageFirmwareVersion { versionString: string; major: Number; minor: Number; revision: Number }

export const imageRhsIsNewer = (lhs: ImageFirmwareVersion, rhs: ImageFirmwareVersion): boolean => {
  if (rhs.major > lhs.major) return true;
  if (rhs.major === lhs.major) {
    if (rhs.minor > lhs.minor) return true;
    if (rhs.minor === lhs.minor) return rhs.revision > lhs.revision;
  }
  return false;
};

class ImageManager {
  private readonly IMAGE_GROUP_ID = 1;
  private state: IMG_STATE = IMG_STATE.IDLE;
  constructor(private mcumgr: MCUManager) {}

  async uploadImage(image: ArrayBuffer, uploadProgressUpdate?: (percent: Number) => void): Promise<boolean> {
    if (this.state === IMG_STATE.UPLOADING) return false;
    this.state = IMG_STATE.UPLOADING;
    let offset = 0;
    const totalLength = image.byteLength;
    try {
      const hash = new Uint8Array(await imageHash(image));
      const maxPayloadSize = this.mcumgr.maxPayloadSize;
      while (offset < totalLength) {
        let payload: ImageUploadRequest = { off: offset, data: new Uint8Array([]) };
        if (offset === 0) { payload.len = totalLength; payload.sha = hash; }
        let encodedPayload = CBOR.encode(payload);
        const initialPayloadLength = encodedPayload.byteLength;
        const maxDataSize = maxPayloadSize - initialPayloadLength - 20;
        if (maxDataSize <= 0) { this.state = IMG_STATE.IDLE; return false; }
        const dataEnd = Math.min(offset + maxDataSize, totalLength);
        payload.data = new Uint8Array(image.slice(offset, dataEnd));
        encodedPayload = CBOR.encode(payload);
        const response = await this.mcumgr.sendMessage(MGMT_OP.WRITE, this.IMAGE_GROUP_ID, IMG_MGMT_ID.UPLOAD, new Uint8Array(encodedPayload)) as ImageUploadResponse;
        if ((response as ImageUploadErrorResponse).rc !== undefined && (response as ImageUploadErrorResponse).rc !== MGMT_ERR.EOK) { this.state = IMG_STATE.IDLE; return false; }
        const { off } = response as ImageUploadSuccessResponse;
        offset = off;
        uploadProgressUpdate?.(Math.floor((offset / totalLength) * 100));
      }
      this.state = IMG_STATE.IDLE; return true;
    } catch (e) { this.state = IMG_STATE.IDLE; return false; }
  }

  async getFirmwareVersion(): Promise<ImageFirmwareVersion> {
    const response = await this.mcumgr.sendMessage(MGMT_OP.READ, this.IMAGE_GROUP_ID, IMG_MGMT_ID.STATE) as ImageStateResponse;
    if (!response.images?.length) throw new Error('No image state found');
    const activeImage = response.images.find(i => i.active);
    if (!activeImage) throw new Error('Device does not use Image Manager');
    const [major, minor, revision] = activeImage.version.split('.').map(Number);
    return { versionString: activeImage.version, major, minor, revision };
  }
}

export { ImageManager };
