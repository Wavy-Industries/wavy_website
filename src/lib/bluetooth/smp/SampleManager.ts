import { SMPService, MGMT_OP, MGMT_ERR, ResponseError } from '~/lib/bluetooth/SMPService';
import { Log } from '~/lib/utils/Log';
import { samplesParser_encode, DeviceSamples, samplesParser_decode, decodeAsciiString } from '~/lib/parsers/samples_parser';

let log = new Log('smpl_mgr', Log.LEVEL_INFO);

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

interface IDResponse { ids: number[]; }
interface ISSETResponse { set: boolean; }
interface SpaceUsedResponse { tot: number; usd: number; packs: number[]; }
interface UploadRequest { len: number; off: number; data: Uint8Array; }
interface UploadResponse { off: number; }
interface DownloadRequest { off: number; }
interface DownloadResponse { len?: number; off: number; data: Uint8Array; }

export class SampleManager {
    private readonly GROUP_ID = 100;
    private state: _STATE = _STATE.IDLE;
    private uploadWaiters: Array<() => void> = [];
    private smpBluetoothCharacteristic: SMPService;

    constructor(smpBluetoothCharacteristic: SMPService) {
        this.smpBluetoothCharacteristic = smpBluetoothCharacteristic;
        this.state = _STATE.IDLE; 
    }

    public resetState() {
        log.debug('Manual reset: Forcing state to IDLE');
        this.state = _STATE.IDLE;
        this._notifyUploadFinished();
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
        const response = await this.smpBluetoothCharacteristic.sendMessage(MGMT_OP.READ, this.GROUP_ID, _MGMT_ID.ISSET) as ISSETResponse | ResponseError;
        if ((response as ResponseError).rc !== undefined && (response as ResponseError).rc !== MGMT_ERR.EOK) {
            return Promise.reject((response as ResponseError).rc);
        }
        return (response as ISSETResponse).set;
    }

    /**
     * Required for samples.svelte storage visualization
     */
    async getSpaceUsed(): Promise<SpaceUsedResponse> {
        const response = await this.smpBluetoothCharacteristic.sendMessage(MGMT_OP.READ, this.GROUP_ID, _MGMT_ID.SPACE_USED) as SpaceUsedResponse | ResponseError;
        if ((response as ResponseError).rc !== undefined && (response as ResponseError).rc !== MGMT_ERR.EOK) {
            throw new Error(`SpaceUsed error rc: ${(response as ResponseError).rc}`);
        }
        return response as SpaceUsedResponse;
    }

    async getIDs(): Promise<string[]> {
        const response = await this.smpBluetoothCharacteristic.sendMessage(MGMT_OP.READ, this.GROUP_ID, _MGMT_ID.IDs) as IDResponse | ResponseError;
        if ((response as ResponseError).rc !== undefined && (response as ResponseError).rc !== MGMT_ERR.EOK) {
            return Promise.reject((response as ResponseError).rc);
        }
        const ids = (response as IDResponse).ids;
        const result: (string | null)[] = [];
        for (let i = 0; i < ids.length; i += 2) {
            const low32 = ids[i];
            const high32 = ids[i + 1];
            if (low32 === 0xFFFFFFFF && high32 === 0xFFFFFFFF) {
                result.push(null);
            } else {
                const idBytes = new Uint8Array(8);
                new DataView(idBytes.buffer).setUint32(0, low32, true);
                new DataView(idBytes.buffer).setUint32(4, high32, true);
                result.push(decodeAsciiString(idBytes));
            }
        }
        return result as string[];
    }

    async uploadSamples(image: DeviceSamples, uploadProgressUpdate?: (percent: number) => void): Promise<boolean> {
        if (this.state !== _STATE.IDLE) this.resetState();
        this.state = _STATE.UPLOADING;
        
        const samplesBlob = samplesParser_encode(image);
        const totalLength = samplesBlob.byteLength;
        let offset = 0;
        
        try {
            while (this.state === _STATE.UPLOADING && offset < totalLength) {
                const CHUNK_SIZE = 128; // Safer chunk for Windows BLE stack
                const dataEnd = Math.min(offset + CHUNK_SIZE, totalLength);
                const chunkData = samplesBlob.slice(offset, dataEnd);

                let payloadEncoded = this._payloadUploadEncode({ off: offset, data: chunkData, len: totalLength });

                const response = await Promise.race([
                    this.smpBluetoothCharacteristic.sendMessage(MGMT_OP.WRITE, this.GROUP_ID, _MGMT_ID.UPLOAD, payloadEncoded),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 8000))
                ]) as UploadResponse | ResponseError;

                if ((response as ResponseError).rc !== undefined && (response as ResponseError).rc !== MGMT_ERR.EOK) {
                    throw new Error(`Upload error rc: ${(response as ResponseError).rc}`);
                }

                offset = (response as UploadResponse).off;
                uploadProgressUpdate?.(Math.floor((offset / totalLength) * 100));

                await new Promise(r => setTimeout(r, 40)); // Breather for Windows
            }
            return true;
        } catch (error) {
            log.error(`uplaodDeviceSamples failed: ${error}`);
            return false;
        } finally {
            this.state = _STATE.IDLE;
            this._notifyUploadFinished();
        }
    }

    async downloadSamples(uploadProgressUpdate?: (percent: number) => void): Promise<DeviceSamples | null> {
        if (this.state !== _STATE.IDLE) this.resetState();
        this.state = _STATE.DOWNLOADING;

        let chunks: Uint8Array[] = [];
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

                chunks.push(success.data);
                offset = success.off + success.data.byteLength;
                uploadProgressUpdate?.(Math.floor((offset / total_length) * 100));

                if (offset >= total_length) break;
                await new Promise(r => setTimeout(r, 20));
            }

            const finalBuffer = new Uint8Array(total_length);
            let currentPos = 0;
            for (const chunk of chunks) {
                finalBuffer.set(chunk, currentPos);
                currentPos += chunk.length;
            }

            return samplesParser_decode(finalBuffer);
        } catch (error) {
            log.error(`Download failed: ${error}`);
            return null;
        } finally {
            this.state = _STATE.IDLE;
        }
    }

    private _payloadUploadEncode(payload: UploadRequest): Uint8Array {
        const buf = new Uint8Array(8 + payload.data.byteLength);
        const view = new DataView(buf.buffer);
        view.setUint32(0, payload.len, true);
        view.setUint32(4, payload.off, true);
        buf.set(payload.data, 8);
        return buf;
    }

    private _payloadDownloadEncode(payload: DownloadRequest): Uint8Array {
        const buf = new Uint8Array(4);
        new DataView(buf.buffer).setUint32(0, payload.off, true);
        return buf;
    }
}
