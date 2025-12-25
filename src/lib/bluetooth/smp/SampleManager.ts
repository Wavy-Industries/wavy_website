import { SMPService, MGMT_OP, MGMT_ERR, ResponseError } from '~/lib/bluetooth/SMPService';
import { Log } from '~/lib/utils/Log';
import { samplesParser_encode, DeviceSamples, samplesParser_decode, decodeAsciiString } from '~/lib/parsers/samples_parser';

let log = new Log('smpl_mgr', Log.LEVEL_INFO);

// Enums for better type safety
enum _MGMT_ID {
    IDs = 0,
    UPLOAD = 1,
    ISSET = 2,
    SPACE_USED = 3,
}

enum _STATE {
    IDLE,
    UPLOADING,
    DOWNLOADING,
}

interface IDResponse {
    ids: number[];
}

interface ISSETResponse {
    set: boolean;
}

interface SpaceUsedResponse {
    tot: number; // total
    usd: number; // storage used
    packs: number[];
}

interface UploadRequest {
    len: number; // length of all samples
    off: number; // offset of image chunk the request carries
    data: Uint8Array; // image data to write at provided offset
}

interface UploadResponse {
    off: number; // Offset of last successfully written byte of update
}

interface DownloadRequest {
    off: number;
}

interface DownloadResponse {
    len?: number;
    off: number;
    data: Uint8Array;
}

export class SampleManager {
    private readonly GROUP_ID = 100;
    private state: _STATE = _STATE.IDLE;
    private uploadWaiters: Array<() => void> = [];
    private smpBluetoothCharacteristic: SMPService;

    constructor(smpBluetoothCharacteristic: SMPService) {
        this.smpBluetoothCharacteristic = smpBluetoothCharacteristic;
    }

    isUploading(): boolean {
        return this.state === _STATE.UPLOADING;
    }

    async waitForUploadToFinish(): Promise<void> {
        if (this.state !== _STATE.UPLOADING) return;
        return new Promise<void>((resolve) => this.uploadWaiters.push(resolve));
    }

    private _notifyUploadFinished() {
        const waiters = this.uploadWaiters;
        this.uploadWaiters = [];
        waiters.forEach((resolve) => {
            try { resolve(); } catch {}
        });
    }

    async isSet(): Promise<boolean> {
        log.debug('Checking if any samples are set');
        const response = await this.smpBluetoothCharacteristic.sendMessage(MGMT_OP.READ, this.GROUP_ID, _MGMT_ID.ISSET) as ISSETResponse | ResponseError;
        if ((response as ResponseError).rc !== undefined && (response as ResponseError).rc !== MGMT_ERR.EOK) {
            log.error(`Error response received, rc: ${(response as ResponseError).rc}`);
            return Promise.reject((response as ResponseError).rc);
        }
        const responseSuccess = response as ISSETResponse;
        return responseSuccess.set;
    }

    async getIDs(): Promise<string[]> {
        log.debug('Getting sample ID');
        const response = await this.smpBluetoothCharacteristic.sendMessage(MGMT_OP.READ, this.GROUP_ID, _MGMT_ID.IDs) as IDResponse | ResponseError;
        if ((response as ResponseError).rc !== undefined && (response as ResponseError).rc !== MGMT_ERR.EOK) {
            log.error(`Error response received, rc: ${(response as ResponseError).rc}`);
            return Promise.reject((response as ResponseError).rc);
        }
        const responseSuccess = response as IDResponse;
        log.debug(`Received sample IDs: ${responseSuccess.ids}`);
        // Convert 32-bit values to 64-bit ID as byte array
        const ids = responseSuccess.ids as number[];
        if (ids.length % 2 !== 0) {
            throw new Error('ID array length must be even (pairs of 32-bit values)');
        }
        
        const result: string[] = [];
        for (let i = 0; i < ids.length; i += 2) {
            const low32 = ids[i];
            const high32 = ids[i + 1];
                        
            if (low32 === 0xFFFFFFFF && high32 === 0xFFFFFFFF) {
                result.push(null);
            } else {
                // Create 8-byte array from two 32-bit values
                const idBytes = new Uint8Array(8);
                // Low 32 bits (little endian)
                idBytes[0] = low32 & 0xFF;
                idBytes[1] = (low32 >> 8) & 0xFF;
                idBytes[2] = (low32 >> 16) & 0xFF;
                idBytes[3] = (low32 >> 24) & 0xFF;
                // High 32 bits (little endian)
                idBytes[4] = high32 & 0xFF;
                idBytes[5] = (high32 >> 8) & 0xFF;
                idBytes[6] = (high32 >> 16) & 0xFF;
                idBytes[7] = (high32 >> 24) & 0xFF;

                result.push(decodeAsciiString(idBytes));
            }
        }
        
        return result;
    }

    async getSpaceUsed(): Promise<SpaceUsedResponse> {
        log.debug('Getting space used');
        const response = await this.smpBluetoothCharacteristic.sendMessage(MGMT_OP.READ, this.GROUP_ID, _MGMT_ID.SPACE_USED) as SpaceUsedResponse | ResponseError;
        if ((response as ResponseError).rc !== undefined && (response as ResponseError).rc !== MGMT_ERR.EOK) {
            log.error(`Error response received, rc: ${(response as ResponseError).rc}`);
            return Promise.reject((response as ResponseError).rc);
        }
        const ok = response as SpaceUsedResponse;
        log.debug(`Received storage, total: ${ok.tot}, used: ${ok.usd}`);
        return ok;
    }

    // Start the image upload process
async uploadSamples(image: DeviceSamples, uploadProgressUpdate?: (percent: number) => void): Promise<boolean> {
        log.debug('Starting sample uplaod process');
        if (this.state !== _STATE.IDLE) return Promise.reject('Manager not idle');

        this.state = _STATE.UPLOADING;
        const maxPayloadSize = this.smpBluetoothCharacteristic.maxPayloadSize;
        const samplesBlob = samplesParser_encode(image);
        const totalLength = samplesBlob.byteLength;
        let offset = 0;
        
        try {
            while (this.state === _STATE.UPLOADING && offset < totalLength) {
                let payload: UploadRequest = { off: offset, data: new Uint8Array([]), len: totalLength };
                let payloadEncoded = this._payloadUploadEncode(payload);

                // Windows Fix: Increased padding to 32 bytes to ensure headers never exceed MTU
                const maxDataSize = maxPayloadSize - payloadEncoded.byteLength - 32;

                if (maxDataSize <= 0) throw new Error('MTU too small');

                const dataEnd = Math.min(offset + maxDataSize, totalLength);
                payload.data = new Uint8Array(samplesBlob.slice(offset, dataEnd));
                payloadEncoded = this._payloadUploadEncode(payload);

                const response = await this.smpBluetoothCharacteristic.sendMessage(MGMT_OP.WRITE, this.GROUP_ID, _MGMT_ID.UPLOAD, payloadEncoded) as UploadResponse | ResponseError;

                if ((response as ResponseError).rc !== undefined && (response as ResponseError).rc !== MGMT_ERR.EOK) {
                    throw new Error(`Upload error rc: ${(response as ResponseError).rc}`);
                }

                offset = (response as UploadResponse).off;
                uploadProgressUpdate?.(Math.floor((offset / totalLength) * 100));

                // Windows Fix: 15ms delay to allow the Bluetooth stack to flush the chunk
                await new Promise(r => setTimeout(r, 15));
            }
            return true;
        } catch (error) {
            log.error(`uplaod failed: ${error}`);
            return false;
        } finally {
            this.state = _STATE.IDLE;
            this._notifyUploadFinished();
        }
    }

     async downloadSamples(uploadProgressUpdate?: (percent: number) => void): Promise<DeviceSamples | null> {
        if (this.state !== _STATE.IDLE) return Promise.reject('Manager not idle');
        this.state = _STATE.DOWNLOADING;

        let data_raw = new Uint8Array([]);
        let offset = 0;
        let total_length: number = 0;

        try {
            while (this.state === _STATE.DOWNLOADING) {
                let payloadEncoded = this._payloadDownloadEncode({ off: offset });
                const response = await this.smpBluetoothCharacteristic.sendMessage(MGMT_OP.READ, this.GROUP_ID, _MGMT_ID.UPLOAD, payloadEncoded) as DownloadResponse | ResponseError;
                
                if ((response as ResponseError).rc !== undefined && (response as ResponseError).rc !== MGMT_ERR.EOK) throw new Error('Download RC error');

                const success = response as DownloadResponse;
                if (offset === 0) {
                    if (success.len === undefined) throw new Error('No length');
                    total_length = success.len;
                }

                data_raw = new Uint8Array([...data_raw, ...success.data]);
                offset = success.off + success.data.byteLength;
                uploadProgressUpdate?.(Math.floor((offset / total_length) * 100));

                if (offset >= total_length) break;

                // Windows Fix: 10ms delay between reads to prevent stack congestion
                await new Promise(r => setTimeout(r, 10));
            }
            return samplesParser_decode(data_raw);
        } catch (error) {
            log.error(`Download failed: ${error}`);
            return null;
        } finally {
            this.state = _STATE.IDLE;
        }
    }

    private _payloadUploadEncode(payload: UploadRequest): Uint8Array {
        log.debug(`Encoding payload: len=${payload.len}, off=${payload.off}, data=${payload.data.byteLength} bytes`);
        // format: <len: uint32><off: uint32><data: uint8[]>
        const len0 = payload.len & 0xFF;
        const len1 = (payload.len >> 8) & 0xFF;
        const len2 = (payload.len >> 16) & 0xFF;
        const len3 = (payload.len >> 24) & 0xFF;
        const off0 = payload.off & 0xFF;
        const off1 = (payload.off >> 8) & 0xFF;
        const off2 = (payload.off >> 16) & 0xFF;
        const off3 = (payload.off >> 24) & 0xFF;
        const encoded = new Uint8Array([len0, len1, len2, len3, off0, off1, off2, off3, ...payload.data]);
        return encoded;
    }

    private _payloadDownloadEncode(payload: DownloadRequest): Uint8Array {
        log.debug(`Encoding payload: off=${payload.off}`);
        // format: <off: uint32>
        const off0 = payload.off & 0xFF;
        const off1 = (payload.off >> 8) & 0xFF;
        const off2 = (payload.off >> 16) & 0xFF;
        const off3 = (payload.off >> 24) & 0xFF;
        const encoded = new Uint8Array([off0, off1, off2, off3]);
        return encoded;
    }
}
