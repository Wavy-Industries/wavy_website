import { LOOPS_PER_PAGE, Page, SamplePack } from "~/lib/parsers/samples_parser";

function hasTypePrefix(id: string): boolean {
  const c = id?.[0];
  return c === 'W' || c === 'P' || c === 'U';
}

function normalizeOfficialId(name: string): string {
  const core = (name || '').slice(0, 7).padEnd(7, ' ');
  return `W${core}`;
}

function idToFetchName(id: string): string {
  if (!id) return '';
  if (id.startsWith('W-') || id.startsWith('P-')) return id; // filenames include type prefix
  if (hasTypePrefix(id)) {
    const base = id.substring(1).trim();
    return `${id[0]}-${base}`;
  }
  return id;
}

export async function generateSamplePack(ids: string[]) {
  if (ids?.length > 10) return null;
  const fullIds = Array(10).fill(null);
  if (ids.length > 0) ids.forEach((id, index) => fullIds[index] = id);
  const lastElement = fullIds.pop(); fullIds.unshift(lastElement);

  const device_name = "MONKEY";
  const pages: Page[] = [] as any;
  for (const inId of fullIds) {
    if (inId === null) { pages.push(null as any); continue; }
    const fetchName = idToFetchName(inId);
    // Convert UI/website id (e.g., W-UNDRGND) to device id (WUNDRGND)
    let normalizedId: string;
    if (inId.startsWith('W-') || inId.startsWith('P-') || inId.startsWith('U-')) {
      normalizedId = `${inId[0]}${inId.substring(2).slice(0,7).padEnd(7,' ')}`
    } else {
      normalizedId = hasTypePrefix(inId) ? inId : normalizeOfficialId(inId);
    }
    try {
      const response = await fetch(`/samples/${device_name}/DRM/${fetchName}.json`);
      const pageData = await response.json();
      const page: Page = { name: normalizedId, loops: pageData.loops } as any;
      pages.push(page);
    } catch (e) { pages.push(null as any); }
  }
  const samplePack: SamplePack = { reserved0: 0xFFFFFFFF, reserved1: 0xFFFFFFFF, reserved2: 0xFFFFFFFF, reserved3: 0xFFFFFFFF, pages };
  return samplePack;
}
