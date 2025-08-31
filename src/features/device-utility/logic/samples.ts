import { type Page, type SamplePack } from '~/lib/parsers/samples_parser';
import { rotateForDevice, toDeviceId, toUiId, validatePack } from '~/features/device-utility/utils/packs';
import { canonicalize } from '~/lib/utilities';

export function canonicalPageContent(page: Page | null | undefined): any {
    if (!page) return canonicalize({ loops: [] });
    const loops = Array(15).fill(null);
    const src = (page.loops || []) as any[];
    for (let i = 0; i < Math.min(15, src.length); i++) loops[i] = src[i] ?? null;
    return canonicalize({ loops });
}

export async function buildSamplePackFromIds(ids: (string|null)[], opts: {
    userPacks: Array<{ id: string; loops?: Page|null }>;
    stagedDeviceContent: Record<string, Page | undefined>;
    canonicalIdKey: (id: string) => string;
    fetchPackPage: (id: string) => Promise<Page|null>;
}): Promise<SamplePack> {
    const devIds = ids.length === 10 ? rotateForDevice(ids) : ids;
    const pages: (Page|null)[] = [];
    for (const id of devIds) {
        if (!id) { pages.push(null); continue; }
        const type = (id[0] === 'W' || id[0] === 'P' || id[0] === 'U') ? id[0] : (id.startsWith('W-') ? 'W' : id.startsWith('P-') ? 'P' : id.startsWith('U-') ? 'U' : 'W');
        const uiId = toUiId(id);
        const staged = opts.stagedDeviceContent[opts.canonicalIdKey(uiId)];
        if (staged) { pages.push({ name: toDeviceId(uiId), loops: (staged as any).loops } as any); continue; }
        let page: Page|null = null;
        if (type === 'U') {
            const up = opts.userPacks.find(p => opts.canonicalIdKey(p.id) === opts.canonicalIdKey(uiId));
            page = up?.loops || null;
        } else {
            page = await opts.fetchPackPage(uiId);
        }
        if (page) { page.name = toDeviceId(uiId); pages.push(page); } else { pages.push(null); }
    }
    return {
        reserved0: 0xFFFFFFFF,
        reserved1: 0xFFFFFFFF,
        reserved2: 0xFFFFFFFF,
        reserved3: 0xFFFFFFFF,
        pages,
    } as SamplePack;
}

export function validatePackForDevice(pack: SamplePack, storageTotal: number | null | undefined): { ok: boolean; errors: string[] } {
    const errors = validatePack(pack, { storageTotal: storageTotal ?? undefined });
    return { ok: errors.length === 0, errors };
}

export async function computeDevicePages(downloadSamples: () => Promise<{ pages?: (Page|null)[] } | null>): Promise<Record<string, Page | undefined>> {
    const out: Record<string, Page | undefined> = {};
    try {
        const pack = await downloadSamples();
        for (const page of (pack?.pages || [])) {
            if (!page) continue;
            const type = page.name?.[0];
            const base = (page.name || '').substring(1).trimEnd();
            const key = `${type}|${base}`;
            out[key] = page as any;
        }
    } catch {}
    return out;
}

export async function computeLocalPageForId(id: string, opts: {
    userPacks: Array<{ id: string; loops?: Page|null }>;
    fetchPageByUiId: (uiId: string) => Promise<Page|null>;
}): Promise<Page | null> {
    try {
        const uiId = toUiId(id);
        if (uiId.startsWith('U-') || uiId[0] === 'U') {
            const up = opts.userPacks.find(p => p.id === uiId);
            if (up?.loops) return { name: uiId, loops: (up.loops as any) } as any;
        }
        const page = await opts.fetchPageByUiId(uiId);
        if (page) return page;
    } catch {}
    return null;
}

export async function computeDiffs(keys: string[], devicePagesByKey: Record<string, Page | undefined>, opts: {
    computeLocalPageForId: (uiId: string) => Promise<Page|null>;
}): Promise<Record<string, { local?: Page|null; device?: Page|null; status: 'in_sync'|'local_newer'|'device_newer'|'diverged' }>> {
    const diffs: Record<string, { local?: Page|null; device?: Page|null; status: 'in_sync'|'local_newer'|'device_newer'|'diverged' }> = {};
    await Promise.all(keys.map(async (key) => {
        const [type, base] = key.split('|');
        const uiId = `${type}-${base}`;
        const device = devicePagesByKey[key] || null;
        const local = await opts.computeLocalPageForId(uiId);
        let status: 'in_sync'|'local_newer'|'device_newer'|'diverged' = 'in_sync';
        if (local && device) {
            status = JSON.stringify(canonicalPageContent(local)) === JSON.stringify(canonicalPageContent(device)) ? 'in_sync' : 'diverged';
        } else if (local && !device) status = 'local_newer';
        else if (!local && device) status = 'device_newer';
        diffs[key] = { local, device, status };
    }));
    return diffs;
}


