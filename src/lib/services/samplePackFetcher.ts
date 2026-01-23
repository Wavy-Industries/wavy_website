/**
 * Consolidated sample pack fetching service
 *
 * Provides a single implementation for fetching sample packs from the server,
 * used by both lib/states/samples.svelte.ts and features/device-utility.
 */

import { SamplePack } from '~/lib/parsers/device_storage_parser';
import { SampleMode, sampleModeLabel } from '~/lib/types/sampleMode';
import { bluetoothManager } from '~/lib/states/bluetooth.svelte';
import { Log } from '~/lib/utils/Log';

const LOG_LEVEL = Log.LEVEL_INFO;
const log = new Log('samplePackFetcher', LOG_LEVEL);

/**
 * Fetches a sample pack from the server by ID
 *
 * @param id - The pack ID (will be normalized to trim whitespace/nulls)
 * @param mode - Sample mode (DRM or PAT)
 * @returns The sample pack or null if fetch failed
 */
export const fetchServerPack = async (
    id: string,
    mode: SampleMode = SampleMode.DRM
): Promise<SamplePack | null> => {
    // Normalize the ID (trim trailing whitespace and null characters)
    const normalizedId = id.replace(/[\s\0]+$/, '');

    try {
        const url = `/assets/${bluetoothManager.getDeviceName()}/${sampleModeLabel(mode)}/${encodeURIComponent(normalizedId)}.json`;
        const res = await fetch(url);

        if (!res.ok) {
            log.error(`Failed to fetch pack ${normalizedId} from server (${res.status})`);
            return null;
        }

        const pack = await res.json() as SamplePack;
        pack.name = normalizedId;
        log.debug(`Fetched pack ${normalizedId} from server`);
        return pack;
    } catch (e) {
        log.error(`Error fetching pack ${normalizedId}: ${e}`);
        return null;
    }
};
