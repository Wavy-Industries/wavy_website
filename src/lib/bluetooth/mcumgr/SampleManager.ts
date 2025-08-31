import { SMPCharacteristic, MGMT_OP, MGMT_ERR, ResponseError } from '../SMPCharacteristic';
import { Log } from '../../utilities';
import { samplesParser_encode, type SamplePack, samplesParser_decode, decodeAsciiString } from '../../parsers/samples_parser';
import CBOR from './cbor';

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
    private mcumgr: SMPCharacteristic;

    constructor(mcumgr: SMPCharacteristic) { this.mcumgr = mcumgr; }
    isUploading(): boolean { return this.state === _STATE.UPLOADING; }
    async waitForUploadToFinish(): Promise<void> { if (this.state !== _STATE.UPLOADING) return; return new Promise<void>((resolve) => this.uploadWaiters.push(resolve)); }
    private _notifyUploadFinished() { const waiters = this.uploadWaiters; this.uploadWaiters = []; waiters.forEach((resolve) => { try { resolve(); } catch {} }); }

    async isSet(): Promise<boolean> {
        log.debug('Checking if any samples are set');
        const response = await this.mcumgr.sendMessage(MGMT_OP.READ, this.GROUP_ID, _MGMT_ID.ISSET) as ISSETResponse | ResponseError;
        if ((response as ResponseError).rc !== undefined && (response as ResponseError).rc !== MGMT_ERR.EOK) { log.error(`Error response received, rc: ${(response as ResponseError).rc}`); return Promise.reject((response as ResponseError).rc); }
        const responseSuccess = response as ISSETResponse;
        return responseSuccess.set;
    }

    async getIDs(): Promise<string[]> {
        log.debug('Getting sample ID');
        const response = await this.mcumgr.sendMessage(MGMT_OP.READ, this.GROUP_ID, _MGMT_ID.IDs) as IDResponse | ResponseError;
        if ((response as ResponseError).rc !== undefined && (response as ResponseError).rc !== MGMT_ERR.EOK) { log.error(`Error response received, rc: ${(response as ResponseError).rc}`); return Promise.reject((response as ResponseError).rc); }
        const responseSuccess = response as IDResponse;
        const ids = responseSuccess.ids as number[];
        if (ids.length % 2 !== 0) { throw new Error('ID array length must be even (pairs of 32-bit values)'); }
        const result: string[] = [];
        for (let i = 0; i < ids.length; i += 2) {
            const low32 = ids[i]; const high32 = ids[i + 1];
            if (low32 === 0xFFFFFFFF && high32 === 0xFFFFFFFF) { result.push(null as any); }
            else {
                const idBytes = new Uint8Array(8);
                idBytes[0] = low32 & 0xFF; idBytes[1] = (low32 >> 8) & 0xFF; idBytes[2] = (low32 >> 16) & 0xFF; idBytes[3] = (low32 >> 24) & 0xFF;
                idBytes[4] = high32 & 0xFF; idBytes[5] = (high32 >> 8) & 0xFF; idBytes[6] = (high32 >> 16) & 0xFF; idBytes[7] = (high32 >> 24) & 0xFF;
                const s = decodeAsciiString(idBytes);
                result.push(s);
            }
        }
        return result;
    }

    async getSpaceUsed(): Promise<SpaceUsedResponse> {
        const response = await this.mcumgr.sendMessage(MGMT_OP.READ, this.GROUP_ID, _MGMT_ID.SPACE_USED) as SpaceUsedResponse | ResponseError;
        if ((response as ResponseError).rc !== undefined && (response as ResponseError).rc !== MGMT_ERR.EOK) { return Promise.reject((response as ResponseError).rc); }
        return response as SpaceUsedResponse;
    }

    async uploadSamples(pack: SamplePack, onProgress?: (percent: number) => void): Promise<boolean> {
        if (this.state !== _STATE.IDLE) return false;
        this.state = _STATE.UPLOADING;
        try {
            const encoded = samplesParser_encode(pack);
            const total = encoded.byteLength;
            let off = 0;
            while (off < total) {
                const maxPayload = this.mcumgr.maxPayloadSize;
                const chunkSize = Math.max(0, Math.min(maxPayload - 32, total - off));
                const payload: UploadRequest = { len: total, off, data: encoded.slice(off, off + chunkSize) } as any;
                const res = await this.mcumgr.sendMessage(MGMT_OP.WRITE, this.GROUP_ID, _MGMT_ID.UPLOAD, new Uint8Array((CBOR as any).encode(payload))) as UploadResponse | ResponseError;
                if ((res as ResponseError).rc !== undefined && (res as ResponseError).rc !== MGMT_ERR.EOK) return false;
                off = (res as UploadResponse).off;
                if (onProgress) onProgress(Math.floor((off / total) * 100));
            }
            return true;
        } finally {
            this.state = _STATE.IDLE;
            this._notifyUploadFinished();
        }
    }
}

