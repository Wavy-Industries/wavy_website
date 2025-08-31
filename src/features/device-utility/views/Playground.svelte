<script lang="ts">
  import { midiControlState } from '~/features/device-utility/stores/midiControl.svelte';
  import { tempoState, setTempo } from '~/features/device-utility/stores/tempo.svelte';
  import SynthChannelEditor from '~/features/device-utility/components/SynthChannelEditor.svelte';

  const chNames = Array.from({ length: 10 }, (_, i) => (i === 9 ? 'Ch 10 (Drums)' : `Ch ${i+1}`));
  function fmtTime(ts: number) { const d = new Date(ts); return d.toLocaleTimeString(); }
  function noteName(n: number): string {
    const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    if (typeof n !== 'number') return '';
    return names[((n % 12) + 12) % 12];
  }
  function fmtEvent(ev: any): string {
    if (ev.kind === 'noteon') return `${noteName(ev.note)}`;
    if (ev.kind === 'noteoff') return `(${noteName(ev.note)})`;
    return '';
  }
  function shouldShow(ev: any) { return ev.kind === 'noteon' || ev.kind === 'noteoff'; }
  function removeEvent(ch: number, id: number) {
    const list = midiControlState.events[ch];
    const idx = list.findIndex((e:any) => e.id === id);
    if (idx >= 0) { list.splice(idx,1); midiControlState.events = [...midiControlState.events]; }
  }

  // Modulation (CC0) drawing (in same box as notes)
  const modCanvases: (HTMLCanvasElement | null)[] = Array(10).fill(null);
  const ctxs: (CanvasRenderingContext2D | null)[] = Array(10).fill(null);
  const sizes = Array.from({ length: 10 }, () => ({ w: 0, h: 0, dpr: 1 }));
  let raf = 0;
  const selected = $state<{ ch: number | null }>({ ch: null });
  function modCanvas(node: HTMLCanvasElement, ch: number) {
    modCanvases[ch] = node;
    ctxs[ch] = node.getContext('2d');
    const ro = new ResizeObserver(() => resizeCanvas(ch));
    ro.observe(node);
    resizeCanvas(ch);
    return { destroy() { ro.disconnect(); modCanvases[ch] = null; ctxs[ch] = null; } };
  }
  function resizeCanvas(ch: number) {
    const el = modCanvases[ch]; if (!el) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const rect = el.getBoundingClientRect();
    sizes[ch] = { w: Math.max(10, rect.width), h: Math.max(10, rect.height), dpr };
    el.width = Math.floor(rect.width * dpr);
    el.height = Math.floor(rect.height * dpr);
  }
  function drawLoop(ts: number) {
    const DURATION_MS = 3000;
    const EXTRA_PX = 100; // match CSS: to { left: calc(100% + 100px); }
    const now = Date.now();
    for (let ch = 0; ch < 10; ch++) {
      const ctx = ctxs[ch]; const el = modCanvases[ch]; if (!ctx || !el) continue;
      const { w, h, dpr } = sizes[ch];
      // Clear
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.scale(dpr, dpr);
      // axis baseline
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h - Math.round(h * (64/127)) + 0.5);
      ctx.lineTo(w, h - Math.round(h * (64/127)) + 0.5);
      ctx.stroke();
      // Draw CC0 dots drifting right over ~3s across width + 100px (to match CSS animation of notes)
      // Fallback to CC1 if CC0 not present (device tester doesn't filter CCs).
      let evs = midiControlState.events[ch].filter((e:any) => e.kind === 'cc' && e.controller === 0);
      if (evs.length === 0) evs = midiControlState.events[ch].filter((e:any) => e.kind === 'cc' && e.controller === 1);
      const speed = (w + EXTRA_PX) / DURATION_MS; // px per ms, matches CSS distance
      ctx.fillStyle = '#111827';
      for (const e of evs) {
        const age = now - e.ts;
        const x = age * speed;
        if (x > w + EXTRA_PX + 10) continue;
        const y = h - (Math.max(0, Math.min(127, e.value)) / 127) * h;
        // small square pixel
        ctx.fillRect(x, y, 2, 2);
      }
    }
    raf = requestAnimationFrame(drawLoop);
  }
  if (typeof window !== 'undefined') {
    raf = requestAnimationFrame(drawLoop);
  }
  $effect(() => () => { if (raf) cancelAnimationFrame(raf); });
</script>

<div class="content">
  <div class="beta-banner">
    <span class="beta-badge">BETA</span>
    <span>This feature is in beta — please report issues to <a href="mailto:hello@wavyindustries.com">hello@wavyindustries.com</a> or contribute on <a href="https://github.com/Wavy-Industries/wavy_website">GitHub</a>.</span>
  </div>

  <div class="toolbar">
    <div class="left">
      <h1>Playground</h1>
      <span class="muted">Use your MONKEY!</span>
    </div>
    <!-- <div class="right">
      <div class="subhead">GLOBAL</div>
      <div class="actions-row">
        <label class="field">BPM
          <input class="input-small" type="number" min="1" max="999" step="1" value={tempoState.bpm} oninput={(e)=>setTempo(Number((e.target as HTMLInputElement).value||120))} />
        </label>
      </div>
    </div> -->
  </div>

  <div class="pane">
    <div class="pane-header"><h3>Channel Activity</h3></div>
    <div class="list">
      {#each Array(10) as _, ch}
        <div class="row">
          <button
            class={`label btn-chan ${ch === 9 ? 'disabled' : ''}`}
            title={ch === 9 ? 'Drums channel — no synth editor' : 'Edit synth'}
            onclick={() => { if (ch !== 9) selected.ch = ch; }}
          >{chNames[ch]}</button>
          <div class="events">
            <canvas use:modCanvas={ch} class="mod-canvas-overlay"></canvas>
            <div class="strip">
              {#each midiControlState.events[ch] as ev (ev.id)}
                {#if shouldShow(ev)}
                  <div class="evt {ev.kind}"
                       style={`--a:${Math.max(0, Math.min(1, (ev.velocity ?? 0) / 127))}; --dur:${3000}ms;`}
                       title={fmtTime(ev.ts)}
                       onanimationend={() => removeEvent(ch, ev.id)}>{fmtEvent(ev)}</div>
                {/if}
              {/each}
              {#if midiControlState.events[ch].filter(shouldShow).length === 0}
                <div class="hint">No events</div>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>

{#if selected.ch !== null}
  <div class="modal-overlay" onclick={() => selected.ch = null}>
    <div class="modal-panel" onclick={(e)=> e.stopPropagation()}>
      <SynthChannelEditor channel={selected.ch!} onClose={() => selected.ch = null} />
    </div>
  </div>
{/if}

<style>
  /* Align to Sample Manager look */
  .content { padding: 16px; display: flex; flex-direction: column; gap: 16px; max-width: var(--du-maxw, 1100px); margin: 0 auto; }
  .beta-banner { display:flex; align-items:center; gap:10px; background: var(--du-highlight); border:1px solid #e5e388; color:#4a3b00; padding:8px 12px; border-radius: var(--du-radius); }
  .beta-banner a { color: inherit; text-decoration: underline; }
  .beta-badge { background:#ffb84d; color:#4a3b00; font-weight: 700; font-size: 0.72rem; padding:2px 6px; border-radius:4px; letter-spacing: .5px; }

  .toolbar { display: flex; gap: 12px; align-items: flex-end; justify-content: space-between; padding-bottom: 8px; border-bottom: 1px solid var(--du-border); }
  .toolbar .left { display: flex; flex-direction: column; }
  .toolbar .left .muted { color: var(--du-muted); font-size: 0.9em; }
  .toolbar .right { display: flex; gap: 6px; align-items: flex-end; flex-direction: column; }
  .toolbar .right .actions-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .toolbar .right .subhead { position: relative; font-size: 12px; font-weight: 800; letter-spacing: .08em; color: #111827; text-transform: uppercase; padding-bottom: 6px; align-self: flex-end; }
  .toolbar .right .subhead::after { content: ""; position: absolute; right: 0; bottom: 0; width: 140px; height: 3px; background: #2f313a; }
  .toolbar .left h1 { position: relative; display: inline-block; padding-bottom: 6px; margin: 0; }
  .toolbar .left h1::after { content: ""; position: absolute; left: 0; bottom: 0; width: 120px; height: 3px; background: #2f313a; border-radius: 0; }
  .status { display:flex; gap: 12px; align-items: center; flex-wrap: wrap; color: var(--du-muted); font-size: 0.9em; }

  .pane { display: flex; flex-direction: column; gap: 8px; }
  .pane-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .list { display: flex; flex-direction: column; gap: 6px; }
  .row { display: grid; grid-template-columns: 180px 1fr; align-items: center; gap: 8px; padding: 10px; border: 1px solid #2f313a; border-radius: var(--du-radius); background: #fcfcfd; box-shadow: none; }
  .label { font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--du-text); border-right: 1px solid black; text-align:left; }
  .btn-chan { background:#fff; padding:6px 8px; cursor:pointer; border:1px solid black; }
  .btn-chan:hover { background:#f9fafb; }
  .btn-chan.disabled { opacity: 0.6; cursor: default; }
  .actions .btn { border: 1px solid var(--du-border); background: #fff; color: var(--du-text); padding: 6px 10px; font-size: 13px; line-height: 1; border-radius: var(--du-radius); }
  .actions .btn:hover { background: #f9fafb; }

  .field { display: inline-flex; align-items: center; gap: 6px; }
  .actions-row input[type=number] { width: 80px; padding: 6px 8px; border: 1px solid var(--du-border); border-radius: var(--du-radius); background: #fff; }
  .events { flex: 1; overflow: hidden; position: relative; height: 28px; }
  .mod-canvas-overlay { position: absolute; inset: 0; width: 100%; height: 100%; display: block; background: transparent; pointer-events: none; }
  .strip { position: absolute; inset: 0; }
  .evt { position: absolute; left: 0; top: 6px; animation: flow-right var(--dur, 3000ms) linear forwards; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; padding: 0 3px; border: none; background: #fff; color: rgba(17, 24, 39, var(--a, 1)); white-space: nowrap; border-radius: 2px; }
  @keyframes flow-right { from { left: 0; } to { left: calc(100% + 100px); } }
  .hint { color: #888; font-size: 12px; padding: 2px 0; }
  
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; z-index: 1000; padding: 20px; }
  .modal-panel { max-width: 98vw; max-height: 92vh; overflow: auto; padding: 4px; }
</style>
