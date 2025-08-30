# Device Utility — Sample Manager v2

Goals
- Reorder and curate packs for upload (top 10 slots).
- Add/remove packs via a unified “Selected (top)” + “Available (bottom)” layout.
- Allow arrow reordering; upload and revert to device state.
- Show overflow (>10) as selected but out-of-range (red, not included).
- Include unknown packs found on device (user-made) in the lists.
- Distinguish types by first char: W=official, P=public, U=private; hide the prefix visually via styling.
- Local storage user packs: save named packs (7 chars + U prefix) and show in Available.

Data Model
- PackMeta
  - id: string (8 ASCII; full name used on device; includes type prefix)
  - type: official|public|private (derived from id[0]; fallback private)
  - displayName: computed getter (id.substring(1).trim())
  - source: website|device_only|user_local
  - sizePercent?: number
  - loops?: LoopData[] (optional; loaded lazily)
- SampleState additions
  - selected: PackMeta[]
  - available: PackMeta[]
  - deviceSelected: PackMeta[]
  - dirty: boolean
  - preview: { packId: string|null; bpm: number; isPlaying: boolean }
  - userPacks: PackMeta[] (from localStorage)

Sources
- Website: `/samples/MONKEY/DRM/record.json` — provides available packs (names without prefix). Fetch logic adds the `W` prefix and pads to 8 ASCII for device IDs.
- Device: `SampleManager.getIDs()` + storage usage arrays.
- Device content for preview: `SampleManager.downloadSamples()` and extract page by pack id.
- User local storage: `localStorage['wavy_user_packs']` as array of `{ id, page }`.

Interactions
- Add: card → Selected append (card remains visible but disabled/greyed in Available).
- Remove: selected row → card enabled again in Available.
- Reorder: up/down arrows; overflow rows highlighted.
- Upload: icon-only arrow button on the right; hover text “Upload samples to device”.
- Revert: icon-only refresh button on the right; hover text “Revert to device”.
- Selected indices: 1..9 then 0; extra items show index “-” and are not uploaded.

Phases
1) Selection UI + reorder + upload/revert + device merge + record.json (W prefix added on fetch).
2) Pack Editor (per-loop view, MIDI DnD, preview/edit). Remove global preview box.
3) Optional enhancements (drag-and-drop ordering, richer styling, persistence).
