import { DEVICE_NAME } from '~/features/device-utility/config';
import type { Page } from '~/lib/parsers/samples_parser';

export interface WebsitePackMetaLite {
  id: string;
  author?: string;
  created?: string;
  sizePercent?: number;
  description?: string;
}

function toUiId(id: string): string {
  if (!id) return id;
  if (id.startsWith('W-') || id.startsWith('P-') || id.startsWith('U-')) return id;
  const c = id[0];
  if (c === 'W' || c === 'P' || c === 'U') return `${c}-${id.substring(1).trimEnd()}`;
  return id;
}

export async function loadWebsiteIndex(): Promise<WebsitePackMetaLite[]> {
  try {
    const url = `/samples/${DEVICE_NAME}/DRM/record.json?_=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    if (Array.isArray(data)) {
      return (data as string[]).map((id) => ({ id: toUiId(id) }));
    }
    if (Array.isArray((data as any)?.packs)) {
      return (data as any).packs.map((p: any) => ({ id: toUiId(p.id ?? p), author: p.author, created: p.created, sizePercent: p.sizePercent, description: p.description }));
    }
    if (data && typeof data === 'object') {
      const out: WebsitePackMetaLite[] = [];
      for (const [key, val] of Object.entries(data as Record<string, any>)) {
        if (typeof val === 'string') out.push({ id: toUiId(val) });
        else if (val && typeof val === 'object') out.push({ id: toUiId((val as any).id ?? key), author: (val as any).author, created: (val as any).created, sizePercent: (val as any).sizePercent, description: (val as any).description });
      }
      return out;
    }
  } catch {}
  return [];
}

export async function fetchPageByUiId(uiId: string): Promise<Page | null> {
  try {
    // Local user packs (U-) are stored in localStorage, not on the website
    if (uiId && (uiId.startsWith('U-') || uiId[0] === 'U')) {
      try {
        const raw = localStorage.getItem('wavy_user_packs');
        if (raw) {
          const arr = JSON.parse(raw) as Array<{ id: string; page: Page }>;
          const found = arr.find(x => toUiId(x.id) === toUiId(uiId));
          if (found?.page) return found.page as Page;
        }
      } catch {}
      return null;
    }
    const res = await fetch(`/samples/${DEVICE_NAME}/DRM/${uiId}.json`, { cache: 'no-store' });
    if (res.ok) return await res.json();
  } catch {}
  return null;
}

