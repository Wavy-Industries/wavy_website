## Pack Editor — Spec

Goals
- Unified view to inspect and edit a single pack (15 loop slots).
- Create new user packs (U prefix + 7-char name) and save to local storage.
- Drag-and-drop or click-to-upload MIDI per loop.
- Per-loop preview via simple WebAudio engine; basic MIDI visualization.
- Show per-loop byte size and total pack size.
- Use same editor for existing packs (website/device/user); allow editing and saving as user-local.

Data Model
- EditorState
  - id: string (8 ASCII) or null for new pack
  - name7: string (7 chars visible; full id = `U${name7}`)
  - loops: Array<LoopData|null> (15 slots)
  - bpm: number (default 120), play state
  - sizes: { perLoopBytes: number[], totalBytes: number }

Interactions
- Open editor via green ➕ (new) or ✎ on a pack (edit/inspect).
- Set name (7 chars); validate; compute full id.
- For each of 15 slots:
  - Drop MIDI or click to choose; parse to LoopData.
  - Play/stop single loop; visualize notes.
  - Remove/replace loop.
- Save: stores in localStorage; updates Available/User packs and enables selection/upload.

Implementation Notes
- MIDI parsing: minimal parser extracting note-on/off for drum events; convert to LoopData.
- Visualization: simple piano-roll bars for timing; no advanced UI needed.
- Audio: WebAudio scheduler with basic percussive tick or simple synth.
- Size computation: derive encoded bytes using the same packing as upload.
- Reuse view for website/device packs by preloading their Page into editor.

Out of Scope (for now)
- Multi-sample audio synthesis; advanced editing tools.
- Cloud sync.
