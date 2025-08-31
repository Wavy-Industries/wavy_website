<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { editState, setEditorLoopData } from '~/features/device-utility/stores/edits.svelte';
  import { tempoState } from '~/features/device-utility/stores/tempo.svelte';
  import { TICKS_PER_BEAT, type Page, type LoopData } from '~/lib/parsers/samples_parser';
  import { soundBackend } from '~/lib/soundBackend';

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

  const engine = soundBackend; // backend interface
  let playing = $state(false);

  // Local copy of the loop; edits do not affect store until Save is pressed
  function currentPage(): Page | null { return editState.loops[0]; }
  function storeLoop(): LoopData | null { return currentPage()?.loops?.[index] as any ?? null; }
  let localLoop: LoopData = $state({ length_beats: 16, events: [] } as any);
  let originalLoop: LoopData = $state({ length_beats: 16, events: [] } as any);
  let pageName: string = $state('');
  onMount(() => {
    const page = currentPage();
    pageName = page?.name || `U-${(editState.name7 || 'NONAME').slice(0,8)}`;
    const l = storeLoop();
    localLoop = JSON.parse(JSON.stringify(l ?? { length_beats: 16, events: [] }));
    originalLoop = JSON.parse(JSON.stringify(l ?? { length_beats: 16, events: [] }));
    recalcViewport(localLoop as any);
  });
  const isDirty = $derived(JSON.stringify(localLoop) !== JSON.stringify(originalLoop));

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

  function setLocalLoop(loop: LoopData) { localLoop = loop; recalcViewport(loop); }

  function tickToX(t: number): number { return t * tickWidthPx; }
  function xToTick(x: number, snap = true): number {
    let t = Math.round(x / tickWidthPx);
    if (snap) t = snapTick(t);
    return Math.max(0, Math.min(511, t));
  }

  function noteToY(n: number): number { return (maxNote - n) * laneHeight; }
  function yToNote(y: number): number { const n = Math.round(maxNote - y / laneHeight); return Math.max(0, Math.min(127, n)); }

  function ensureGridRect() { const r = gridEl.getBoundingClientRect(); gridRect = { left: r.left, top: r.top, width: r.width, height: r.height }; }

  function onGridPointerDown(e: PointerEvent) {
    const target = e.target as HTMLElement;
    const idxAttr = target.getAttribute('data-idx');
    ensureGridRect(); didDrag = false; isDragging = true;
    const gx = e.clientX - gridRect.left; const gy = e.clientY - gridRect.top;
    dragStart = { x: gx, y: gy };
    const t = xToTick(gx);
    const n = yToNote(gy);
    const loop = localLoop as any; const evs = loop.events as any[];
    if (idxAttr != null) {
      // start moving/resizing existing note
      selectedIdx = Number(idxAttr);
      dragMode = target.classList.contains('resize') ? 'resize' : 'move';
      const ev = evs[selectedIdx];
      dragNoteOriginal = { press: ev.time_ticks_press, release: ev.time_ticks_release, note: ev.note, velocity: ev.velocity };
    } else {
      // create new note
      const press = t; const release = Math.max(press + gridStep(), press + defaultLen);
      evs.push({ note: n, velocity: 100, time_ticks_press: press, time_ticks_release: release });
      selectedIdx = evs.length - 1;
      dragMode = 'move';
    }
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onGridPointerMove(e: PointerEvent) {
    if (!isDragging || selectedIdx == null) return;
    didDrag = true;
    ensureGridRect();
    const gx = e.clientX - gridRect.left; const gy = e.clientY - gridRect.top;
    const loop = localLoop as any; const evs = loop.events as any[]; const ev = evs[selectedIdx];
    if (!ev) return;
    if (dragMode === 'move') {
      const dx = xToTick(gx) - xToTick(dragStart.x);
      const dn = yToNote(gy) - yToNote(dragStart.y);
      const len = (ev.time_ticks_release - ev.time_ticks_press);
      ev.time_ticks_press = Math.max(0, Math.min(511, ev.time_ticks_press + dx));
      ev.time_ticks_release = Math.max(ev.time_ticks_press + gridStep(), Math.min(511, ev.time_ticks_press + len));
      ev.note = Math.max(0, Math.min(127, ev.note + dn));
      dragStart = { x: gx, y: gy };
    } else if (dragMode === 'resize') {
      const newRelease = xToTick(gx);
      ev.time_ticks_release = Math.max(ev.time_ticks_press + gridStep(), Math.min(511, newRelease));
    }
  }

  function onGridPointerUp(e: PointerEvent) {
    if (!isDragging) return;
    isDragging = false; dragMode = null;
    if (!didDrag) {
      // If no drag occurred, toggle selection or audition note
      const target = e.target as HTMLElement;
      const idxAttr = target.getAttribute('data-idx');
      if (idxAttr != null) {
        const idx = Number(idxAttr);
        if (selectedIdx === idx) {
          // audition note
          const ev = (localLoop as any).events[idx];
          engine.noteOn(ev.note, ev.velocity, 9);
          setTimeout(() => engine.noteOff(ev.note, 0, 9), 120);
        } else {
          selectedIdx = idx;
        }
      } else {
        selectedIdx = null;
      }
    }
  }

  function deleteSelected() {
    const loop = localLoop as any; const evs = loop.events as any[];
    if (selectedIdx == null) return;
    evs.splice(selectedIdx, 1);
    selectedIdx = null;
  }

  function saveAndClose() {
    // Persist to slot 0 page and close
    const page = currentPage(); if (!page) return;
    const updated = { ...page } as any;
    if (!updated.loops) updated.loops = Array(15).fill(null);
    updated.loops[index] = JSON.parse(JSON.stringify(localLoop));
    setEditorLoopData(0, updated);
    dispatch('save');
    close?.();
  }

  function playLoop() {
    const bpm = tempoState.bpm || 120;
    const msPerBeat = (60 / Math.max(1, Math.min(999, bpm))) * 1000;
    const startMs = performance.now() + 20;
    engine.allNotesOff();
    for (const ev of (localLoop as any).events) {
      const onAt = startMs + (ev.time_ticks_press / 24) * msPerBeat;
      const offAt = startMs + (ev.time_ticks_release / 24) * msPerBeat;
      const vel = Math.max(0, Math.min(127, ev.velocity ?? 100));
      setTimeout(() => engine.noteOn(ev.note, vel, 9), Math.max(0, onAt - performance.now()));
      setTimeout(() => engine.noteOff(ev.note, 0, 9), Math.max(0, offAt - performance.now()));
    }
  }
</script>

<div class="modal-backdrop" onpointerdown={(e)=>{ if (e.target === e.currentTarget) close?.(); }}>
  <div class="modal" onpointerdown={(e)=> e.stopPropagation()}>
    <div class="head">
      <div class="left">
        <button class="btn" onclick={close}>Back</button>
        <strong>Piano Roll</strong>
      </div>
      <div class="right">
        <button class="btn" onclick={playLoop}>Play</button>
        <button class="btn primary" onclick={saveAndClose} disabled={!isDirty}>Save</button>
      </div>
    </div>
    <div class="grid-wrap" bind:this={containerEl}>
      <div class="grid"
           bind:this={gridEl}
           onpointerdown={onGridPointerDown}
           onpointermove={onGridPointerMove}
           onpointerup={onGridPointerUp}
           onpointerleave={onGridPointerUp}
           style={`--lane:${laneHeight}px; --ticks:${totalTicks}; --tickw:${tickWidthPx}px; --min:${minNote}; --max:${maxNote};`}
      >
        {#each (localLoop.events as any[]) as ev, idx}
          <div class="note {selectedIdx===idx?'sel':''}"
               style={`--x:${tickToX(ev.time_ticks_press)}px; --w:${tickToX(ev.time_ticks_release - ev.time_ticks_press)}px; --y:${noteToY(ev.note)}px;`}
               data-idx={idx}
          >
            <div class="resize" data-idx={idx}></div>
          </div>
        {/each}
        <div class="axis-y">
          {#each Array(maxNote - minNote + 1) as _, i}
            {@const n = maxNote - i}
            <div class="lane" class:isC={((n % 12)===0)}>{(n % 12)===0 ? `C${Math.floor(n/12)-1}` : ''}</div>
          {/each}
        </div>
        <div class="axis-x">
          {#each Array(Math.ceil(totalTicks / TICKS_PER_BEAT)) as _, bi}
            <div class="beat">{bi+1}</div>
          {/each}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.3); display: grid; place-items: center; z-index: 1000; padding: 10px; }
  .modal { width: min(980px, 96vw); background: white; border: 1px solid #2f313a; border-radius: 8px; display: flex; flex-direction: column; gap: 8px; padding: 8px; }
  .head { display:flex; align-items:center; justify-content: space-between; }
  .left, .right { display:flex; gap:8px; align-items:center; }
  .btn { border:1px solid var(--du-border); background:#fff; padding:6px 10px; border-radius:6px; cursor:pointer; }
  .btn.primary { background:#2b2f36; color:#fff; border-color:#1f2329; }
  .grid-wrap { overflow: auto; border:1px solid var(--du-border); border-radius: 6px; background: #f8fafc; }
  .grid { position: relative; width: calc(var(--ticks) * var(--tickw)); min-height: 420px; }
  .axis-y { position: absolute; left: 0; top: 0; bottom: 0; width: 60px; border-right: 1px solid var(--du-border); background: #fff; z-index: 2; }
  .axis-x { position: sticky; left: 60px; top: 0; height: 20px; display: grid; grid-template-columns: repeat(auto-fill, calc(var(--tickw) * 24)); z-index: 1; }
  .axis-x .beat { height: 20px; display:flex; align-items:center; justify-content:center; border-right: 1px solid #ddd; font-size: 11px; background: #fff; }
  .lane { height: var(--lane); border-bottom: 1px solid #e5e7eb; font-size: 11px; padding-left: 6px; display:flex; align-items:center; color: #6b7280; }
  .lane.isC { background: #f9fafb; color: #111827; }
  .note { position: absolute; left: calc(60px + var(--x)); width: var(--w); height: calc(var(--lane) - 3px); top: calc(20px + var(--y)); background: #3b82f6; border: 1px solid #1e40af; border-radius: 4px; }
  .note.sel { outline: 2px solid #1f2937; }
  .note .resize { position: absolute; right: 0; top: 0; bottom: 0; width: 8px; cursor: ew-resize; background: rgba(0,0,0,0.1); }
</style>

