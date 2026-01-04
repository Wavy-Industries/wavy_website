<script>
  import { onMount, onDestroy } from 'svelte';
  import { editState, closePackEditor, setEditorLoopData, saveEditor, saveEditorAsNew, setEditorName7 } from '~/features/device-utility/states/edits.svelte';
  import { sampleParser_packSize } from '~/lib/parsers/samples_parser';
  import { parseMidiToLoop } from '~/lib/parsers/midi_parser';
  import { soundBackend } from '~/lib/soundBackend';
  import MidiEditor from '~/features/device-utility/views/MidiEditor.svelte';
  import MidiPreview from '~/features/device-utility/components/MidiPreview.svelte';
  import { tempoState } from '~/features/device-utility/states/tempo.svelte';
  import { validatePage, getSamplePack } from '~/features/device-utility/utils/samples';
  import { deviceSamplesState } from '~/lib/states/samples.svelte';
  import NameBoxes from '~/features/device-utility/components/NameBoxes.svelte';
  import PackTypeBadge from "~/features/device-utility/components/PackTypeBadge.svelte";
  import JSONEditor from "~/features/device-utility/components/JSONEditor.svelte";

  const slots = $derived(editState.loops);
  const modeState = $derived(deviceSamplesState.modes[deviceSamplesState.activeMode]);

  onMount(() => {
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch {}
  });

  // Local UI state for full-screen MIDI editor
  let midiEditor = $state({ open: false, index: -1 });
  function openMidiEditorFor(index) {
    midiEditor.open = true; midiEditor.index = index;
  }
  function closeMidiEditor() { midiEditor.open = false; midiEditor.index = -1; }

  function onFileChange(e, idx) {
    const file = e.target.files?.[0]; if (!file) return;
    file.arrayBuffer().then((buf) => {
      try {
        const { loop } = parseMidiToLoop(buf);
        // Build a Page container if missing at slot 0
        let page = slots[0];
        if (!page) page = { name: `U-${editState.name7}`, loops: Array(15).fill(null) };
        page.loops[idx] = loop;
        setEditorLoopData(0, page);
      } catch (err) { alert('Failed to parse MIDI'); }
    });
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
  onDestroy(() => { window.removeEventListener('keydown', onWindowKeydown); });

  // Playback
  const engine = soundBackend;
  function playIdx(idx) {
    const page = slots[0]; if (!page) return;
    const loop = page.loops[idx]; if (!loop) return;
    engine.allNotesOff();
    const bpm = tempoState.bpm || 120;
    const msPerBeat = (60 / Math.max(1, Math.min(999, bpm))) * 1000;
    const startMs = performance.now() + 20;
    for (const ev of loop.events) {
      const onAt = startMs + (ev.time_ticks_press / 24) * msPerBeat;
      const offTicks = (ev.time_ticks_release ?? (ev.time_ticks_press + 1));
      const offAt = startMs + (offTicks / 24) * msPerBeat;
      const vel = Math.max(0, Math.min(127, ev.velocity ?? 100));
      setTimeout(() => engine.noteOn(ev.note, vel, 9), Math.max(0, onAt - performance.now()));
      setTimeout(() => engine.noteOff(ev.note, 0, 9), Math.max(0, offAt - performance.now()));
    }
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
        <button onclick={saveEditor} class="primary">Save</button>
      {:else}
        <button onclick={saveEditorAsNew} class="primary">Save As New Pack</button>
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
  <div class="tip">Tip: You can edit notes directly in the built-in Piano Roll — no MIDI file needed.</div>
  <div class="list">
    {#each Array(15) as _, idx}
      <div class="row">
        <div class="idx">{idx+1}</div>
        <div class="play">
          <button class="btn" title="Play" onclick={() => playIdx(idx)}>Play</button>
        </div>
        <div class="content">
          {#if slots[0]?.loops?.[idx]}
            {@const loop = slots[0].loops[idx]}
            <div class="preview-stack">
              <MidiPreview class="clickable" {loop} onOpen={() => openMidiEditorFor(idx)} />
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
        <div class="bytes">{percentFor(idx)}%</div>
        <div class="reorder">
          <button class="btn" onclick={() => move(idx, -1)}>Move up</button>
          <button class="btn" onclick={() => move(idx, 1)}>Move down</button>
          <button class="btn" onclick={() => deleteLoop(idx)} disabled={!slots[0]?.loops?.[idx]}>Delete</button>
        </div>
      </div>
    {/each}
  </div>
</div>
{:else}
  <div class="embedded-editor">
    <MidiEditor index={midiEditor.index} page={slots[0]} pageIndex={0} pageId={editState.id} close={closeMidiEditor} onback={closeMidiEditor} />
  </div>
{/if}

{#if importDialog.open}
  <JSONEditor json={importDialog.json} onSave={(o)=>{ importDialog.json=o; doImportRaw(); }} onClose={closeImportDialog} />
{/if}

<style>
.page { display: flex; flex-direction: column; gap: 12px; padding: 16px; max-width: var(--du-maxw, 1100px); margin: 0 auto; }
.header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--du-border); padding-bottom: 8px; }
.header .left { display: flex; align-items: center; gap: 10px; }
.header .left h2 { position: relative; padding-bottom: 6px; }
.header .left h2::after { content: ""; position: absolute; left: 0; bottom: 0; width: 120px; height: 3px; background: #2f313a; }
.icon { width: 36px; height: 36px; border-radius: var(--du-radius); display: inline-flex; align-items: center; justify-content: center; }
.actions { display: flex; gap: 8px; }
.unsaved { margin-top: 8px; background: repeating-linear-gradient(45deg, #FFFEAC, #FFFEAC 6px, #f1ea7d 6px, #f1ea7d 12px); color: #3a3200; border: 1px solid #b3ac5a; padding: 6px 8px; border-radius: var(--du-radius); font-weight: 700; }
.button-link { display:inline-flex; align-items:center; justify-content:center; padding:6px 10px; border:1px solid #2f313a; border-radius:var(--du-radius); background:#f2f3f5; color:inherit; text-decoration:none; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
.primary { background: #2b2f36; color: #fff; border: 1px solid #1f2329; }
.toolbar { display:flex; gap: 16px; align-items: center; }
.settings { background: #fafafa; border: 1px solid var(--du-border); border-radius: var(--du-radius); padding: 10px; }
.namer { display: flex; gap: 6px; align-items: center; }
.namer .hint { color:var(--du-muted); font-size: 0.85em; }
.list { display: flex; flex-direction: column; gap: 8px; }
.row { display: grid; grid-template-columns: 40px 80px 1fr 120px auto; align-items: center; gap: 8px; border: 1px solid #2f313a; border-radius: var(--du-radius); padding: 10px; background: #fcfcfd; box-shadow: none; }
.drop { border: 1px dashed #2f313a; border-radius: var(--du-radius); padding: 12px; display: grid; place-items: center; background: #fcfcfc; }
.hint { color: #777; font-size: 0.9em; }
.content { min-height: 120px; display: flex; }
input[type="file"] { width: 100%; }
.tip { margin-top: 4px; color: var(--du-muted); font-size: 0.92em; }
.preview-stack { display:flex; flex-direction: column; gap: 6px; width: 100%; }
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
.drop .actions { display:flex; gap: 8px; margin-top: 8px; }

/* Small industrial buttons */
.btn { border: 1px solid #2f313a; background: #f2f3f5; color: #111827; border-radius: var(--du-radius); padding: 6px 8px; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
.btn:hover { background: #e9ebee; }
.reorder { display: flex; gap: 6px; justify-content: flex-end; }
.play { display: flex; }

/* Modal reused styles */
.error { color: var(--du-danger); background:#ffecec; border:1px solid #ffc1c1; padding:4px 8px; border-radius:6px; }
.errors { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
/* Embedded MIDI editor container */
.embedded-editor { margin-top: 8px; display: flex; justify-content: center; width: 100%; overflow-x: hidden; }
</style>
