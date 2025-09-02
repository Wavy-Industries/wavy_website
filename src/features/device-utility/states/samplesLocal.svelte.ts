import { SamplePack } from "~/lib/parsers/samples_parser";
import {Log} from "~/lib/utils/Log";

const LOG_LEVEL = Log.LEVEL_INFO
const log = new Log("samples-local", LOG_LEVEL);

const STORAGE_SAMPLES_KEY = 'wavy_user_packs';

export const samplesLocal = $state({
    packs: [] as SamplePack[]
});

export const refreshLocalSamples = () => {
    try {
        const raw = localStorage.getItem(STORAGE_SAMPLES_KEY);
        if (raw) {
            samplesLocal.packs = JSON.parse(raw) as SamplePack[];
        } else {
            samplesLocal.packs = [];
        }
    } catch {
        samplesLocal.packs = [];
    }
}

export const getLocalSamplePack = (packName: string): SamplePack | null => {
    const pack = samplesLocal.packs.find(p => p.name === packName);
    return pack || null;
}

export const newLocalSamplePack = (pack: SamplePack) => {
    try {
        const raw = localStorage.getItem(STORAGE_SAMPLES_KEY);
        let packs: SamplePack[] = [];
        if (raw) {
            packs = JSON.parse(raw) as SamplePack[];
        }
        const idx = packs.findIndex(p => p.name === pack.name);
        if (idx >= 0) {
            log.error("Pack with same name already exists");
            return;
        }
        packs.push(pack);
        localStorage.setItem(STORAGE_SAMPLES_KEY, JSON.stringify(packs));
        samplesLocal.packs = packs;
    } catch {
        log.error("Failed to save local sample pack");
    }
}

export const updateLocalSamplePack = (pack: SamplePack) => {
    try {
        const raw = localStorage.getItem(STORAGE_SAMPLES_KEY);
        let packs: SamplePack[] = [];
        if (raw) {
            packs = JSON.parse(raw) as SamplePack[];
        }
        const idx = packs.findIndex(p => p.name === pack.name);
        if (!(idx >= 0)) {
            log.error("Pack to update not found");
            return
        }
        packs[idx] = pack;
        localStorage.setItem(STORAGE_SAMPLES_KEY, JSON.stringify(packs));
        samplesLocal.packs = packs;
    } catch {
        log.error("Failed to update local sample pack");
    }
}

export const deleteLocalSamplePack = (packName: string) => {
    try {
        const raw = localStorage.getItem(STORAGE_SAMPLES_KEY);
        let packs: SamplePack[] = [];
        if (raw) {
            packs = JSON.parse(raw) as SamplePack[];
        }
        packs = packs.filter(p => p.name !== packName);
        localStorage.setItem(STORAGE_SAMPLES_KEY, JSON.stringify(packs));
        samplesLocal.packs = packs;
    } catch {
        log.error("Failed to delete local sample pack");
    }
}