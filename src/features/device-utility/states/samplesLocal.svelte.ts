import { SamplePack } from "~/lib/parsers/samples_parser";
import { SamplePackInfo } from "../utils/samples";
import {Log} from "~/lib/utils/Log";

const LOG_LEVEL = Log.LEVEL_INFO
const log = new Log("samples-local", LOG_LEVEL);

const STORAGE_SAMPLES_KEY = 'wavy_local_packs';

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
    log.debug(`Getting local sample pack for name: ${packName}`);
    const pack = samplesLocal.packs.find(p => p.name === packName);
    log.debug(`Found local sample pack for name: ${packName}: ${pack ? pack.name : 'null'}`);
    // Return a deep clone to avoid reactive proxies in constructed packs
    return pack ? JSON.parse(JSON.stringify(pack)) as SamplePack : null;
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
        // store a plain clone to avoid reactive proxies
        const clean: SamplePack = JSON.parse(JSON.stringify(pack));
        packs.push(clean);
        localStorage.setItem(STORAGE_SAMPLES_KEY, JSON.stringify(packs));
        // refresh from storage to ensure plain objects
        refreshLocalSamples();
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
        // store a plain clone to avoid reactive proxies
        const clean: SamplePack = JSON.parse(JSON.stringify(pack));
        packs[idx] = clean;
        localStorage.setItem(STORAGE_SAMPLES_KEY, JSON.stringify(packs));
        // refresh from storage to ensure plain objects
        refreshLocalSamples();
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