<script>
  import { sampleState, closePackEditor, setEditorLoopData, saveEditorAsUserPack } from '~/features/device-utility/stores/samples.svelte';
  import { getPageByteSize } from '~/lib/parsers/samples_parser';
  import { parseMidiToLoop } from '~/lib/parsers/midi_parser';
  import { soundBackend } from '~/lib/soundBackend';
  import MidiEditor from '~/features/device-utility/views/midi/MidiEditor.svelte';
  import { tempoState } from '~/features/device-utility/stores/tempo.svelte';
  import { validatePage as validatePackPage } from '~/features/device-utility/validation/packs';
  import { packDisplayName } from '~/features/device-utility/utils/packs';
  import { computeLoopEndTicks } from '~/lib/music/loop_utils';

  const slots = $derived(sampleState.editor.loops);
  const name7 = $derived(sampleState.editor.name7);

  // Local UI state for full-screen MIDI editor
  let midiEditor = $state({ open: false, index: -1 });
  function openMidiEditorFor(index) {
    // Ensure page scaffold exists
    let page = slots[0];
    if (!page) page = { name: `U-${sampleState.editor.name7 || 'NONAME'}`.slice(0, 8), loops: Array(15).fill(null) };
    // Ensure loop placeholder exists
    if (!page.loops[index]) page.loops[index] = { length_beats: 16, events: [] };
    setEditorLoopData(0, page);
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
        if (!page) page = { name: `U-${sampleState.editor.name7}`, loops: Array(15).fill(null) };
        page.loops[idx] = loop;
        setEditorLoopData(0, page);
      } catch (err) { alert('Failed to parse MIDI'); }
    });
  }

  function bytesFor(idx) {
    const page = slots[0]; if (!page) return 0;
    const tmp = { name: page.name, loops: Array(15).fill(null) };
    tmp.loops[idx] = page.loops[idx];
    return getPageByteSize(tmp);
  }

  function totalBytes() {
    const page = slots[0]; if (!page) return 0;
    return getPageByteSize(page);
  }
  function percentTotal() {
    const total = sampleState.storageTotal || 0;
    if (!total) return '0.0';
    return ((totalBytes() / total) * 100).toFixed(1);
  }

  function percentFor(idx) {
    const total = sampleState.storageTotal || 0;
    if (!total) return 0;
    const b = bytesFor(idx);
    return ((b / total) * 100).toFixed(1);
  }

  function getBounds(loop) {
    const w = 300, h = 48;
    if (!loop || !loop.events || loop.events.length === 0) return { w, h, minN: 0, maxN: 1, rangeN: 1, minT: 0, maxT: 1, rangeT: 1 };
    let minN = Infinity, maxN = -Infinity, minT = 0, maxT = computeLoopEndTicks(loop);
    for (const ev of loop.events) { if (ev.note < minN) minN = ev.note; if (ev.note > maxN) maxN = ev.note; }
    const rangeN = Math.max(1, maxN - minN + 1);
    const rangeT = Math.max(1, maxT - minT);
    return { w, h, minN, maxN, rangeN, minT, maxT, rangeT };
  }

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
  let importDialog = $state({ open: false, text: '', error: '', errors: [] });
  async function openImportDialog() {
    importDialog.open = true;
    importDialog.error = '';
    importDialog.errors = [];
    // Prefill with current JSON (same as View raw)
    try {
      if (slots[0]) {
        importDialog.text = JSON.stringify(slots[0], null, 2);
      } else if (sampleState.editor.id) {
        const { getPackPageById } = await import('~/features/device-utility/stores/samples.svelte');
        const page = await getPackPageById(sampleState.editor.id);
        importDialog.text = JSON.stringify(page ?? {}, null, 2);
      } else {
        importDialog.text = '{}';
      }
    } catch (_) {
      importDialog.text = '{}';
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
      const obj = JSON.parse(importDialog.text || '');
      const loops = Array.isArray(obj) ? obj : (Array.isArray(obj?.loops) ? obj.loops : null);
      if (!loops) throw new Error('Expected an array of loops or an object with a "loops" array');
      const currentName = slots[0]?.name || `U-${sampleState.editor.name7}`;
      const page = { name: currentName, loops: normalizeLoops(loops) };
      // Validate using central validator
      const uiId = sampleState.editor.id ?? `U-${(sampleState.editor.name7 || 'NONAME').slice(0,7)}`;
      const errs = validatePackPage(uiId, page) || [];
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

<div class="page">
  <div class="header">
    <div class="left">
      <button class="icon" title="Back" aria-label="Back" onclick={closePackEditor}>←</button>
      <h2>{sampleState.editor.id ? 'Edit Pack' : 'Create Pack'}</h2>
    </div>
    <div class="actions">
      <button class="button-link" onclick={openImportDialog}>Import raw</button>
      <button onclick={saveEditorAsUserPack} class="primary">Save</button>
    </div>
  </div>
  <div class="toolbar settings">
    <div class="namer">
      <label>Name</label>
      <input maxlength="7" bind:value={sampleState.editor.name7} placeholder="MYPACK" oninput={(e)=>{ const v=e.target.value||''; if (/[^\x20-\x7E]/.test(v)) { e.target.value = v.replace(/[^\x20-\x7E]/g,''); sampleState.editor.name7 = e.target.value; } }} />
      <span class="hint">ASCII, up to 7 characters</span>
    </div>
    {#if sampleState.editor.id}
      {@const meta = sampleState.available.find(p => p.id === sampleState.editor.id)}
      {#if meta?.author || meta?.created}
        <div class="meta">by {meta?.author}</div>
      {/if}
    {/if}
    <div class="bytes">Total: {totalBytes()} bytes ({percentTotal()}%)</div>
  </div>
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
            {@const bounds = getBounds(loop)}
            <svg class="pianoroll clickable" viewBox={`0 0 ${bounds.w} ${bounds.h}`} preserveAspectRatio="none" onclick={() => openMidiEditorFor(idx)}>
              {#each loop.events as ev}
                {@const x = (ev.time_ticks_press - bounds.minT) / bounds.rangeT * bounds.w}
                {@const w = Math.max(1, (ev.time_ticks_release - ev.time_ticks_press) / bounds.rangeT * bounds.w)}
                {@const y = (bounds.maxN - ev.note) / bounds.rangeN * bounds.h}
                <rect x={x} y={y} width={w} height={Math.max(1, bounds.h / Math.max(1,bounds.rangeN))} fill="#4a90e2" />
              {/each}
            </svg>
          {:else}
            <div class="drop">
              <input type="file" accept=".mid,.midi" onchange={(e)=>onFileChange(e, idx)} />
              <div class="hint">Drop MIDI or click to choose — or <a href="#" onclick={(e)=>{e.preventDefault(); openMidiEditorFor(idx);}}>open editor</a></div>
            </div>
          {/if}
        </div>
        <div class="bytes">{bytesFor(idx)} bytes ({percentFor(idx)}%)</div>
        <div class="reorder">
          <button class="btn" onclick={() => move(idx, -1)}>Move up</button>
          <button class="btn" onclick={() => move(idx, 1)}>Move down</button>
          <button class="btn" onclick={() => deleteLoop(idx)} disabled={!slots[0]?.loops?.[idx]}>Delete</button>
        </div>
      </div>
    {/each}
  </div>
</div>

{#if midiEditor.open}
  <MidiEditor index={midiEditor.index} close={closeMidiEditor} onback={closeMidiEditor} />
{/if}

{#if importDialog.open}
  <div class="modal-backdrop" onclick={closeImportDialog}>
    <div class="modal" onclick={(e)=>e.stopPropagation()}>
      <div class="modal-header">
        <div class="title">Import raw JSON</div>
        <button class="icon" onclick={closeImportDialog}>✕</button>
      </div>
      <div class="modal-body padded">
        <textarea class="json-input" bind:value={importDialog.text} placeholder='Paste loops array or an object with a "loops" array'></textarea>
        {#if importDialog.error}
          <div class="error">{importDialog.error}</div>
        {/if}
        {#if importDialog.errors.length}
          <div class="errors">
            {#each importDialog.errors as e}
              <div class="error">{e}</div>
            {/each}
          </div>
        {/if}
      </div>
      <div class="modal-actions">
        <button class="button-link" onclick={doImportRaw}>Import</button>
        <button class="button-link" onclick={closeImportDialog}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
.page { display: flex; flex-direction: column; gap: 12px; padding: 16px; max-width: var(--du-maxw, 1100px); margin: 0 auto; }
.header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--du-border); padding-bottom: 8px; }
.header .left { display: flex; align-items: center; gap: 10px; }
.header .left h2 { position: relative; padding-bottom: 6px; }
.header .left h2::after { content: ""; position: absolute; left: 0; bottom: 0; width: 120px; height: 3px; background: #2f313a; }
.icon { width: 36px; height: 36px; border-radius: var(--du-radius); display: inline-flex; align-items: center; justify-content: center; }
.sub { color: var(--du-muted); font-size: 0.9em; }
.actions { display: flex; gap: 8px; }
.button-link { display:inline-flex; align-items:center; justify-content:center; padding:6px 10px; border:1px solid #2f313a; border-radius:var(--du-radius); background:#f2f3f5; color:inherit; text-decoration:none; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
.primary { background: #2b2f36; color: #fff; border: 1px solid #1f2329; }
.toolbar { display:flex; gap: 16px; align-items: center; }
.settings { background: #fafafa; border: 1px solid var(--du-border); border-radius: var(--du-radius); padding: 10px; }
.namer, .kit, .bpm { display: flex; gap: 6px; align-items: center; }
.namer .hint { color:var(--du-muted); font-size: 0.85em; }
.meta { color: var(--du-muted); }
.list { display: flex; flex-direction: column; gap: 8px; }
.row { display: grid; grid-template-columns: 40px 80px 1fr 120px auto; align-items: center; gap: 8px; border: 1px solid #2f313a; border-radius: var(--du-radius); padding: 10px; background: #fcfcfd; box-shadow: none; }
.muted { color: #888; font-size: 0.85em; }
.drop { border: 1px dashed #2f313a; border-radius: var(--du-radius); padding: 12px; display: grid; place-items: center; background: #fcfcfc; }
.hint { color: #777; font-size: 0.9em; }
.content { min-height: 120px; display: flex; }
.pianoroll { background: #f7f7f7; border-radius: var(--du-radius); padding: 6px; font-size: 0.9em; height: 100%; width: 100%; display: flex; align-items: center; }
.pianoroll.clickable { cursor: pointer; }
input[type="file"] { width: 100%; }

/* Small industrial buttons */
.btn { border: 1px solid #2f313a; background: #f2f3f5; color: #111827; border-radius: var(--du-radius); padding: 6px 8px; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
.btn:hover { background: #e9ebee; }
.reorder { display: flex; gap: 6px; justify-content: flex-end; }
.play { display: flex; }

/* Modal reused styles */
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display: grid; place-items: center; z-index: 1000; padding: 12px; }
.modal { background: white; border-radius: var(--du-radius); border: 1px solid var(--du-border); width: min(800px, 90vw); max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: var(--du-shadow); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #eee; }
.modal-header .title { font-weight: 600; }
.modal-body { padding: 0; }
.modal-body.padded { padding: 12px; display:flex; flex-direction:column; gap:8px; }
.modal-actions { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-top: 1px solid #eee; }
.json-input { width: 100%; min-height: 220px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; }
.error { color: var(--du-danger); background:#ffecec; border:1px solid #ffc1c1; padding:4px 8px; border-radius:6px; }
</style>
