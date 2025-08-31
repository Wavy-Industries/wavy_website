## Sample Manager — concise spec

Goals
- Curate top 10 slots (1..9,0). Reorder, add/remove from Available.
- Stage content changes locally; explicit Upload to apply to device.
- Clear and correct sync status between local (website/user) and device.

Identity
- UI IDs: `W-<NAME7>`, `P-<NAME7>`, `U-<NAME7>`; device page names: `<W|P|U><NAME7 padded>`.
- Canonical key: `TYPE|BASENAME7` for comparisons and diffs.

Data sources
- Website JSON for official/public packs.
- Device: IDs/space; single-flight download of current pack pages.
- Local user packs in `localStorage`.

State
- `selected`, `deviceSelected`, `available`, `userPacks`.
- `stagedDeviceContent`, `diffs`, `dirty` (IDs differ or `contentDirty`).

Single-flight downloads
- Guard device downloads to prevent concurrent calls; force refresh after Upload/Revert.

Editing
- Editor uses a dedicated store. Always “Save As New Pack” for non-user packs; saving from Selected stages to device (no write to local unless Save As).
- In Selected list, replace “Edit”/“Push down” with a single “Mutate” action.

Sync semantics
- Diff compares canonicalized loops only (15 slots). Status: `in_sync`, `local_newer`, `device_newer`, `diverged`.
- After Reset to default or Upload/Revert, recompute diffs using fresh device pages.

Validation
- Name: 1–7 ASCII chars. Validate content and storage fit before upload.

Error handling
- Show validation errors; prevent concurrent device downloads; update `dirty` correctly.

Validation & Errors
- Validate name: 1–7 chars, enforce acceptable charset; normalize to uppercase.
- Validate content: `validatePage`/`validatePack`, including storage limits.
- Errors: name collision on Save As New; invalid loops; storage overflow; missing content for selected IDs prior to upload.

Data Layer Restructure
- Replace ad‑hoc `website.ts` usage with a structured data module:
  - `data/sources/website.ts`: load website index and fetch page by `W-/P-` ID.
  - `data/sources/device.ts`: get IDs/space and download current `SamplePack`.
  - `data/sources/local.ts`: read/write `localStorage` packs; enforce uniqueness; provide canonicalized content for comparisons.
  - `data/index.ts`: orchestrates loading sequences and diff computation.
- `stores/samples.svelte.ts` focuses on state and actions; it should not embed network/storage specifics beyond calling the sources layer.

Practical Implementation Plan
- State
  - Add `editor.unsaved` and `diffs` map; add helpers for canonical key and hash.
  - Add a `stagedDeviceContent` map keyed by canonical key to hold temporary device‑side edits prior to upload.
- Editor
  - Stop auto‑saving in `setEditorLoopData`; instead set `editor.unsaved=true` and update a local `editor.stagedPage` (slot 0).
  - Save → persist local U‑pack; Save As → create new U‑pack; ensure uniqueness.
  - When editing from Selected, Save only updates `stagedDeviceContent` and sets `contentDirty=true` (does not write to local packs unless user chooses Save As).
- Sync actions
  - Selected: “Sync from local” copies from local U-/W-/P- source into `stagedDeviceContent`; “Sync to local” writes device content into a U‑pack (creating if needed).
  - Available: mirror the two directions; operate on local storage and `stagedDeviceContent` accordingly.
- Load sequence
  - On connect: ensure samples, refresh IDs/space, download once, compute device hashes, then load website index and user packs, and compute diffs.
- Performance
  - Lazy fetch website content only when needed for diff or preview; cache in memory for the session.

UI Details
- Selected list
  - Show slot indices 1..9,0; overflow rows have index “–” and red styling.
  - For out‑of‑sync items: show a compact status and two small buttons for sync directions; disable actions during upload.
  - Edit button opens editor in “device context” (staging device changes).
- Available list
  - Show metadata (author • created) when available.
  - Edit uses “local context” (no device staging); W-/P- forces “Save As New Pack”.
- Global banners
  - “Unsaved changes” in editor when `editor.unsaved`.
  - “You have unapplied changes to device” in Sample Manager when `dirty`.

Testing Checklist
- Load without device packs → default uploaded once, lists populate, no diffs.
- Edit W‑pack from Available → Save As New enforced; name collision error works.
- Edit U‑pack from Available → Save applies locally; selected dirty toggles when selected includes the edited pack.
- Edit from Selected → Save updates staged device content; dirty and contentDirty toggle; Upload applies and clears.
- Sync buttons apply correct direction and update diffs without side effects.
- Revert restores selected from device and clears contentDirty.

Notes
- We intentionally allow a local U‑pack with the same 7‑char name as a W/P pack; we disambiguate by prefix and source, and compare via canonical key.
- All hashing ignores name formatting differences (hyphen/padding) to focus on content equivalence.
