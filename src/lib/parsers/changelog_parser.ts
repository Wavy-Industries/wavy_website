import { ImageFirmwareVersion, imageRhsIsNewer } from "~/lib/mcumgr/ImageManager";

export interface Changelog { release: ImageFirmwareVersion | null; dev: ImageFirmwareVersion | null; versions: VersionDetail[] }
export interface VersionDetail { version: ImageFirmwareVersion; isObsolete: boolean; isDev: boolean; highlight: string | null; date: string | null; summary: string | null; changes: string[] }

export function parseChangelog(markdown: string): Changelog {
  const lines = markdown.split('\n');
  const changelog: Changelog = { release: null, dev: null, versions: [] };
  let currentVersion: VersionDetail | null = null; let collectingSummary = false;
  lines.forEach(lineRaw => {
    let line = lineRaw.trim();
    if (line.startsWith('#')) {
      const m = line.match(/# (\d+)\.(\d+)\.(\d+)(?:\[(.*?)\])?\s*(.*?)\s*((?:-\w+\s*)*)$/);
      if (m) {
        const major = parseInt(m[1], 10); const minor = parseInt(m[2], 10); const revision = parseInt(m[3], 10);
        const changeVersion: ImageFirmwareVersion = { versionString: `${major}.${minor}.${revision}`, major, minor, revision };
        const date = m[4] ? m[4].trim() : null; const highlight = m[5].trim(); const flags = m[6].trim().split(/\s+/).filter(Boolean);
        const isObsolete = flags.includes('-obsolete'); const isDev = flags.includes('-dev');
        if (!isObsolete) {
          if (!changelog.dev || imageRhsIsNewer(changelog.dev, changeVersion)) changelog.dev = changeVersion;
          if (!isDev) { if (!changelog.release || imageRhsIsNewer(changelog.release, changeVersion)) changelog.release = changeVersion; }
        }
        collectingSummary = revision === 0;
        currentVersion = { version: changeVersion, isObsolete, isDev, highlight: highlight || null, date, summary: null, changes: [] };
        changelog.versions.push(currentVersion);
      }
    } else if (line.startsWith('-')) {
      const change = line.substring(1).trim();
      if (currentVersion) { currentVersion.changes.push(change); collectingSummary = false; }
    } else if (line !== '') {
      if (currentVersion && collectingSummary && currentVersion.version.revision === 0) {
        currentVersion.summary = (currentVersion.summary ? currentVersion.summary + '\n' : '') + line;
      }
    }
  });
  return changelog;
}

