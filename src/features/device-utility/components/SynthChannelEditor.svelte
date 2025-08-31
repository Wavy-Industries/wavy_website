<script lang="ts">
  import { soundBackend, type SynthChannelConfig, type OscType, type ModRouting } from '~/lib/soundBackend';
  const { channel, onClose } = $props<{ channel: number; onClose: () => void }>();

  const cfg = $state<SynthChannelConfig>(soundBackend.getChannelConfig(channel));
  const WAVE_TYPES: OscType[] = ['sine','square','sawtooth','triangle'];

  function setCfg(patch: Partial<SynthChannelConfig>) {
    Object.assign(cfg, patch);
    soundBackend.setChannelConfig(channel, patch);
  }

  // Wave preview drawing
  function waveCanvas(node: HTMLCanvasElement, type: OscType) {
    const ctx = node.getContext('2d')!;
    const draw = () => {
      const w = node.width = node.clientWidth * (window.devicePixelRatio||1);
      const h = node.height = node.clientHeight * (window.devicePixelRatio||1);
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0,w,h);
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 2 * (window.devicePixelRatio||1);
      ctx.beginPath();
      const A = h*0.35, mid = h*0.5; const N = 64;
      for (let i=0;i<=N;i++){
        const x = (i/N)*w;
        let y=mid;
        const t = i/N;
        if (type==='sine') y = mid - A*Math.sin(t*2*Math.PI);
        else if (type==='square') y = t<0.5? mid-A : mid+A;
        else if (type==='sawtooth') y = mid - A*(2*t-1);
        else if (type==='triangle') y = mid - A*(1-4*Math.abs(Math.round(t-0.25)-(t-0.25)));
        if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
    };
    const ro = new ResizeObserver(draw); ro.observe(node);
    draw();
    return { destroy(){ ro.disconnect(); } };
  }

  // ADSR visual editor
  let adsrCanvas: HTMLCanvasElement;
  let dragging: 'a'|'d'|'s'|'r'|null = null;
  // UI state 0..1, mapped exponentially to engine seconds; graph stays linear.
  const adsrUI = $state<{ a: number; d: number; s: number; r: number }>({ a: 0.2, d: 0.25, s: 0.6, r: 0.2 });
  const minA = 0.001, maxA = 1.0;
  const minD = 0.001, maxD = 1.0;
  const minR = 0.001, maxR = 2.0;
  function timeFromUI(v:number, min:number, max:number){ return min * Math.pow(max/min, Math.max(0, Math.min(1, v))); }
  function uiFromTime(t:number, min:number, max:number){ const r = Math.log(Math.max(min, Math.min(max, t))/min) / Math.log(max/min); return Math.max(0, Math.min(1, isFinite(r) ? r : 0)); }
  $effect(() => {
    adsrUI.a = uiFromTime(cfg.adsr.attack, minA, maxA);
    adsrUI.d = uiFromTime(cfg.adsr.decay, minD, maxD);
    adsrUI.s = Math.max(0, Math.min(1, cfg.adsr.sustain));
    adsrUI.r = uiFromTime(cfg.adsr.release, minR, maxR);
  });
  function drawADSR() {
    const ctx = adsrCanvas.getContext('2d')!;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio||1));
    const rect = adsrCanvas.getBoundingClientRect();
    adsrCanvas.width = rect.width*dpr; adsrCanvas.height = rect.height*dpr;
    const w = rect.width, h = rect.height; ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    ctx.strokeStyle = '#d1d5db'; ctx.lineWidth = 1; ctx.strokeRect(0.5,0.5,w-1,h-1);
    // Linear UI values set segment widths independently (no auto-scaling)
    const baseX = 10, baseY = h-10, topY = 10; const innerW = (w-20);
    const Aui = Math.max(0, Math.min(1, adsrUI.a));
    const Dui = Math.max(0, Math.min(1, adsrUI.d));
    const Sui = Math.max(0, Math.min(1, adsrUI.s));
    const Rui = Math.max(0, Math.min(1, adsrUI.r));
    const maxApx = innerW * 0.33;
    const maxDpx = innerW * 0.33;
    const maxRpx = innerW * 0.34;
    const xA = baseX + Aui * maxApx;
    const xD = baseX + maxApx + Dui * maxDpx;
    const plateauStart = baseX + maxApx + maxDpx + 8;
    const xR = plateauStart + Rui * maxRpx;
    const sY = topY + (1-Sui) * (baseY-topY);
    ctx.strokeStyle = '#111827'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(xA, topY);
    ctx.lineTo(xD, sY);
    ctx.lineTo(plateauStart, sY);
    ctx.lineTo(xR, baseY);
    ctx.stroke();
    // handles
    const handles: [number, number, 'a'|'d'|'s'|'r'][] = [
      [xA, topY, 'a'],
      [xD, sY, 'd'],
      [xR, sY, 'r'],
    ];
    for (const [hx,hy] of handles) {
      ctx.fillStyle = '#2563eb'; ctx.beginPath(); ctx.arc(hx, hy, 4, 0, Math.PI*2); ctx.fill();
    }
    // sustain slider indicator
    ctx.strokeStyle = '#6b7280'; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(baseX, sY); ctx.lineTo(xR, sY); ctx.stroke(); ctx.setLineDash([]);
  }
  function adsrPointer(e: PointerEvent) {
    const rect = adsrCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    const w = rect.width; const baseX = 10; const innerW = (w-20);
    const maxApx = innerW * 0.33; const maxDpx = innerW * 0.33; const maxRpx = innerW * 0.34; const plateauStart = baseX + maxApx + maxDpx + 8;
    const xA = baseX + adsrUI.a * maxApx;
    const xD = baseX + maxApx + adsrUI.d * maxDpx;
    const xR = plateauStart + adsrUI.r * maxRpx;
    const S = Math.max(0, Math.min(1, adsrUI.s));
    const near = (a:number,b:number) => Math.abs(a-b) < 10;
    if (!dragging) {
      if (near(x, xA)) dragging = 'a';
      else if (near(x, xD)) dragging = 'd';
      else if (near(x, xR)) dragging = 'r';
      else if (true) {
        // check sustain line proximity
        const h = rect.height; const topY = 10; const baseY = h-10; const sY = topY + (1-S) * (baseY-topY);
        if (Math.abs(y - sY) < 12) dragging = 's';
      }
      else dragging = null;
    } else {
      const clamp = (v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
      if (dragging==='a') {
        const v = clamp((x - baseX)/maxApx, 0, 1);
        adsrUI.a = v;
        setCfg({ adsr: { ...cfg.adsr, attack: timeFromUI(v, minA, maxA) } });
      } else if (dragging==='d') {
        const v = clamp((x - (baseX + maxApx))/maxDpx, 0, 1);
        adsrUI.d = v;
        setCfg({ adsr: { ...cfg.adsr, decay: timeFromUI(v, minD, maxD) } });
      } else if (dragging==='r') {
        const v = clamp((x - plateauStart)/maxRpx, 0, 1);
        adsrUI.r = v;
        setCfg({ adsr: { ...cfg.adsr, release: timeFromUI(v, minR, maxR) } });
      } else if (dragging==='s') {
        const h = rect.height; const topY = 10; const baseY = h-10;
        const ny = clamp(y, topY, baseY);
        const newS = 1 - (ny - topY) / (baseY - topY);
        adsrUI.s = Math.max(0, Math.min(1, newS));
        setCfg({ adsr: { ...cfg.adsr, sustain: adsrUI.s } });
      }
    }
    drawADSR();
  }
  function adsrUp(){ dragging = null; }
  $effect(() => { drawADSR(); });
</script>

<div class="editor">
  <div class="head">
    <h3>Channel {channel + 1} Synth</h3>
    <button class="btn" onclick={onClose}>Close</button>
  </div>
  <div class="stack">
    <div class="card">
      <div class="card-title">Oscillator 1</div>
      <div class="waves">
        {#each WAVE_TYPES as w}
          <button class="wave {cfg.osc1Type===w?'active':''}" onclick={() => setCfg({ osc1Type: w })}>
            <canvas use:waveCanvas={w}></canvas>
            <span>{w}</span>
          </button>
        {/each}
      </div>
      <div class="row">
        <label class="field">Voices
          <input type="range" min="1" max="8" step="1" value={cfg.voices} oninput={(e)=>setCfg({ voices: Math.round(Number((e.target as HTMLInputElement).value)) })} />
          <span class="val">{cfg.voices}</span>
        </label>
      </div>
      <div class="row">
        <label class="field">Spread (cents)
          <input type="range" min="0" max="100" step="1" value={cfg.spreadCents} oninput={(e)=>setCfg({ spreadCents: Math.round(Number((e.target as HTMLInputElement).value)) })} />
          <span class="val">{cfg.spreadCents}c</span>
        </label>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Oscillator 2</div>
      <label class="field">Routing
        <select value={cfg.osc2Routing} onchange={(e)=>setCfg({ osc2Routing: (e.target as HTMLSelectElement).value as ModRouting })}>
          <option value="off">Off</option>
          <option value="mix">Mix</option>
          <option value="am">AM</option>
          <option value="fm">FM</option>
        </select>
      </label>
      <div class="waves">
        {#each WAVE_TYPES as w}
          <button class="wave {cfg.osc2Type===w?'active':''}" onclick={() => setCfg({ osc2Type: w })}>
            <canvas use:waveCanvas={w}></canvas>
            <span>{w}</span>
          </button>
        {/each}
      </div>
      <div class="row">
        <label class="field">Ratio
          <input type="range" min="0.25" max="8" step="0.01" value={cfg.osc2Ratio} oninput={(e)=>setCfg({ osc2Ratio: Number((e.target as HTMLInputElement).value) })} />
          <span class="val">{cfg.osc2Ratio.toFixed(2)}x</span>
        </label>
      </div>
      <div class="row">
        <label class="field">Level/Depth
          <input type="range" min="0" max="1" step="0.01" value={cfg.osc2Level} oninput={(e)=>setCfg({ osc2Level: Number((e.target as HTMLInputElement).value) })} />
          <span class="val">{Math.round(cfg.osc2Level*100)}%</span>
        </label>
      </div>
    </div>
    <div class="card">
      <div class="card-title">ADSR</div>
      <div class="adsr" onpointerdown={adsrPointer} onpointermove={(e)=>{ if (dragging) adsrPointer(e); }} onpointerup={adsrUp} onpointerleave={adsrUp}>
        <canvas bind:this={adsrCanvas}></canvas>
      </div>
      <div class="adsr-sliders">
        <label class="field small">A
          <input type="range" min="0" max="1" step="0.001" value={adsrUI.a} oninput={(e)=>{ const v=Number((e.target as HTMLInputElement).value); adsrUI.a=v; setCfg({ adsr: { ...cfg.adsr, attack: timeFromUI(v, minA, maxA) } }); drawADSR(); }} />
          <span class="val">{timeFromUI(adsrUI.a, minA, maxA).toFixed(3)}s</span>
        </label>
        <label class="field small">D
          <input type="range" min="0" max="1" step="0.001" value={adsrUI.d} oninput={(e)=>{ const v=Number((e.target as HTMLInputElement).value); adsrUI.d=v; setCfg({ adsr: { ...cfg.adsr, decay: timeFromUI(v, minD, maxD) } }); drawADSR(); }} />
          <span class="val">{timeFromUI(adsrUI.d, minD, maxD).toFixed(3)}s</span>
        </label>
        <label class="field small">S
          <input type="range" min="0" max="1" step="0.01" value={adsrUI.s} oninput={(e)=>{ const v=Number((e.target as HTMLInputElement).value); adsrUI.s=v; setCfg({ adsr: { ...cfg.adsr, sustain: v } }); drawADSR(); }} />
          <span class="val">{Math.round(adsrUI.s*100)}%</span>
        </label>
        <label class="field small">R
          <input type="range" min="0" max="1" step="0.001" value={adsrUI.r} oninput={(e)=>{ const v=Number((e.target as HTMLInputElement).value); adsrUI.r=v; setCfg({ adsr: { ...cfg.adsr, release: timeFromUI(v, minR, maxR) } }); drawADSR(); }} />
          <span class="val">{timeFromUI(adsrUI.r, minR, maxR).toFixed(3)}s</span>
        </label>
      </div>
    </div>
  </div>
</div>

<style>
  .editor { width: min(920px, 95vw); background: #fff; border: 1px solid #2f313a; border-radius: 8px; box-shadow: none; padding: 14px; }
  .head { display:flex; align-items:center; justify-content: space-between; }
  h3 { margin: 0; }
  .btn { border:1px solid var(--du-border); background:#fff; padding:6px 10px; border-radius:6px; cursor:pointer; }
  .stack { display:flex; flex-direction: column; gap: 12px; margin-top: 8px; }
  .card { border:1px solid var(--du-border); border-radius:8px; padding:10px; background:#fcfcfd; }
  .card-title { font-weight:700; margin-bottom:8px; }
  .waves { display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; }
  .wave { display:flex; flex-direction:column; gap:4px; align-items:center; padding:6px; border:1px solid var(--du-border); border-radius:6px; background:#fff; cursor:pointer; }
  .wave.active { outline:2px solid #2563eb; }
  .wave canvas { width: 60px; height: 28px; display:block; }
  .field { display:flex; align-items:center; gap:8px; }
  .field select, .field input[type=range] { flex:1; }
  .row { margin-top: 6px; }
  .val { color:#6b7280; font-variant-numeric: tabular-nums; }
  .adsr { width: 100%; height: 140px; border:1px dashed var(--du-border); border-radius:6px; background:#fff; }
  .adsr canvas { width: 100%; height: 100%; display:block; }
  .adsr-sliders { display:flex; gap:8px; margin-top:8px; }
  .field.small { flex-direction:column; align-items:flex-start; }
</style>
