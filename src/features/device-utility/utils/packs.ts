export type PackType = 'official' | 'public' | 'private';

export function packTypeFromId(id: string): PackType {
  if (!id) return 'private';
  if (id.startsWith('W-') || id[0] === 'W') return 'official';
  if (id.startsWith('P-') || id[0] === 'P') return 'public';
  if (id.startsWith('U-') || id[0] === 'U') return 'private';
  return 'private';
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
  const t = type === 'public' ? 'P' : type === 'private' ? 'U' : 'W';
  return `${t}-${name}`;
}

/** Convert any id to a device 8-char ID (e.g., W-UNDRGND -> WUNDRGND). */
export function toDeviceId(id: string): string {
  const type = packTypeFromId(id);
  const base = idToBaseName(id).slice(0, 7).padEnd(7, ' ');
  const t = type === 'public' ? 'P' : type === 'private' ? 'U' : 'W';
  return `${t}${base}`;
}

export function idType(id: string): 'W'|'P'|'U' {
  const t = packTypeFromId(id);
  return t === 'public' ? 'P' : t === 'private' ? 'U' : 'W';
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
