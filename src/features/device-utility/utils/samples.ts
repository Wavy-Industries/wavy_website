import { DeviceSamples, SamplePack } from "~/lib/parsers/samples_parser";
import { Log } from "~/lib/utils/Log";
import { getLocalSamplePack } from "../states/samplesLocal.svelte";
import { canonicalize } from "~/lib/utils/canonicalize";
import { fetchServerPack } from "../services/serverSamplePacks";

const LOG_LEVEL = Log.LEVEL_DEBUG
const log = new Log("samples-util", LOG_LEVEL);

export type PackType = 'Official' | 'User' | 'Local';

export type SamplePackInfo = {
    display: PackDisplay;
    author: string;
    created: Date;
    description: string;
}

export const getPackType = (id: string): PackType | null => {
    /* asume format X-YYYYYYY and extract X from string with regex */
    log.debug(`Getting pack type for ID: ${id}`);
    const t = id.match(/^([A-Z])-.*$/); 
    if (t && t[1]) {
        switch (t[1]) {
            case 'W': return 'Official';
            case 'U': return 'User';
            case 'L': return 'Local';
            default: null;
        }   
    }
    log.debug(`No pack type found for ID: ${id}`);
    return null;
}

export type PackDisplay = {
    name: string;
    type: PackType;
}
export const packDisplayName = (id: string): PackDisplay | null => {
    if (!id) {
        log.error("Pack ID is null, cannot display name.");
        return null;
    }
    const type = getPackType(id);
    if (type === null) {
        log.error("Pack ID is invalid, cannot display name.");
        return null;
    }
    return {name: id.substring(2), type};
}

export const getSamplePack = async(id: string): Promise<SamplePack | null> => {
    log.debug(`Getting sample pack for ID: ${id}`);
    const packType = getPackType(id);
    if (!packType) {
        log.error(`Could not determine pack type for ID ${id}, skipping.`);
        return null;
    }

    switch (packType) {
        case 'Local':
            return getLocalSamplePack(id);
        case 'Official':
        case 'User':
            return await fetchServerPack(id);
        default:
            log.error(`Invalid pack type for ID ${id}: ${packType}`);
            return null;
    }
}

export const constructSamplePacks = async (ids: string[]): Promise<DeviceSamples | null> => {
    log.debug(`Constructing sample packs from IDs: ${ids.join(", ")}`);
    if (ids.length < 1 || ids.length > 10) {
        log.error(`Number of Ids out of range (1-10): ${ids.length}`);
        return null;
    }

    if (ids.length !== 10) {
        log.debug("Padding sample pack IDs to length 10 with nulls.");
        while (ids.length < 10) ids.push(null);
    }

    const packs: SamplePack[] = [];
    for (const [idx, id_str] of ids.entries()) {
        if (!id_str) {
            packs.push(null);
            log.debug(`ID at ${idx} is empty, pushing null pack.`);
            continue;
        }

        const packType = getPackType(id_str);
        if (!packType) {
            log.error(`Could not determine pack type for ID ${id_str}, skipping.`);
            packs.push(null);
            continue;
        }

        const pack = await getSamplePack(id_str);
        if (!pack) {
            log.error(`Failed to get pack for ID ${id_str}, pushing null.`);
            packs.push(null);
            continue;
        }
        packs.push(pack);
    }
    log.debug(`Successfully fetched all packs, pushing to array.`);
    for (const [k, i] of packs.entries()) {
        log.debug(`Pack ${k} at index ${i}:`);
        log.debug(JSON.stringify(k));
    }

    const deviceSamples: DeviceSamples = {
        pages: packs,
    };
    return deviceSamples;
}

type SamplePackDiff = {
    areIdentical: boolean;
    packsIdentical: (boolean | null)[],
}
export const compareSamplePack = (a: SamplePack, b: SamplePack | null): SamplePackDiff | null => {
    if (!a) {
        log.error("Cannot compare null sample packs.");
        return null;
    }
    if (!b) {
        log.debug("Sample pack is null, cannot compare.");
        return {areIdentical: false, packsIdentical: [...Array(10).fill(false)]};
    }
    if (a.name !== b.name) {
        log.debug("Sample packs have different names, cannot compare.");
        return {areIdentical: false, packsIdentical: [...Array(10).fill(false)]};
    }

    const packsIdentical: boolean[] = a.loops.map((loop, idx) => {
        const otherLoop = b.loops[idx];
        if (loop === null || otherLoop === null) return null;
        if (JSON.stringify(canonicalize(loop)) === JSON.stringify(canonicalize(otherLoop))) return true;
        return false;
    });

    return {
        areIdentical: packsIdentical.every(v => v === true),
        packsIdentical,
    };
}

type DeviceSamplesDiff = {
    areIdentical: boolean;
    packs: (SamplePackDiff | null)[];
}
export const compareDeviceSample = (a: DeviceSamples, b: DeviceSamples): DeviceSamplesDiff | null => {
    // we do not compare reserved fields in DeviceSamples. Might be releevant later
    // currently, if we upload with reserved as null, we get back 0xFFFFFFFF

    if (!a || !b) {
        log.error("Cannot compare null device samples.");
        return null;
    }
    if (a.pages.length !== 10 || b.pages.length !== 10) {
        log.error("Device samples must have exactly 10 pages to compare.");
        return null;
    }

    const packs: (SamplePackDiff | null)[] = a.pages.map((pack, idx) => {
        const otherPack = b.pages[idx];
        if (pack === null || otherPack === null) return null;
        return compareSamplePack(pack, otherPack);
    });

    return {
        areIdentical: packs.every(v => (v?.areIdentical ?? true) === true),
        packs,
    };
}

export const getPackIds = (deviceSamples: DeviceSamples): string[] => {
    return deviceSamples.pages.map((pack) => pack?.name);
}