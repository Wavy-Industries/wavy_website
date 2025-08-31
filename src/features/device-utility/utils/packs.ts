export type PackType = 'official' | 'public' | 'local';

export function packTypeFromId(id: string): PackType {
  if (!id) return 'local';
  if (id.startsWith('W-') || id[0] === 'W') return 'official';
  if (id.startsWith('P-') || id[0] === 'P') return 'public';
  if (id.startsWith('U-') || id[0] === 'U') return 'local';
  return 'local';
}

export function packDisplayName(id: string): string {
  if (!id) return '';
  if (id.includes('-') && (id[1] === '-')) return id.substring(2);
  const first = id[0];
  const hasPrefix = first === 'W' || first === 'P' || first === 'U';
  const core = hasPrefix ? id.substring(1) : id;
  return core.trimEnd();
}

export function idToBaseName(id: string): string {
  if (!id) return '';
  if (id.startsWith('W-') || id.startsWith('P-') || id.startsWith('U-')) return id.substring(2);
  if (id[0] === 'W' || id[0] === 'P' || id[0] === 'U') return id.substring(1).trimEnd();
  return id;
}

export function toWebsiteIdFromBase(name: string, type: PackType = 'official'): string {
  const t = type === 'public' ? 'P' : type === 'local' ? 'U' : 'W';
  return `${t}-${name}`;
}

/** Convert any id to a device 8-char ID (e.g., W-UNDRGND -> WUNDRGND). */
export function toDeviceId(id: string): string {
  const type = packTypeFromId(id);
  const base = idToBaseName(id).slice(0, 7).padEnd(7, ' ');
  const t = type === 'public' ? 'P' : type === 'local' ? 'U' : 'W';
  return `${t}${base}`;
}

export function idType(id: string): 'W'|'P'|'U' {
  const t = packTypeFromId(id);
  return t === 'public' ? 'P' : t === 'local' ? 'U' : 'W';
}

export function canonicalIdKey(id: string): string {
  return `${idType(id)}|${idToBaseName(id).trim()}`;
}

/** Make a UI id for a user pack: U-<BASE> (no padding). */
export function makeUserPackId(userName7: string): string {
  const base = (userName7 || '').slice(0, 7);
  return `U-${base}`;
}

export function isSamePackId(a?: string|null, b?: string|null): boolean {
  return (a || null) === (b || null);
}

/** Convert a device ID (e.g., "WUNDRGND") or any variant to UI ID "W-UNDRGND". */
export function toUiId(id: string): string {
  if (!id) return id;
  // Already UI format
  if (id.startsWith('W-') || id.startsWith('P-') || id.startsWith('U-')) return id;
  const first = id[0];
  if (first === 'W' || first === 'P' || first === 'U') {
    return `${first}-${id.substring(1).trimEnd()}`;
  }
  return id;
}

/** Device slot index corresponding to a display index (1..9,0 mapping).
 *  Display index i maps to device index (i+1) % 10.
 */
export function deviceIndexForDisplay(displayIndex: number): number {
  return (displayIndex + 1) % 10;
}

/** Rotate display-ordered IDs to device order (index 0 moves to the end). */
export function rotateForDevice<T>(arr: T[]): T[] {
  if (!arr || arr.length !== 10) return arr;
  const last = arr[9];
  return [last, ...arr.slice(0, 9)];
}

/** Rotate device-ordered IDs back to display order. */
export function rotateForDisplay<T>(arr: T[]): T[] {
  if (!arr || arr.length !== 10) return arr;
  const first = arr[0];
  return [...arr.slice(1, 10), first];
}
import { samplesParser_encode, type Page, type SamplePack } from '~/lib/parsers/samples_parser';

// -------- Validation helpers (moved from validation/packs) --------

export function isAsciiPrintable(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x20 || code > 0x7E) return false;
  }
  return true;
}

export function validatePage(uiId: string, page: Page): string[] {
  const errs: string[] = [];
  if (!isAsciiPrintable(page.name || '')) errs.push(`Pack ${uiId}: name contains non-ASCII characters`);
  const loops = page.loops || [];
  if (loops.length > 15) errs.push(`Pack ${uiId}: has more than 15 loops`);
  loops.forEach((loop: any, li: number) => {
    if (!loop) return;
    const lb = Number(loop.length_beats) || 0;
    if (lb <= 0) errs.push(`Pack ${uiId} loop ${li+1}: invalid length_beats`);
    if (lb > 16) errs.push(`Pack ${uiId} loop ${li+1}: length exceeds 16 beats`);
    const events = loop.events || [];
    if (events.length > 255) errs.push(`Pack ${uiId} loop ${li+1}: too many events (>255)`);
    for (const ev of events) {
      const n = Number(ev.note);
      const v = Number(ev.velocity);
      const tp = Number(ev.time_ticks_press);
      const tr = Number(ev.time_ticks_release);
      if (!(n >= 0 && n <= 127)) { errs.push(`Pack ${uiId} loop ${li+1}: note out of range (${n})`); break; }
      if (!(v >= 0 && v <= 127)) { errs.push(`Pack ${uiId} loop ${li+1}: velocity out of range (${v})`); break; }
      if (!(tp >= 0 && tp <= 511)) { errs.push(`Pack ${uiId} loop ${li+1}: press tick out of range (${tp})`); break; }
      if (!(tr >= 1 && tr <= 511)) { errs.push(`Pack ${uiId} loop ${li+1}: release tick out of range (${tr})`); break; }
      if (!(tr > tp)) { errs.push(`Pack ${uiId} loop ${li+1}: release must be after press`); break; }
    }
  });
  return errs;
}

export function validatePack(pack: SamplePack, opts?: { storageTotal?: number }): string[] {
  const errs: string[] = [];
  (pack.pages || []).forEach((pg) => {
    if (!pg) return;
    const type = pg.name?.[0] ?? '?';
    const base = (pg.name ?? '').substring(1).trimEnd();
    const uiId = `${type}-${base}`;
    errs.push(...validatePage(uiId, pg));
  });
  try {
    const encoded = samplesParser_encode(pack as any);
    if (opts?.storageTotal && encoded.byteLength > opts.storageTotal) {
      errs.push(`Selected packs exceed device storage: ${encoded.byteLength} > ${opts.storageTotal} bytes`);
    }
  } catch (e: any) {
    errs.push(`Failed to prepare samples for upload: ${e?.message || String(e)}`);
  }
  return errs;
}
