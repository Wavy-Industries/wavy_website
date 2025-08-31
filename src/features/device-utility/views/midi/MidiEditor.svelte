<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { sampleState, setEditorLoopData } from '~/features/device-utility/stores/samples.svelte';
  import { TICKS_PER_BEAT, type Page, type LoopData } from '~/lib/parsers/samples_parser';
  import { SoundEngine } from '~/features/device-utility/utils/sound';

  let { index, close } = $props<{ index: number, close?: () => void }>(); // loop index within page slot 0
  const dispatch = createEventDispatcher();

  // Local references
  let containerEl: HTMLDivElement;
  let gridEl: HTMLDivElement;
  let gridRect = { left: 0, top: 0, width: 1, height: 1 };

  // Editing state
  let defaultLen = Math.round(TICKS_PER_BEAT / 4); // 1/16 note = 6 ticks default (used internally)
  let selectedIdx: number | null = null;
  let isDragging = $state(false);
  let didDrag = $state(false);
  let dragMode: 'move' | 'resize' | null = null;
  let dragStart = { x: 0, y: 0 };
  let dragNoteOriginal: { press: number; release: number; note: number; velocity: number } | null = null;

  // Viewport state
  let minNote = $state(36); // C2
  let maxNote = $state(84); // C6
  let totalTicks = $state(16 * TICKS_PER_BEAT); // default 16 beats
  let laneHeight = $state(22); // px per note lane (zoomed for touch)
  let tickWidthPx = $state(10); // px width per tick (zoomed for touch)
  let gridSubdiv = $state(4); // beats subdivision for snapping (1/16 note default -> 4 per beat)
  function gridStep() { return Math.max(1, Math.round(TICKS_PER_BEAT / gridSubdiv)); }
  function snapTick(t: number): number { const s = gridStep(); return Math.round(t / s) * s; }

  const engine = new SoundEngine();
  let playing = $state(false);

  function currentPage(): Page | null { return sampleState.editor.loops[0]; }
  function currentLoop(): LoopData | null { return currentPage()?.loops?.[index] as any ?? null; }
  function ensurePageLoop(): { page: Page; loop: LoopData } {
    let page = currentPage();
    if (!page) page = { name: `U-${sampleState.editor.name7 || 'NONAME'}`.slice(0, 8), loops: Array(15).fill(null) };
    let loop = currentLoop();
    if (!loop) loop = { length_beats: 16, events: [] };
    recalcViewport(loop);
    return { page, loop };
  }

  function recalcViewport(loop: LoopData) {
    // Recompute viewport to include all notes and a bit of headroom
    if (!loop) return;
    let minN = 127, maxN = 0, maxT = loop.length_beats * TICKS_PER_BEAT;
    for (const ev of loop.events ?? []) {
      if (ev.note < minN) minN = ev.note;
      if (ev.note > maxN) maxN = ev.note;
      if (ev.time_ticks_release > maxT) maxT = ev.time_ticks_release;
    }
    if (loop.events?.length) {
      minNote = Math.max(0, Math.min(minNote, minN - 2));
      maxNote = Math.min(127, Math.max(maxNote, maxN + 2));
    }
    totalTicks = Math.max(TICKS_PER_BEAT * 4, Math.min(511, Math.max(totalTicks, maxT + TICKS_PER_BEAT)));
  }

  function computeLoopEndTicks(loop: LoopData | null): number {
    if (!loop) return 16 * TICKS_PER_BEAT;
    const last = (loop.events || []).reduce((m, ev:any) => Math.max(m, ev.time_ticks_release || 0), 0);
    return Math.max(loop.length_beats * TICKS_PER_BEAT, last);
  }

  function saveLoop(loop: LoopData) {
    const { page } = ensurePageLoop();
    const loops = [...page.loops];
    loops[index] = loop;
    setEditorLoopData(0, { ...page, loops });
    recalcViewport(loop);
  }

  function tickToX(t: number): number { return t * tickWidthPx; }
  function xToTick(x: number, snap = true): number {
    let t = Math.round(x / tickWidthPx);
    if (snap) t = snapTick(t);
    return Math.max(0, Math.min(511, t));
  }
  function noteToY(note: number): number { return (maxNote - note) * laneHeight; }
  function yToNote(y: number): number {
    const lane = Math.floor(y / laneHeight);
    const note = maxNote - lane;
    return Math.max(0, Math.min(127, note));
  }

  function onGridWheel(e: WheelEvent) {
    e.preventDefault();
    const size = (maxNote - minNote + 1);
    if (e.ctrlKey || e.metaKey || e.altKey) {
      // Zoom: change visible size around center
      const dir = e.deltaY > 0 ? 1 : -1;
      const newSize = Math.max(8, Math.min(128, size + dir * 2));
      const center = Math.round((minNote + maxNote) / 2);
      let half = Math.floor(newSize / 2);
      let newMin = Math.max(0, center - half);
      let newMax = Math.min(127, newMin + newSize - 1);
      newMin = Math.max(0, newMax - (newSize - 1));
      minNote = newMin; maxNote = newMax;
    } else {
      // Pan: shift window up/down by a few notes
      const step = e.deltaY > 0 ? 2 : -2;
      let newMin = Math.max(0, Math.min(127, minNote + step));
      let newMax = Math.max(0, Math.min(127, newMin + size - 1));
      if (newMax - newMin + 1 < size) newMin = Math.max(0, 127 - size + 1);
      minNote = newMin; maxNote = newMax;
    }
  }

  function previewNote(n: number, velocity: number = 100) {
    const bpm = sampleState.editor.bpm || 120;
    const loop = { length_beats: 1, events: [{ note: n, time_ticks_press: 0, velocity: Math.max(0, Math.min(127, velocity|0)), time_ticks_release: 1 }] } as any;
    engine.playLoop(loop, bpm, '808');
  }

  function updateGridRect() {
    const r = gridEl?.getBoundingClientRect();
    if (r) gridRect = { left: r.left, top: r.top, width: r.width, height: r.height } as any;
  }

  onMount(() => {
    updateGridRect();
    const ro = new ResizeObserver(() => updateGridRect());
    if (gridEl) ro.observe(gridEl);
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = (target?.tagName || '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || (target?.isContentEditable ?? false);
      if (isTyping) return;
      if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => { ro.disconnect(); window.removeEventListener('keydown', onKeyDown as any); };
  });

  // Playback
  let playheadTick = $state(0);
  let _raf = 0; let _start = 0; let _loopTicks = 0; let _secPerBeat = 0; let _repeater: any = null;
  function stopPlay() {
    engine.stopAll(); playing = false; playheadTick = 0; if (_raf) cancelAnimationFrame(_raf); _raf = 0; if (_repeater) { clearTimeout(_repeater); _repeater = null; }
  }
  function animate() {
    const ctxNow = (engine as any).ctx?.currentTime || 0;
    const elapsed = Math.max(0, ctxNow - _start);
    const ticks = (elapsed / _secPerBeat) * TICKS_PER_BEAT;
    playheadTick = _loopTicks > 0 ? (ticks % _loopTicks) : 0;
    _raf = requestAnimationFrame(animate);
  }
  function togglePlay() {
    if (playing) { stopPlay(); return; }
    const loop = currentLoop(); if (!loop) return;
    stopPlay();
    const bpm = sampleState.editor.bpm || 120;
    _secPerBeat = 60 / Math.max(30, Math.min(240, bpm));
    _loopTicks = Math.max(loop.length_beats * TICKS_PER_BEAT, loop.events.reduce((m, ev)=>Math.max(m, ev.time_ticks_release||0), 0));
    (engine as any).ensureCtx?.();
    const ctx = (engine as any).ctx || (engine as any).ensureCtx?.();
    _start = ctx?.currentTime ? ctx.currentTime + 0.05 : 0;
    const loopSec = (_loopTicks / TICKS_PER_BEAT) * _secPerBeat;
    const schedule = () => {
      const l = currentLoop(); if (!l || !playing) return;
      engine.playLoop(l, bpm, '808');
      _repeater = setTimeout(schedule, Math.max(10, loopSec * 1000));
    };
    playing = true; playheadTick = 0; _raf = requestAnimationFrame(animate); schedule();
  }

  // Note helpers
  function noteLength(ev): number { return Math.max(1, (ev.time_ticks_release ?? 0) - (ev.time_ticks_press ?? 0)); }
  function sortEvents(evts) { return evts.sort((a,b) => a.time_ticks_press - b.time_ticks_press || a.note - b.note); }

  function hitTestNote(px: number, py: number): { idx: number; edge: 'right' | 'body' } | null {
    const loop = currentLoop(); if (!loop) return null;
    const events = loop.events;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const x = tickToX(ev.time_ticks_press);
      const w = Math.max(6, tickToX(ev.time_ticks_release) - x);
      const y = noteToY(ev.note);
      const h = laneHeight - 2;
      const within = px >= x && px <= x + w && py >= y && py <= y + h;
      if (within) {
        const edgeZone = 6;
        const edge = (px >= x + w - edgeZone) ? 'right' : 'body';
        return { idx: i, edge };
      }
    }
    return null;
  }

  // Insert/select on press rather than release
  function onGridPointerDown(e: PointerEvent) {
    const px = e.clientX - gridRect.left; const py = e.clientY - gridRect.top;
    const loop = ensurePageLoop().loop;
    const hit = hitTestNote(px, py);
    didDrag = false;
    if (e.button === 2) return; // right-click handled separately
    if (hit) {
      selectedIdx = hit.idx;
      const ev = loop.events[selectedIdx];
      defaultLen = noteLength(ev);
      const isVelHandle = (e.target as HTMLElement)?.classList?.contains('velocity-handle');
      dragMode = isVelHandle ? 'velocity' : (hit.edge === 'right' ? 'resize' : 'move');
      isDragging = true;
      dragStart = { x: px, y: py };
      dragNoteOriginal = { press: ev.time_ticks_press, release: ev.time_ticks_release, note: ev.note, velocity: ev.velocity };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      // Preview the note on click/select unless adjusting velocity
      if (!isVelHandle) previewNote(ev.note, ev.velocity ?? 100);
      return;
    }
    // Place immediately on press
    const t = xToTick(px, true);
    const n = yToNote(py);
    const step = gridStep();
    const snappedLen = Math.max(step, Math.round(defaultLen / step) * step);
    const newEv = { note: n, time_ticks_press: t, velocity: 100, time_ticks_release: Math.min(511, t + snappedLen) };
    const evts = sortEvents([...(loop.events || []), newEv]);
    saveLoop({ ...loop, events: evts });
    selectedIdx = evts.indexOf(newEv);
    previewNote(n, newEv.velocity);
  }

  function onGridContext(e: MouseEvent) {
    e.preventDefault();
    const loop = currentLoop(); if (!loop) return;
    const px = e.clientX - gridRect.left; const py = e.clientY - gridRect.top;
    const hit = hitTestNote(px, py);
    if (hit) {
      const evts = [...loop.events]; evts.splice(hit.idx, 1);
      saveLoop({ ...loop, events: evts });
      selectedIdx = null;
    }
  }

  
  function onGridPointerMove(e: PointerEvent) {
    if (!isDragging || !dragMode || selectedIdx == null) return;
    const loop = currentLoop(); if (!loop) return;
    const px = e.clientX - gridRect.left; const py = e.clientY - gridRect.top;
    const dx = px - dragStart.x; const dy = py - dragStart.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag = true;
    const orig = dragNoteOriginal!;
    const evts = [...loop.events];
    const ev = { ...evts[selectedIdx] };
    if (dragMode === 'resize') {
      const dt = Math.round(dx / tickWidthPx);
      ev.time_ticks_release = Math.max(ev.time_ticks_press + 1, Math.min(511, snapTick(orig.release + dt)));
    } else if (dragMode === 'move') {
      const dt = Math.round(dx / tickWidthPx);
      const dn = yToNote(noteToY(orig.note) + dy) - orig.note;
      const newPress = Math.max(0, Math.min(511, snapTick(orig.press + dt)));
      const len = Math.max(1, orig.release - orig.press);
      ev.time_ticks_press = newPress;
      // If grid step is larger than note length, do not resize on move
      const step = gridStep();
      const endCandidate = newPress + len;
      ev.time_ticks_release = Math.min(511, (len < step) ? endCandidate : snapTick(endCandidate));
      ev.note = Math.max(0, Math.min(127, orig.note + dn));
      if (ev.note !== (evts[selectedIdx] as any).note) {
        previewNote(ev.note, ev.velocity ?? 100);
      }
    } else if (dragMode === 'velocity') {
      // Adjust velocity based on vertical drag distance
      const scale = 0.5; // velocity change per pixel
      const dv = Math.round(-dy * scale);
      const newVel = Math.max(0, Math.min(127, (orig.velocity ?? 100) + dv));
      ev.velocity = newVel;
    }
    evts[selectedIdx] = ev;
    const sorted = sortEvents(evts);
    // Re-track selected index after sort to prevent "disappearing" note effect
    const newIdx = sorted.findIndex(x => x.note === ev.note && x.time_ticks_press === ev.time_ticks_press && x.time_ticks_release === ev.time_ticks_release && x.velocity === ev.velocity);
    selectedIdx = newIdx >= 0 ? newIdx : selectedIdx;
    saveLoop({ ...loop, events: sorted });
  }
  function onGridPointerUp(e: PointerEvent) {
    if (!isDragging) return;
    isDragging = false; dragMode = null; dragNoteOriginal = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }

  // Import raw loop JSON
  let importDialog = $state({ open: false, text: '', error: '' });
  const importPlaceholder = '{"length_beats":16,"events":[{"note":36,"time_ticks_press":0,"velocity":100,"time_ticks_release":12}]}'
  function openImport() {
    const loop = currentLoop();
    importDialog.text = JSON.stringify(loop ?? { length_beats: 16, events: [] }, null, 2);
    importDialog.error = '';
    importDialog.open = true;
  }
  function doImport() {
    try {
      const obj = JSON.parse(importDialog.text || '{}');
      if (!obj || typeof obj !== 'object' || !Array.isArray(obj.events)) throw new Error('Expected an object with an events array');
      const events = (obj.events as any[]).map(ev => ({
        note: Math.max(0, Math.min(127, Number(ev.note) || 0)),
        time_ticks_press: Math.max(0, Math.min(511, Number(ev.time_ticks_press) || 0)),
        velocity: Math.max(0, Math.min(127, Number(ev.velocity) || 100)),
        time_ticks_release: Math.max(0, Math.min(511, Number(ev.time_ticks_release) || 0)),
      }));
      const loop: LoopData = { length_beats: Math.max(1, Number(obj.length_beats) || 16), events: sortEvents(events) };
      saveLoop(loop);
      importDialog.open = false;
    } catch (e) {
      importDialog.error = (e as any)?.message || 'Invalid JSON';
    }
  }

  function back() { if (typeof close === 'function') close(); else dispatch('back'); }
  function saveAndBack() { back(); }
</script>

  <div class="midi-overlay">
  <div class="midi-page" bind:this={containerEl}>
  <div class="header">
    <div class="left">
      <button class="icon" title="Back" aria-label="Back" onclick={back}>back</button>
      <h2>MIDI Editor</h2>
    </div>
    <div class="actions">
      <button class="button-link" onclick={togglePlay}>{playing ? 'Pause' : 'Play'}</button>
      <button class="button-link" onclick={openImport}>Import raw</button>
      <button class="primary" onclick={saveAndBack}>Save</button>
    </div>
  </div>
  <div class="toolbar settings">
    <div class="meta">BPM: {sampleState.editor.bpm || 120}</div>
    <label class="meta">Grid:
      <select value={gridSubdiv} oninput={(e)=>{ gridSubdiv = Number((e.target as HTMLSelectElement).value || 1) }}>
        <option value={1}>1/4</option>
        <option value={2}>1/8</option>
        <option value={3}>1/12T</option>
        <option value={4}>1/16</option>
        <option value={6}>1/24</option>
        <option value={8}>1/32</option>
      </select>
    </label>
  </div>

  <div class="editor">
    <div class="ruler" style={`height:${(maxNote-minNote+1)*laneHeight}px`} onclick={(e)=>{ const t=e.target as HTMLElement; const dn=t?.dataset?.note; if(dn!=null) previewNote(Number(dn)); }} onwheel={onGridWheel}>
      {#each Array(maxNote - minNote + 1) as _, i}
        {@const n = maxNote - i}
        <div class="key {n%12===1||n%12===6 ? 'sharp' : ''}" data-note={n} style={`height:${laneHeight}px; line-height:${laneHeight}px`}>{n}</div>
      {/each}
    </div>
    <div class="grid" bind:this={gridEl}
      oncontextmenu={onGridContext}
      onpointerdown={onGridPointerDown}
      onpointermove={onGridPointerMove}
      onpointerup={onGridPointerUp}
      onwheel={onGridWheel}
    >
      <div class="grid-bg" style={`width:${tickToX(totalTicks)}px; height:${(maxNote-minNote+1)*laneHeight}px`}>
        {#each Array(Math.ceil(totalTicks / gridStep())) as _, s}
          {@const t = s * gridStep()}
          {#if (t % TICKS_PER_BEAT) !== 0}
            <div class="sub" style={`left:${tickToX(t)}px`}></div>
          {/if}
        {/each}
        {#each Array(Math.ceil(totalTicks / TICKS_PER_BEAT)) as _, b}
          <div class={`beat ${b % 4 === 0 ? 'bar' : ''}`} style={`left:${tickToX(b*TICKS_PER_BEAT)}px`}></div>
        {/each}
        <div class="loop-end" style={`left:${tickToX(computeLoopEndTicks(currentLoop()))}px`}></div>
        {#each Array((maxNote - minNote + 1)) as _, r}
          <div class="row" style={`top:${r*laneHeight}px`}></div>
        {/each}
      </div>
      {#if playing}
        <div class="playhead" style={`left:${tickToX(playheadTick)}px; height:${(maxNote-minNote+1)*laneHeight}px`}></div>
      {/if}
      {#if currentLoop()}
        {#each currentLoop().events as ev, i}
          {@const x = tickToX(ev.time_ticks_press)}
          {@const w = Math.max(6, tickToX(ev.time_ticks_release) - x)}
          {@const y = noteToY(ev.note)}
          <div class="note {selectedIdx===i?'selected':''}"
            style={`--int:${Math.max(0, Math.min(1, ((ev.velocity??100)/127)))}; --l:${(88 - Math.round((Math.max(0, Math.min(1, ((ev.velocity??100)/127))))*40))}%; left:${x}px; top:${y}px; width:${w}px; height:${laneHeight-2}px;`}
            title={`n${ev.note} t${ev.time_ticks_press}-${ev.time_ticks_release}`}
          >
            <div class="velocity-handle" title="Adjust velocity"></div>
            <div class="resize-handle"></div>
          </div>
        {/each}
      {/if}
    </div>
  </div>
  </div>
  </div>

{#if importDialog.open}
  <div class="modal-backdrop" onclick={() => importDialog.open=false}>
    <div class="modal" onclick={(e)=>e.stopPropagation()}>
      <div class="modal-header">
        <div class="title">Import raw loop JSON</div>
        <button class="icon" onclick={() => importDialog.open=false}>✕</button>
      </div>
      <div class="modal-body padded">
        <textarea class="json-input" bind:value={importDialog.text} placeholder={importPlaceholder}></textarea>
        {#if importDialog.error}
          <div class="error">{importDialog.error}</div>
        {/if}
      </div>
      <div class="modal-actions">
        <button class="button-link" onclick={doImport}>Import</button>
        <button class="button-link" onclick={() => importDialog.open=false}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
.midi-overlay { position: fixed; inset: 0; z-index: 1100; display: grid; place-items: center; padding: 16px; background: rgba(0,0,0,0.1); }
.midi-page { width: 100%; max-width: var(--du-maxw, 1100px); height: 85vh; background: white; display: flex; flex-direction: column; border: 1px solid var(--du-border); border-radius: var(--du-radius); box-shadow: var(--du-shadow); overflow: hidden; }
.header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--du-border); padding: 16px; }
.header .left { display: flex; align-items: center; gap: 10px; }
.header .left h2 { position: relative; padding-bottom: 6px; }
.header .left h2::after { content: ""; position: absolute; left: 0; bottom: 0; width: 120px; height: 3px; background: #2f313a; }
.actions { display: flex; gap: 8px; }
.button-link { display:inline-flex; align-items:center; justify-content:center; padding:6px 10px; border:1px solid #2f313a; border-radius:var(--du-radius); background:#f2f3f5; color:inherit; text-decoration:none; font-size: 12px; letter-spacing: .04em; text-transform: uppercase; }
.primary { background: #2b2f36; color: #fff; border: 1px solid #1f2329; }
.settings { background: #fafafa; border: 1px solid var(--du-border); border-radius: var(--du-radius); padding: 10px; margin: 8px 16px; display:flex; gap:16px; align-items:center; }
.meta { color: var(--du-muted); }
.editor { display: flex; gap: 0; overflow: hidden; flex: 1; border-top: 1px solid var(--du-border); }
.ruler { position: sticky; left: 0; background: #fff; border-right: 1px solid var(--du-border); }
.key { height: 18px; width: 56px; display: flex; align-items: center; justify-content: flex-end; padding-right: 6px; font-size: 10px; color:#666; border-bottom: 1px solid #f0f0f0; }
.key.sharp { background: #f9f9ff; }
.grid { position: relative; flex: 1; cursor: default; overflow-x: auto; overflow-y: hidden; }
.grid-bg { position: relative; }
.grid .beat { position: absolute; top: 0; bottom: 0; width: 1px; background: #e5e7eb; }
.grid .sub { position: absolute; top: 0; bottom: 0; width: 1px; background: #f2f4f8; }
.grid .beat.bar { background: #cbd5e1; width: 2px; }
.grid .row { position: absolute; left: 0; right: 0; height: 1px; background: #f0f0f0; }
.loop-end { position: absolute; top: 0; bottom: 0; width: 3px; background: #111827; opacity: 0.5; pointer-events: none; }
.note { position: absolute; background: hsl(211deg 72% var(--l, 60%)); border: 1px solid #2b6cb0; box-sizing: border-box; }
.note:hover { filter: brightness(1.05); box-shadow: 0 0 0 1px rgba(0,0,0,0.05) inset; }
/* remove active darkening to avoid odd visuals at low velocities */
.note.selected { outline: 2px solid #1d4ed8; }
.note .resize-handle { position: absolute; right: 0; top: 0; bottom: 0; width: 10px; background: rgba(0,0,0,0.12); cursor: ew-resize; }
.note .velocity-handle { position: absolute; left: 0; right: 0; top: 0; height: 10px; cursor: ns-resize; background: transparent; }
.note .velocity-handle:hover { background: rgba(0,0,0,0.06); }

.playhead { position: absolute; top: 0; bottom: 0; width: 2px; background: #ef4444; pointer-events: none; }

/* Modal reused styling */
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); display: grid; place-items: center; z-index: 1200; padding: 12px; }
.modal { background: white; border-radius: var(--du-radius); border: 1px solid var(--du-border); width: min(800px, 90vw); max-height: 80vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: var(--du-shadow); }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #eee; }
.modal-header .title { font-weight: 600; }
.modal-body.padded { padding: 12px; display:flex; flex-direction:column; gap:8px; }
.modal-actions { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-top: 1px solid #eee; }
.json-input { width: 100%; min-height: 220px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; }
.error { color: var(--du-danger); background:#ffecec; border:1px solid #ffc1c1; padding:4px 8px; border-radius:6px; }
.icon { width: 36px; height: 36px; border-radius: var(--du-radius); display: inline-flex; align-items: center; justify-content: center; }
</style>
