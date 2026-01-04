import { SamplePack } from "~/lib/parsers/samples_parser";
import { Log } from "~/lib/utils/Log";
import { SampleMode } from "~/lib/types/sampleMode";
import { packDisplayName } from "../utils/samples";

const LOG_LEVEL = Log.LEVEL_INFO
const log = new Log("samples-local", LOG_LEVEL);

const STORAGE_SAMPLES_KEY = 'wavy_local_packs';

const storageKeyForMode = (mode: SampleMode) =>
    mode === SampleMode.PAT ? `${STORAGE_SAMPLES_KEY}_pat` : STORAGE_SAMPLES_KEY;

export const samplesLocal = $state({
    mode: SampleMode.DRM,
    packs: [] as SamplePack[],
});

export const setLocalSamplesMode = (mode: SampleMode) => {
    samplesLocal.mode = mode;
    refreshLocalSamples(mode);
}

export const refreshLocalSamples = (mode: SampleMode = samplesLocal.mode) => {
    try {
        const key = storageKeyForMode(mode);
        const raw = localStorage.getItem(key);
        if (raw) {
            samplesLocal.packs = JSON.parse(raw) as SamplePack[];
        } else {
            samplesLocal.packs = [];
        }
    } catch {
        samplesLocal.packs = [];
    }
}

export const getLocalSamplePack = (packName: string, mode: SampleMode = samplesLocal.mode): SamplePack | null => {
    log.debug(`Getting local sample pack for name: ${packName}`);
    let packs = samplesLocal.packs;
    if (mode !== samplesLocal.mode) {
        try {
            const raw = localStorage.getItem(storageKeyForMode(mode));
            packs = raw ? (JSON.parse(raw) as SamplePack[]) : [];
        } catch {
            packs = [];
        }
    }
    const pack = packs.find(p => p.name === packName);
    log.debug(`Found local sample pack for name: ${packName}: ${pack ? pack.name : 'null'}`);
    // Return a deep clone to avoid reactive proxies in constructed packs
    return pack ? JSON.parse(JSON.stringify(pack)) as SamplePack : null;
}

export const newLocalSamplePack = (pack: SamplePack, mode: SampleMode = samplesLocal.mode) => {
    try {
        const display = packDisplayName(pack.name);
        if (display?.type !== 'Local' && display?.type !== 'Archive') {
            log.error("Pack is not a local pack");
            return;
        }

        const raw = localStorage.getItem(storageKeyForMode(mode));
        let packs: SamplePack[] = [];
        if (raw) {
            packs = JSON.parse(raw) as SamplePack[];
        }
        const idx = packs.findIndex(p => p.name === pack.name);
        if (idx >= 0) {
            log.error("Pack with same name already exists");
            return;
        }
        // store a plain clone to avoid reactive proxies
        const clean: SamplePack = JSON.parse(JSON.stringify(pack));
        packs.push(clean);
        localStorage.setItem(storageKeyForMode(mode), JSON.stringify(packs));
        // refresh from storage to ensure plain objects
        refreshLocalSamples(mode);
    } catch {
        log.error("Failed to save local sample pack");
    }
}

export const updateLocalSamplePack = (pack: SamplePack, prevName?: string | null, mode: SampleMode = samplesLocal.mode) => {
    try {
        const display = packDisplayName(pack.name);
        if (display?.type !== 'Local' && display?.type !== 'Archive') {
            log.error("Pack is not a local pack");
            return;
        }

        const raw = localStorage.getItem(storageKeyForMode(mode));
        let packs: SamplePack[] = [];
        if (raw) {
            packs = JSON.parse(raw) as SamplePack[];
        }
        // Find existing by previous name if provided; otherwise by current name
        let idx = -1;
        if (prevName && typeof prevName === 'string') {
            idx = packs.findIndex(p => p.name === prevName);
        }
        if (idx === -1) idx = packs.findIndex(p => p.name === pack.name);
        if (idx === -1) { log.error("Pack to update not found"); return; }
        // If name is changing, ensure no other pack already has the target name
        if (pack.name !== packs[idx].name) {
            const clash = packs.findIndex((p, i) => p.name === pack.name && i !== idx);
            if (clash !== -1) { log.error("Target name already exists"); return; }
        }
        // store a plain clone to avoid reactive proxies
        const clean: SamplePack = JSON.parse(JSON.stringify(pack));
        packs[idx] = clean;
        localStorage.setItem(storageKeyForMode(mode), JSON.stringify(packs));
        // refresh from storage to ensure plain objects
        refreshLocalSamples(mode);
    } catch {
        log.error("Failed to update local sample pack");
    }
}

export const deleteLocalSamplePack = (packName: string, mode: SampleMode = samplesLocal.mode) => {
    try {
        const raw = localStorage.getItem(storageKeyForMode(mode));
        let packs: SamplePack[] = [];
        if (raw) {
            packs = JSON.parse(raw) as SamplePack[];
        }
        packs = packs.filter(p => p.name !== packName);
        localStorage.setItem(storageKeyForMode(mode), JSON.stringify(packs));
        samplesLocal.packs = packs;
    } catch {
        log.error("Failed to delete local sample pack");
    }
}
