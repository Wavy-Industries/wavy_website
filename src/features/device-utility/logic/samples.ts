import { DeviceSamples, SamplePack } from "~/lib/parsers/samples_parser";
import { Log } from "~/lib/utils/Log";
import { getLocalSamplePack } from "../states/samplesLocal.svelte";
import { canonicalize } from "~/lib/utils/canonicalize";

const LOG_LEVEL = Log.LEVEL_INFO
const log = new Log("samples-util", LOG_LEVEL);

type PackType = 'Official' | 'User' | 'Local';

export const getPackType = (id: string): PackType | null => {
    /* asume format X-YYYYYYY and extract X from string with regex */
    const t = id.match(/^([A-Z])-.*$/); 
    if (t && t[1]) {
        switch (t[1]) {
            case 'W': return 'Official';
            case 'P': return 'User';
            case 'U': return 'Local';
            default: null;
        }   
    }
    return null;
}

export const constructSamplePacks = async (ids: string[]): Promise<DeviceSamples | null> => {
    if (ids.length < 1 || ids.length > 10) {
        log.error(`Number of Ids out of range (1-10): ${ids.length}`);
        return null;
    }

    if (ids.length !== 10) {
        log.debug("Padding sample pack IDs to length 10 with nulls.");
        while (ids.length < 10) ids.push(null);
    }

    log.debug(`Constructing sample packs from IDs: ${ids.join(", ")}`);
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

        switch (packType) {
            case 'Official':
            case 'User': {
                log.debug(`Fetching pack for ID ${id_str} (type: ${packType})`);
                const pack = await fetchServerPack(id_str);
                if (!pack) {
                    log.error(`Failed to fetch pack for ID ${id_str}, pushing null.`);
                    packs.push(null);
                    continue;
                }
                packs.push(pack);
                log.debug(`Successfully fetched pack for ID ${id_str}, pushing to array.`);
                break;
            }
            case 'Local': {
                log.debug(`ID ${id_str} is a local pack, pushing null (local packs not handled here).`);
                const pack = getLocalSamplePack(id_str);
                if (!pack) {
                    log.error(`Failed to get local pack for ID ${id_str}, pushing null.`);
                    packs.push(null);
                    continue;
                }
                packs.push(pack);
                log.debug(`Successfully retrieved local pack for ID ${id_str}, pushing to array.`);
                break;
            }
        }
    }
    

    const deviceSamples: DeviceSamples = {
        reserved0: 0xFFFFFFFF,
        reserved1: 0xFFFFFFFF,
        reserved2: 0xFFFFFFFF,
        reserved3: 0xFFFFFFFF,
        pages: packs,
    };
    return deviceSamples;
}

export const fetchServerPack = async (id: string): Promise<SamplePack | null> => {
    const packType = getPackType(id);
    if (!packType || (packType !== 'Official' && packType !== 'User')) {
        log.error(`Invalid pack type for cloud fetch: ${packType} (ID: ${id})`);
        return null;
    }

    const DEVICE_NAME = "MONKEY"; // TODO: fetch from device info

    try {
        const res = await fetch(`/samples/${DEVICE_NAME}/DRM/${id}.json`);
        if (res.ok) {
            const pack = await res.json() as SamplePack;
            log.debug(`Fetched pack ${id} from cloud successfully.`);
            return pack;
        }
    } catch (e) {
        log.error(`Failed to fetch pack ${id} from cloud: ${e}`);
    }
    return null;
}

type SamplePackDiff = {
    areIdentical: boolean;
    packsIdentical: (boolean | null)[],
}
export const compareSamplePacks = (a: SamplePack, b: SamplePack): SamplePackDiff | null => {
    if (!a || !b) {
        log.error("Cannot compare null sample packs.");
        return null;
    }
    if (a.name !== b.name) {
        log.error("Sample packs have different names, cannot compare.");
        return null;
    }
    if (a.loops.length !== 10 || b.loops.length !== 10) {
        log.error("Sample packs must have exactly 10 loops to compare.");
        return null;
    }

    const packsIdentical: boolean[] = a.loops.map((loop, idx) => {
        const otherLoop = b.loops[idx];
        if (loop === null || otherLoop === null) return null;
        if (canonicalize(loop) === canonicalize(otherLoop)) return true;
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
export const compareDeviceSamples = (a: DeviceSamples, b: DeviceSamples): DeviceSamplesDiff | null => {
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
        return compareSamplePacks(pack, otherPack);
    });

    return {
        areIdentical: packs.every(v => v?.areIdentical === true),
        packs,
    };
}