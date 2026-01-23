import { SamplePack } from "~/lib/parsers/device_storage_parser";
import { SampleMode, sampleModeLabel } from "~/lib/types/sampleMode";
import { getPackType, packDisplayName, SamplePackInfo, normalizePackId } from "../utils/samples";
import { bluetoothManager } from "~/lib/states/bluetooth.svelte";
import { fetchServerPack as fetchServerPackBase } from "~/lib/services/samplePackFetcher";

import { Log } from "~/lib/utils/Log";

const LOG_LEVEL = Log.LEVEL_INFO
const log = new Log("serverSamplePacks", LOG_LEVEL);

/**
 * Fetches a sample pack from the server with pack type validation.
 * Only Official and User packs can be fetched from the cloud.
 */
export const fetchServerPack = async (id: string, mode: SampleMode = SampleMode.DRM): Promise<SamplePack | null> => {
    id = normalizePackId(id);
    const packType = getPackType(id);
    if (!packType || (packType !== 'Official' && packType !== 'User')) {
        log.error(`Invalid pack type for cloud fetch: ${packType} (ID: ${id})`);
        return null;
    }
    return fetchServerPackBase(id, mode);
}

export const fetchAvailableServerPacks = async (mode: SampleMode = SampleMode.DRM): Promise<{[key: string]: SamplePackInfo}> => {
    log.debug("Fetching available server packs");
    const res = await fetch(`/assets/${bluetoothManager.getDeviceName()}/${sampleModeLabel(mode)}/record.json`);
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
