import type { Page } from '~/lib/parsers/samples_parser';

const LS_KEY = 'wavy_user_packs';

export interface LocalUserPackRecord { id: string; page: Page }

export function readAllUserPacks(): LocalUserPackRecord[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as LocalUserPackRecord[];
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

export function writeAllUserPacks(records: LocalUserPackRecord[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(records));
  } catch {}
}

export function upsertUserPack(id: string, page: Page): void {
  const arr = readAllUserPacks();
  const idx = arr.findIndex(x => x.id === id);
  const rec = { id, page } as LocalUserPackRecord;
  if (idx >= 0) arr[idx] = rec; else arr.push(rec);
  writeAllUserPacks(arr);
}

export function deleteUserPack(id: string): void {
  const arr = readAllUserPacks().filter(x => x.id !== id);
  writeAllUserPacks(arr);
}


