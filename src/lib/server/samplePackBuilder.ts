import { readFile } from 'fs/promises';
import { join } from 'path';
import type { DeviceSamples, SamplePack } from '~/lib/parsers/device_samples_parser';
import { sampleModeLabel, type SampleMode } from '~/lib/types/sampleMode';

const DEVICE_NAME = 'MONKEY';

async function readJsonFile(filePath: string): Promise<any> {
  try {
    const publicDir = join(process.cwd(), 'public');
    const fullPath = join(publicDir, filePath);
    const content = await readFile(fullPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Failed to read file ${filePath}:`, error);
    return null;
  }
}

export async function fetchDefaultPackIds(mode: SampleMode): Promise<string[]> {
  try {
    const filePath = `/assets/${DEVICE_NAME}/${sampleModeLabel(mode)}/default.json`;
    const ids = await readJsonFile(filePath);
    if (!ids) {
      console.error(`Failed to fetch default pack IDs for ${sampleModeLabel(mode)}`);
      return [];
    }
    return ids;
  } catch (error) {
    console.error(`Error fetching default pack IDs: ${error}`);
    return [];
  }
}

export async function fetchServerPack(id: string, mode: SampleMode): Promise<SamplePack | null> {
  try {
    const filePath = `/assets/${DEVICE_NAME}/${sampleModeLabel(mode)}/${id}.json`;
    const pack = await readJsonFile(filePath);
    if (!pack) {
      console.error(`Failed to fetch pack ${id}`);
      return null;
    }
    pack.name = id;
    return pack;
  } catch {
    return null;
  }
}

export async function buildDeviceSamplesFromIds(ids: string[], mode: SampleMode): Promise<DeviceSamples | null> {
  if (!ids || ids.length < 1 || ids.length > 10) return null;
  const pages: (SamplePack | null)[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!id) {
      pages.push(null);
      continue;
    }
    const pack = await fetchServerPack(id.trim(), mode);
    if (!pack) return null;
    pages.push(pack);
  }
  while (pages.length < 10) pages.push(null);
  return { pages } as DeviceSamples;
}
