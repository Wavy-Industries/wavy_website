<script>
  import { sampleState, closePackEditor, setEditorLoopData, saveEditorAsUserPack } from '~/features/device-utility/stores/samples.svelte';
  import { getPageByteSize } from '~/lib/parsers/samples_parser';
  import { parseMidiToLoop } from '~/lib/parsers/midi_parser';
  import { SoundEngine } from '~/features/device-utility/utils/sound';
  import { validatePage as validatePackPage } from '~/features/device-utility/validation/packs';
  import { packDisplayName } from '~/features/device-utility/utils/packs';

  const slots = $derived(sampleState.editor.loops);
  const name7 = $derived(sampleState.editor.name7);

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
    let minN = Infinity, maxN = -Infinity, minT = 0, maxT = loop.length_beats * 24;
    for (const ev of loop.events) { if (ev.note < minN) minN = ev.note; if (ev.note > maxN) maxN = ev.note; }
    const rangeN = Math.max(1, maxN - minN + 1);
    const rangeT = Math.max(1, maxT - minT);
    return { w, h, minN, maxN, rangeN, minT, maxT, rangeT };
  }

  // Playback
  const engine = new SoundEngine();
  let kit = '808';
  function playIdx(idx) {
    const page = slots[0]; if (!page) return;
    const loop = page.loops[idx]; if (!loop) return;
    engine.stopAll();
    engine.playLoop(loop, sampleState.editor.bpm, kit);
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
  function openImportDialog() {
    importDialog.open = true;
    importDialog.text = '';
    importDialog.error = '';
    importDialog.errors = [];
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
        <div class="meta">by {meta?.author}{meta?.author && meta?.created ? ' • ' : ''}{meta?.created}</div>
      {/if}
    {/if}
    <div class="bytes">Total: {totalBytes()} bytes ({percentTotal()}%)</div>
  </div>
  <div class="list">
    {#each Array(15) as _, idx}
      <div class="row">
        <div class="idx">{idx+1}</div>
        <div class="play">
          <button title="Play" onclick={() => playIdx(idx)}>▶︎</button>
        </div>
        <div class="content">
          {#if slots[0]?.loops?.[idx]}
            {@const loop = slots[0].loops[idx]}
            {@const bounds = getBounds(loop)}
            <svg class="pianoroll" viewBox={`0 0 ${bounds.w} ${bounds.h}`} preserveAspectRatio="none">
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
              <div class="hint">Drop MIDI or click to choose</div>
            </div>
          {/if}
        </div>
        <div class="bytes">{bytesFor(idx)} bytes ({percentFor(idx)}%)</div>
        <div class="reorder">
          <button onclick={() => move(idx, -1)}>↑</button>
          <button onclick={() => move(idx, 1)}>↓</button>
          <button onclick={() => deleteLoop(idx)} disabled={!slots[0]?.loops?.[idx]}>✕</button>
        </div>
      </div>
    {/each}
  </div>
</div>

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
.page { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
.header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 8px; }
.header .left { display: flex; align-items: center; gap: 10px; }
.icon { width: 36px; height: 36px; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; }
.sub { color: #777; font-size: 0.9em; }
.actions { display: flex; gap: 8px; }
.button-link { display:inline-flex; align-items:center; justify-content:center; padding:4px 8px; border:1px solid #ddd; border-radius:4px; background:white; color:inherit; text-decoration:none; }
.primary { background: #2ecc71; color: white; }
.toolbar { display:flex; gap: 16px; align-items: center; }
.settings { background: #fafafa; border: 1px solid #eee; border-radius: 6px; padding: 10px; }
.namer, .kit, .bpm { display: flex; gap: 6px; align-items: center; }
.namer .hint { color:#666; font-size: 0.85em; }
.meta { color: #666; }
.list { display: flex; flex-direction: column; gap: 8px; }
.row { display: grid; grid-template-columns: 40px 60px 1fr 120px 80px; align-items: center; gap: 8px; border: 1px solid #eee; border-radius: 6px; padding: 8px; }
.muted { color: #888; font-size: 0.85em; }
.drop { border: 1px dashed #bbb; border-radius: 6px; padding: 12px; display: grid; place-items: center; }
.hint { color: #777; font-size: 0.9em; }
.pianoroll { background: #f7f7f7; border-radius: 4px; padding: 6px; font-size: 0.9em; height: 48px; display: flex; align-items: center; }
input[type="file"] { width: 100%; }

/* Modal reused styles */
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display: grid; place-items: center; z-index: 1000; padding: 12px; }
.modal { background: white; border-radius: 8px; border: 1px solid #ddd; width: min(800px, 90vw); max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #eee; }
.modal-header .title { font-weight: 600; }
.modal-body { padding: 0; }
.modal-body.padded { padding: 12px; display:flex; flex-direction:column; gap:8px; }
.modal-actions { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-top: 1px solid #eee; }
.json-input { width: 100%; min-height: 220px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; }
.error { color:#b00020; background:#ffecec; border:1px solid #ffc1c1; padding:4px 8px; border-radius:4px; }
</style>
