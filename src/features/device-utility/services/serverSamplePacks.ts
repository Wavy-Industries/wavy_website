import { SamplePack } from "~/lib/parsers/samples_parser";
import { getPackType, packDisplayName, SamplePackInfo } from "../utils/samples";

import { Log } from "~/lib/utils/Log";

const LOG_LEVEL = Log.LEVEL_DEBUG
const log = new Log("serverSamplePacks", LOG_LEVEL);

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
            pack.name = id;
            log.debug(`Fetched pack ${id} from cloud successfully.`);
            return pack;
        }
    } catch (e) {
        log.error(`Failed to fetch pack ${id} from cloud: ${e}`);
    }
    return null;
}

export const fetchAvailableServerPacks = async (): Promise<{[key: string]: SamplePackInfo}> => {
    log.debug("Fetching available server packs");
    const res = await fetch(`/samples/MONKEY/DRM/record.json`);
    if (res.ok) {
        const record = await res.json() as {[key: string]: SamplePackInfo};
        // Add display key to each pack info
        for (const [id, packInfo] of Object.entries(record)) {
            packInfo.display = packDisplayName(id);
        }
        log.debug(`Fetched ${Object.keys(record).length} available server packs`);
        return record;
    }
    log.error("Failed to fetch available server packs");
    throw new Error("Failed to fetch available server packs");
}