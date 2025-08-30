# Device Utility — Sample Manager v2

Goals
- Reorder and curate packs for upload (top 10 slots).
- Add/remove packs via a unified “Selected (top)” + “Available (bottom)” layout.
- Allow arrow reordering; upload and revert then sync with device so UI reflects reality.
- Show overflow (>10) as selected but out-of-range (red, not included).
- Include unknown packs found on device (user-made) in the lists.
- Distinguish types by first char: W=official, P=public, U=private; hide the prefix in the UI and show a badge.
- Local storage user packs: save named packs (7 chars + U prefix) and show in Available.

Data Model
- PackMeta
  - id: string (prefixed with W-/P-/U- in JS; device page names use prefix without '-')
  - type: official|public|private (derived from prefix)
  - displayName: computed (id without prefix)
  - source: website|device_only|user_local
  - sizePercent?: number (derived in view)
  - loops?: LoopData (only for user_local or when loaded)
  - author?: string (from record.json)
  - created?: string (from record.json)
- SampleState additions
  - selected: PackMeta[]
  - available: PackMeta[]
  - deviceSelected: PackMeta[]
  - dirty: boolean
  - preview: { packId: string|null; bpm: number; isPlaying: boolean }
  - userPacks: PackMeta[] (from localStorage)

Sources
- Website:
  - Filenames: `/samples/MONKEY/DRM/W-<NAME>.json` (prefix included).
  - Index: `/samples/MONKEY/DRM/record.json` is a map keyed by W-<NAME> with metadata, e.g. `{ "W-MIXED": { author, created } }`.
- Device: `SampleManager.getIDs()` + storage usage arrays; device page names use prefix without hyphen and padded base.
- Device content: `SampleManager.downloadSamples()`; match against device-formatted name.
- User local storage: `localStorage['wavy_user_packs']` as array of `{ id: 'U-<NAME>', page }`.

Interactions
- Add: card → Selected append (card remains visible; only the Add button is disabled if selected).
- Remove: selected row → card Add re‑enabled in Available; Edit/Delete always enabled.
- Reorder: up/down arrows; overflow rows highlighted.
- Upload: icon-only arrow; enabled even if no detected changes; after upload, reload device state and reflect IDs.
- Revert: icon-only left arrow; reload device state and reflect IDs.
- Selected indices: 1..9 then 0; extra items show index “-” and are not uploaded.
- Edit: opens full-page editor; saving user packs writes to local storage.
- Delete (user packs): removes from local storage and Selected, recomputes dirty.

ID & Content Rules
- JS IDs use hyphen-prefixed strings (W-/P-/U-). Display hides the prefix with a badge.
- Device page names are prefix + 7-char padded base without hyphen.
- Upload content source:
  - W-/P-: website/device content.
  - U-: user-local content.
- Dirty flag: computed on canonical ID equality (TYPE|BASENAME) and content edits of selected packs.
- After upload/revert: refresh from device → set Selected = deviceSelected → clear contentDirty.

Usage & Percentages
- Selected list: device usage % shown for top 10 (aligned to display order 1..9,0); user packs show estimated % from encoded size.
- Available list: optional display of author/created from record.json.
