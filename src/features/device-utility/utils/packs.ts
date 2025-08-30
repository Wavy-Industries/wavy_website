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

export function toDeviceIdFromAny(id: string): string {
  // Convert UI/website id (e.g., W-UNDRGND) or raw device id to device 8-char ID (e.g., WUNDRGND)
  const type = packTypeFromId(id);
  const base = idToBaseName(id).slice(0,7).padEnd(7,' ');
  const t = type === 'public' ? 'P' : type === 'private' ? 'U' : 'W';
  return `${t}${base}`;
}

export function makeUserPackId(userName7: string): string {
  const name = (userName7 || '').slice(0, 7).padEnd(7, ' ');
  return `U${name}`; // Reserve first char for type
}

export function isSamePackId(a?: string|null, b?: string|null): boolean {
  return (a || null) === (b || null);
}
