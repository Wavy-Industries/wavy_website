import { samplesParser_encode, type Page, type SamplePack } from '~/lib/parsers/samples_parser';

export function isAsciiPrintable(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x20 || code > 0x7E) return false;
  }
  return true;
}

export function validatePage(uiId: string, page: Page): string[] {
  const errs: string[] = [];
  // Ensure device name is ASCII (8 chars handled elsewhere)
  if (!isAsciiPrintable(page.name || '')) errs.push(`Pack ${uiId}: name contains non-ASCII characters`);
  // Loops & events constraints
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
  // Validate each page
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

