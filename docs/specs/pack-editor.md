## Pack Editor — Spec

Goals (updated)
- Full-page editor (not a modal/popover): shows its own header with Back and Save.
- Inspect and edit a single pack (15 loop slots) in a list view where loops can be re‑ordered.
- Create new user packs (U prefix + 7-char name) and save to local storage.
- Drag-and-drop or click-to-upload MIDI per loop; replace the file box with a compact piano‑roll preview when loaded.
- Per-loop preview using a basic sound engine; global editor controls for Sound Pack (e.g., 808, jazz, etc.) and BPM.
- Show per-loop and total pack size percentages estimated from device-reported pack size.
- Use same editor for existing packs (website/device/user); allow editing and saving as user-local.

Layout
- Header bar: Back (to Sample Manager), Title (Edit/Create), Save button.
- Toolbar: Sound Pack selector, BPM control, overall pack size indicator.
- List of 15 loops:
  - Each row: drag handle (or up/down arrows), index, per-loop play button, name/slot info, piano‑roll preview, replace/remove controls, size %.
  - Empty slot: upload/drop area; when loaded, hide the chooser and show the piano‑roll.

Data Model
- EditorState
  - id: string (8 ASCII) or null for new pack
  - name7: string (7 chars visible; full id = `U${name7}`)
  - loops: Array<LoopData|null> (15 slots)
  - bpm: number (default 120)
  - kit: string (e.g., "808", "jazz")
  - sizes: { perLoopBytes: number[], totalBytes: number, perLoopPercent: number[] }

Interactions
- Open via green ➕ (new) or ✎ on a pack (edit).
- Back: returns to Sample Manager (discard or confirm unsaved changes if needed).
- Save: stores as user-local pack (U prefix). For website/device packs, editing produces a user copy unless explicitly replacing a user pack.
- Per slot:
  - Drop/upload MIDI → parse → render piano‑roll → enable play.
  - Play/stop via row button using current kit+BPM.
  - Reorder via drag or up/down arrows.
  - Replace/remove loop.

Sound Engine
- Simple WebAudio engine with a small palette tied to kit selection.
- Schedules events with a lookahead scheduler; tempo from BPM.
- Mapping: drum MIDI notes → percussive sounds (kick/snare/hats/toms/cym).

Visualization
- Piano-roll mini view: horizontal rectangles per note, positioned by time_ticks_press/release.
- Scales to loop length; shows note density at a glance.

Size Estimation
- Use device-reported total pack size (from Sample Manager storage data) as ground truth reference when available.
- Estimate per-loop size by encoding loop chunks and computing bytes; compute percentages relative to the estimated total, clamped or renormalized to match device total when known.

Implementation Notes
- MIDI parsing: minimal SMF reader extracting note on/off by delta time; converts to LoopData using TICKS_PER_BEAT.
- Derive encoded size using the same packing as upload (samples_parser.encode) to estimate bytes.
- For website/device packs, preload loops into the editor; for user packs, use localStorage.

Out of Scope (current phase)
- Multi-sample audio or advanced synthesis engines.
- Cloud sync and sharing flows.
