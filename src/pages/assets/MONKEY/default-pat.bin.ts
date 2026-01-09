import type { APIRoute } from 'astro';
import { samplesParser_encode } from '~/lib/parsers/device_storage_parser';
import { SampleMode } from '~/lib/types/sampleMode';
import { fetchDefaultPackIds, buildDeviceSamplesFromIds } from '~/lib/server/samplePackBuilder';

const mode = SampleMode.PAT;

export const GET: APIRoute = async () => {
  try {
    const defaultPackIds = await fetchDefaultPackIds(mode);
    if (!defaultPackIds || defaultPackIds.length === 0) {
      throw new Error('Failed to fetch default pack IDs');
    }

    const deviceSamples = await buildDeviceSamplesFromIds(defaultPackIds, mode);
    if (!deviceSamples) {
      throw new Error('Failed to construct default sample packs');
    }

    const encoded = samplesParser_encode(deviceSamples);

    return new Response(encoded, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': encoded.byteLength.toString(),
      }
    });
  } catch (error) {
    console.error('Error generating default samples:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate default samples' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
