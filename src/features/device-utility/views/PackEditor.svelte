<script>
  import { onMount, onDestroy } from 'svelte';
  import { editState, closePackEditor, setEditorLoopData, saveEditor, saveEditorAsNew, setEditorName7 } from '~/features/device-utility/states/edits.svelte';
  import { sampleParser_packSize, TICKS_PER_BEAT } from '~/lib/parsers/samples_parser';
  import { soundBackend } from '~/lib/soundBackend';
  import MidiEditor from '~/features/device-utility/views/MidiEditor.svelte';
  import MidiPreview from '~/features/device-utility/components/MidiPreview.svelte';
  import { computeLoopEndTicks } from '~/lib/music/loop_utils';
  import { parseMidiFile, indexLoopEvents, clampVelocity } from '~/features/device-utility/utils/midiUtils';
  import { validatePage, getSamplePack } from '~/features/device-utility/utils/samples';
  import { deviceSamplesState } from '~/lib/states/samples.svelte';
  import { SampleMode } from '~/lib/types/sampleMode';
  import NameBoxes from '~/features/device-utility/components/NameBoxes.svelte';
  import PackTypeBadge from "~/features/device-utility/components/PackTypeBadge.svelte";
  import JSONEditor from "~/features/device-utility/components/JSONEditor.svelte";
  import PlayStopButton from "~/features/device-utility/components/PlayStopButton.svelte";
  import { tickProviderSubscribe, tickProviderSetState, TickSubscriberState } from '~/lib/tickProvider';

  const slots = $derived(editState.loops);
  const modeState = $derived(deviceSamplesState.modes[deviceSamplesState.activeMode]);
  const previewChannel = $derived(() =>
    deviceSamplesState.activeMode === SampleMode.DRM ? 9 : 0
  );

  onMount(() => {
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch {}
  });

  // Local UI state for full-screen MIDI editor
  let midiEditor = $state({ open: false, index: -1 });

  let previewPlaybackId = 0;
  let previewSubscriber = null;
  let previewTickHandler = null;
  const previewPlayhead = $state({ idx: null, progress: 0 });

  function stopPreviewPlayback() {
    previewPlaybackId++;
    previewTickHandler = null;
    if (previewSubscriber) tickProviderSetState(previewSubscriber, TickSubscriberState.Inactive);
    previewPlayhead.idx = null;
    previewPlayhead.progress = 0;
    soundBackend.allNotesOff();
  }

  function openMidiEditorFor(index) {
    stopPreviewPlayback();
    midiEditor.open = true; midiEditor.index = index;
  }
  function closeMidiEditor() { midiEditor.open = false; midiEditor.index = -1; }

  function onFileChange(e, idx) {
    const file = e.target.files?.[0]; if (!file) return;
    parseMidiFile(file).then((loop) => {
      // Build a Page container if missing at slot 0
      let page = slots[0];
      if (!page) page = { name: `U-${editState.name7}`, loops: Array(15).fill(null) };
      page.loops[idx] = loop;
      setEditorLoopData(0, page);
    }).catch(() => { alert('Failed to parse MIDI'); });
  }

  function bytesFor(idx) {
    const page = slots[0]; if (!page) return 0;
    const tmp = { name: page.name, loops: Array(15).fill(null) };
    tmp.loops[idx] = page.loops[idx];
    return sampleParser_packSize(tmp);
  }

  function totalBytes() {
    const page = slots[0]; if (!page) return 0;
    return sampleParser_packSize(page);
  }
  function percentTotal() {
    const total = modeState.storageTotal || 0;
    if (!total) return '0.0';
    return ((totalBytes() / total) * 100).toFixed(1);
  }

  function percentFor(idx) {
    const total = modeState.storageTotal || 0;
    if (!total) return 0;
    const b = bytesFor(idx);
    return ((b / total) * 100).toFixed(1);
  }

  // ESC handling: close embedded MIDI editor if open; otherwise close PackEditor
  function onWindowKeydown(e) {
    if (e.key === 'Escape') {
      if (e.defaultPrevented) return; // allow inner dialogs to consume ESC
      if (importDialog.open) return; // JSONEditor open: let it handle
      e.preventDefault();
      if (midiEditor.open) closeMidiEditor();
      else closePackEditor();
    }
  }
  onMount(() => { window.addEventListener('keydown', onWindowKeydown); });
  onDestroy(() => {
    window.removeEventListener('keydown', onWindowKeydown);
    stopPreviewPlayback();
  });

  // Playback
  function loopSteps(loop) {
    if (!loop) return 0;
    const ticks = computeLoopEndTicks(loop);
    const beats = Math.max(1, Math.round(ticks / TICKS_PER_BEAT));
    return beats * 4;
  }

  function playIdx(idx) {
    if (previewPlayhead.idx === idx) {
      stopPreviewPlayback();
      return;
    }
    const page = slots[0]; if (!page) return;
    const loop = page.loops[idx]; if (!loop) return;
    stopPreviewPlayback();
    if (!previewSubscriber) previewSubscriber = tickProviderSubscribe(() => { previewTickHandler?.(); });
    const id = ++previewPlaybackId;
    const channel = previewChannel();
    const loopLengthTicks = computeLoopEndTicks(loop);
    const eventIndex = indexLoopEvents(loop, loopLengthTicks, 1);
    let currentTick = 0;
    previewPlayhead.idx = idx;
    previewPlayhead.progress = 0;
    previewTickHandler = () => {
      if (previewPlaybackId !== id) return;
      const tick = currentTick % eventIndex.loopLengthTicks;
      previewPlayhead.progress = eventIndex.loopLengthTicks ? tick / eventIndex.loopLengthTicks : 0;
      const ons = eventIndex.onByTick[tick] || [];
      for (const ev of ons) {
        soundBackend.noteOn(ev.note, clampVelocity(ev.velocity), channel);
      }
      const offs = eventIndex.offByTick[tick] || [];
      for (const ev of offs) {
        soundBackend.noteOff(ev.note, 0, channel);
      }
      currentTick = (currentTick + 1) % eventIndex.loopLengthTicks;
    };
    tickProviderSetState(previewSubscriber, TickSubscriberState.Active);
  }

  function move(idx, dir) {
    const page = slots[0]; if (!page) return;
    const j = idx + dir; if (j < 0 || j >= page.loops.length) return;
    const arr = [...page.loops]; const tmp = arr[idx]; arr[idx] = arr[j]; arr[j] = tmp;
    const updated = { ...page, loops: arr };
    setEditorLoopData(0, updated);
  }

  function deleteLoop(idx) {
    const page = slots[0]; if (!page) return;
    const arr = [...page.loops];
    arr[idx] = null;
    const updated = { ...page, loops: arr };
    setEditorLoopData(0, updated);
  }

  // Import raw JSON dialog
  let importDialog = $state({ open: false, json: {}, error: '', errors: [] });
  async function openImportDialog() {
    importDialog.open = true;
    importDialog.error = '';
    importDialog.errors = [];
    // Prefill with current JSON (same as View raw)
    try {
      if (slots[0]) {
        importDialog.json = JSON.parse(JSON.stringify(slots[0]));
      } else if (editState.id) {
        const page = await getSamplePack(editState.id, deviceSamplesState.activeMode);
        importDialog.json = page ?? {};
      } else {
        importDialog.json = {};
      }
    } catch (_) {
      importDialog.json = {};
    }
  }
  function closeImportDialog() { importDialog.open = false; }
  function normalizeLoops(input) {
    const loops = Array.isArray(input) ? input : [];
    const out = Array(15).fill(null);
    for (let i = 0; i < Math.min(15, loops.length); i++) out[i] = loops[i] ?? null;
    return out;
  }
  async function doImportRaw() {
    try {
      importDialog.error = '';
      importDialog.errors = [];
      const obj = importDialog.json || {};
      const loops = Array.isArray(obj) ? obj : (Array.isArray(obj?.loops) ? obj.loops : null);
      if (!loops) throw new Error('Expected an array of loops or an object with a "loops" array');
      const currentName = slots[0]?.name || `U-${editState.name7}`;
      const page = { name: currentName, loops: normalizeLoops(loops) };
      // Validate using central validator
      const uiId = editState.id ?? `U-${(editState.name7 || 'NONAME').slice(0,7)}`;
      const errs = validatePage(uiId, page) || [];
      if (errs.length > 0) {
        importDialog.errors = errs;
        return; // keep dialog open
      }
      setEditorLoopData(0, page);
      importDialog.open = false;
    } catch (e) {
      importDialog.error = (e && e.message) ? e.message : 'Invalid JSON input';
    }
  }
</script>

{#if !midiEditor.open}
  <div class="page">
  <div class="header">
    <div class="left">
      <button class="icon" title="Back" aria-label="Back" onclick={closePackEditor}>←</button>
      <h2>{editState.id ? 'Edit Pack' : 'Create Pack'}</h2>
      {#if editState.id}
        <PackTypeBadge id={editState.id} />
      {/if}
    </div>
    <div class="actions">
      <button class="button-link" onclick={openImportDialog}>View raw</button>
      {#if editState.id && editState.id.startsWith('L-')}
        <button onclick={saveEditor} class:primary={editState.unsaved} class:attention={editState.unsaved}>Save</button>
      {:else}
        <button onclick={saveEditorAsNew} class:primary={editState.unsaved || !editState.id} class:attention={editState.unsaved || !editState.id}>Save As New Pack</button>
      {/if}
    </div>
  </div>
  {#if editState.unsaved}
    <div class="unsaved">You have unsaved changes</div>
  {/if}
  {#if editState.errors?.length}
    <div class="errors">
      {#each editState.errors as e}
        <div class="error">{e}</div>
      {/each}
    </div>
  {/if}
  <div class="toolbar settings">
    <div class="namer">
      <label for="pack-name">Name</label>
      <input id="pack-name" maxlength="7" bind:value={editState.name7} placeholder="MYPACK" oninput={(e)=>{ const v=e.target.value||''; if (/[^\x20-\x7E]/.test(v)) { e.target.value = v.replace(/[^\x20-\x7E]/g,''); setEditorName7(e.target.value); } else { setEditorName7(v); } }} />
      <NameBoxes value={editState.name7} />
      <span class="hint">ASCII, up to 7 characters</span>
    </div>
    <!-- meta removed during migration -->
    <div class="bytes">Total: {totalBytes()} bytes ({percentTotal()}%)</div>
  </div>
  <div class="tip">Drag and drop MIDI files into the slots or click to open the MIDI editor.</div>
  <div class="list">
    {#each Array(15) as _, idx}
      {@const loop = slots[0]?.loops?.[idx]}
      <div class="row">
        <div class="idx">{idx+1}</div>
        <div class="play">
          <PlayStopButton
            playing={previewPlayhead.idx === idx}
            onToggle={() => playIdx(idx)}
          />
        </div>
        <div class="content">
          {#if loop}
            <div class="preview-stack">
              <MidiPreview class="clickable" {loop} playhead={previewPlayhead.idx === idx ? previewPlayhead.progress : null} onOpen={() => openMidiEditorFor(idx)} />
            </div>
          {:else}
            <div class="drop">
              <input type="file" accept=".mid,.midi" onchange={(e)=>onFileChange(e, idx)} />
              <div class="actions">
                <button class="btn primary" onclick={() => openMidiEditorFor(idx)}>Open MIDI editor</button>
              </div>
              <div class="hint">You can also compose directly in the editor — no MIDI file required.</div>
            </div>
          {/if}
        </div>
        <div class="metrics">
          <span class="bytes">{percentFor(idx)}%</span>
          {#if loop}
            <span class="steps">{loopSteps(loop)} steps</span>
          {/if}
        </div>
        <div class="reorder">
          <button class="btn icon-btn intent-move" title="Move up" aria-label="Move up" onclick={() => move(idx, -1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 19V5"></path>
              <path d="M5 12l7-7 7 7"></path>
            </svg>
            <span class="sr-only">Move up</span>
          </button>
          <button class="btn icon-btn intent-move" title="Move down" aria-label="Move down" onclick={() => move(idx, 1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14"></path>
              <path d="M5 12l7 7 7-7"></path>
            </svg>
            <span class="sr-only">Move down</span>
          </button>
          <button class="btn icon-btn intent-edit" title="Edit" aria-label="Edit" onclick={() => openMidiEditorFor(idx)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
            </svg>
            <span class="sr-only">Edit</span>
          </button>
          <button class="btn icon-btn intent-delete" title="Delete" aria-label="Delete" onclick={() => deleteLoop(idx)} disabled={!slots[0]?.loops?.[idx]}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 6h18"></path>
              <path d="M8 6V4h8v2"></path>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
              <path d="M10 11v6"></path>
              <path d="M14 11v6"></path>
            </svg>
            <span class="sr-only">Delete</span>
          </button>
        </div>
      </div>
    {/each}
  </div>
</div>
{:else}
  <div class="embedded-editor">
    <MidiEditor index={midiEditor.index} close={closeMidiEditor} />
  </div>
{/if}

{#if importDialog.open}
  <JSONEditor json={importDialog.json} onSave={(o)=>{ importDialog.json=o; doImportRaw(); }} onClose={closeImportDialog} />
{/if}

<style>
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  max-width: var(--du-maxw, 1100px);
  margin: 0 auto;
  --pe-radius: 6px;
  --pe-action-move-bg: #f3f4f6;
  --pe-action-move-border: #d1d5db;
  --pe-action-move-text: #374151;
  --pe-action-edit-bg: #fff2cc;
  --pe-action-edit-border: #e5c566;
  --pe-action-edit-text: #7a5d00;
  --pe-action-delete-bg: #ffecec;
  --pe-action-delete-border: #ffc1c1;
  --pe-action-delete-text: #a40000;
}
.header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--du-border); padding-bottom: 8px; }
.header .left { display: flex; align-items: center; gap: 10px; }
.header .left h2 { position: relative; padding-bottom: 6px; }
.header .left h2::after { content: ""; position: absolute; left: 0; bottom: 0; width: 120px; height: 3px; background: #2f313a; }
.icon { width: 36px; height: 36px; border-radius: var(--pe-radius); display: inline-flex; align-items: center; justify-content: center; }
.actions { display: flex; gap: 8px; }
.unsaved { margin-top: 8px; background: repeating-linear-gradient(45deg, #FFFEAC, #FFFEAC 6px, #f1ea7d 6px, #f1ea7d 12px); color: #3a3200; border: 1px solid #b3ac5a; padding: 6px 8px; border-radius: var(--pe-radius); font-weight: 700; }
.button-link { display:inline-flex; align-items:center; justify-content:center; padding:6px 10px; border:1px solid #2f313a; border-radius:var(--pe-radius); background:#f2f3f5; color:inherit; text-decoration:none; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
.primary { background: #2b2f36; color: #fff; border: 1px solid #1f2329; }
.attention { animation: upload-bounce 1.1s ease-in-out infinite; }
@keyframes upload-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
.toolbar { display:flex; gap: 16px; align-items: center; }
.settings { background: #fafafa; border: 1px solid var(--du-border); border-radius: var(--pe-radius); padding: 10px; }
.namer { display: flex; gap: 6px; align-items: center; }
.namer .hint { color:var(--du-muted); font-size: 0.85em; }
.list { display: flex; flex-direction: column; gap: 8px; }
.row { display: grid; grid-template-columns: 40px 80px 1fr 120px auto; align-items: center; gap: 8px; border: 1px solid #2f313a; border-radius: var(--pe-radius); padding: 10px; background: #fcfcfd; box-shadow: none; }
.idx {
  text-align: center;
  background: #111827;
  color: #fff;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid #000;
  border-radius: var(--pe-radius);
}
.drop { border: 1px dashed #2f313a; border-radius: var(--pe-radius); padding: 6px 8px; display: flex; align-items: center; gap: 8px; background: #fcfcfc; height: 50px; }
.drop input[type="file"] { flex: 1; }
.drop .actions { margin-top: 0; }
.drop .hint { display: none; }
.hint { color: #777; font-size: 0.9em; }
.content { min-height: 50px; display: flex; min-width: 0; }
input[type="file"] { width: 100%; }
.tip { margin-top: 4px; color: var(--du-muted); font-size: 0.92em; }
.preview-stack { display:flex; flex-direction: column; gap: 6px; width: 100%; }
.preview-stack :global(svg.pianoroll) { height: 50px; }
.preview-stack :global(svg.pianoroll) {
  border: 2px solid #111; /* black border to indicate interactivity */
  cursor: pointer;
  transition: box-shadow 120ms ease, transform 80ms ease;
  background: #f8fafc;
}
.preview-stack :global(svg.pianoroll:hover) {
  box-shadow: 0 2px 0 0 #111;
}
.preview-stack :global(svg.pianoroll:active) {
  transform: translateY(1px);
}
.metrics { display: flex; gap: 8px; justify-content: flex-end; align-items: center; text-align: right; }
.steps { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #4b5563; }
.drop .actions { display:flex; gap: 8px; margin-top: 8px; }

/* Small industrial buttons */
.btn { border: 1px solid #2f313a; background: #f2f3f5; color: #111827; border-radius: var(--pe-radius); padding: 6px 8px; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
.btn:hover { background: #e9ebee; }
.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; padding: 0; }
.icon-btn svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.icon-btn.intent-move { background: var(--pe-action-move-bg); border-color: var(--pe-action-move-border); color: var(--pe-action-move-text); }
.icon-btn.intent-edit { background: var(--pe-action-edit-bg); border-color: var(--pe-action-edit-border); color: var(--pe-action-edit-text); }
.icon-btn.intent-delete { background: var(--pe-action-delete-bg); border-color: var(--pe-action-delete-border); color: var(--pe-action-delete-text); }
.icon-btn.intent-move:hover { background: #e5e7eb; }
.icon-btn.intent-edit:hover { background: #ffecb3; }
.icon-btn.intent-delete:hover { background: #ffd7d7; }
.icon-btn:disabled { background: #f3f4f6; color: #9ca3af; border-color: #e5e7eb; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.reorder { display: flex; gap: 6px; justify-content: flex-end; }
.play { display: flex; }

/* Modal reused styles */
.error { color: var(--du-danger); background:#ffecec; border:1px solid #ffc1c1; padding:4px 8px; border-radius: var(--pe-radius); }
.errors { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
/* Embedded MIDI editor container */
.embedded-editor { margin-top: 8px; display: flex; justify-content: center; width: 100%; overflow-x: hidden; }

@media (max-width: 900px) {
  .page { padding: 12px; max-width: 100%; }
  .header { flex-wrap: wrap; align-items: flex-start; gap: 10px; }
  .actions { flex-wrap: wrap; }
  .toolbar { flex-direction: column; align-items: stretch; gap: 10px; }
  .namer { flex-wrap: wrap; }
  .row { grid-template-columns: 28px 32px minmax(0, 1fr) 64px auto; align-items: center; gap: 6px; padding: 8px; }
  .metrics { justify-content: flex-start; text-align: left; white-space: nowrap; font-size: 11px; }
  .reorder { justify-content: flex-start; flex-wrap: nowrap; gap: 4px; }
  .drop { flex-direction: row; align-items: center; height: 44px; gap: 6px; padding: 4px 6px; flex-wrap: nowrap; }
  .drop input[type="file"] { min-width: 0; font-size: 11px; }
  .drop .actions { margin-top: 0; }
  .drop .actions .btn { padding: 4px 6px; font-size: 11px; }
  .drop .hint { display: none; }
  .row .icon-btn { width: 28px; height: 28px; }
  .embedded-editor { justify-content: stretch; }
}

@media (max-width: 600px) {
  .button-link, .btn { padding: 6px 8px; font-size: 11px; }
}
</style>
