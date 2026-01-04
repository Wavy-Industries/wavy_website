<script lang="ts">
  import { soundBackend, type SynthChannelConfig, type OscType, type ModRouting, type FilterType } from '~/lib/soundBackend';
  import { savePatch, loadPatch, patchManagerState, deletePatch } from '~/features/device-utility/states/patchManager.svelte';
  const { channel, onClose, refreshKey = 0, onReset = null } = $props<{ channel: number; onClose: () => void; refreshKey?: number; onReset?: (()=>void) | null }>();

  const cfg = $state<SynthChannelConfig>(soundBackend.getChannelConfig(channel));
  const WAVE_TYPES: OscType[] = ['sine','square','sawtooth','triangle'];
  const WAVE_TYPES_OSC2: OscType[] = ['sine','square','sawtooth','triangle','supersaw','fold','pulse'];

  function setCfg(patch: Partial<SynthChannelConfig>) {
    Object.assign(cfg, patch);
    soundBackend.setChannelConfig(channel, patch);
    try {
      const key = 'wavy_playground_synth_cfg_v1';
      const raw = localStorage.getItem(key);
      const obj = raw ? JSON.parse(raw) : {};
      obj[String(channel)] = soundBackend.getChannelConfig(channel);
      localStorage.setItem(key, JSON.stringify(obj));
    } catch {}
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
        else if (type==='supersaw') y = mid - A*(2*t-1)*0.9 - A*0.1*Math.sin(t*8*Math.PI);
        else if (type==='fold') y = mid - A*Math.sin(t*2*Math.PI*2.5);
        else if (type==='pulse') y = t<0.25? mid-A : mid+A;
        else if (type==='noise') y = mid + A*(Math.random()*2-1)*0.3;
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
  // When refreshKey changes (e.g., reset from parent), reload config from backend
  $effect(() => {
    void refreshKey; // dependency
    const latest = soundBackend.getChannelConfig(channel);
    Object.assign(cfg, latest);
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
  
  // Patch management
  let showPatchDialog = $state(false);
  let showLoadDialog = $state(false);
  let patchName = $state('');
  
  function handleSave() {
    showPatchDialog = true;
    patchName = `CH${channel + 1} Patch ${Date.now()}`;
  }
  
  function confirmSave() {
    if (patchName.trim()) {
      savePatch(channel, patchName.trim());
      showPatchDialog = false;
      patchName = '';
    }
  }
  
  function handleLoad() {
    showLoadDialog = true;
  }
  
  function selectPatch(patchId: string) {
    loadPatch(patchId, channel);
    showLoadDialog = false;
    // Trigger refresh
    const latest = soundBackend.getChannelConfig(channel);
    Object.assign(cfg, latest);
  }
</script>

<div class="editor">
  <div class="head">
    <h3>Channel {channel + 1} Synth</h3>
    <div class="head-actions">
      <button class="btn" onclick={handleSave}>Save Patch</button>
      <button class="btn" onclick={handleLoad}>Load Patch</button>
      <button class="btn primary" onclick={() => { if (typeof onReset==='function') onReset(); }}>Reset</button>
      <button class="btn" onclick={onClose}>Close</button>
    </div>
  </div>
  <div class="stack">
<details class="card" open>
      <summary class="card-title">Oscillator 1</summary>
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
      <div class="row">
        <label class="field">Output Gain
          <input type="range" min="0" max="1" step="0.01" value={cfg.masterGain} oninput={(e)=>setCfg({ masterGain: Number((e.target as HTMLInputElement).value) })} />
          <span class="val">{Math.round(cfg.masterGain*100)}%</span>
        </label>
      </div>
    </details>
    <details class="card">
      <summary class="card-title">Oscillator 2</summary>
      <div class="row">
        <label class="field">Routing
          <select value={cfg.osc2Routing} onchange={(e)=>setCfg({ osc2Routing: (e.target as HTMLSelectElement).value as ModRouting })}>
            <option value="off">Off</option>
            <option value="mix">Mix</option>
            <option value="am">AM</option>
            <option value="fm">FM</option>
          </select>
        </label>
      </div>
      <div class="waves waves-extended">
        {#each WAVE_TYPES_OSC2 as w}
          <button class="wave {cfg.osc2Type===w?'active':''}" onclick={() => setCfg({ osc2Type: w })}>
            <canvas use:waveCanvas={w}></canvas>
            <span class="wave-name">{w}</span>
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
    </details>
    <details class="card">
      <summary class="card-title">Performance</summary>
      {#if cfg.monophonic}
        <div class="row">
          <label class="field">Portamento
            <input type="range" min="0" max="0.4" step="0.005" value={cfg.portamentoSec ?? 0} oninput={(e)=>setCfg({ portamentoSec: Number((e.target as HTMLInputElement).value) })} />
            <span class="val">{(cfg.portamentoSec ?? 0).toFixed(3)}s</span>
          </label>
        </div>
      {/if}
      <div class="row">
        <label class="field">LFO Rate
          <input type="range" min="0.1" max="12" step="0.1" value={cfg.lfoRateHz ?? 5.5} oninput={(e)=>setCfg({ lfoRateHz: Number((e.target as HTMLInputElement).value) })} />
          <span class="val">{(cfg.lfoRateHz ?? 5.5).toFixed(1)} Hz</span>
        </label>
      </div>
      <div class="row">
        <label class="field">LFO Depth
          <input type="range" min="0" max="1" step="0.01" value={cfg.lfoDepth ?? 0} oninput={(e)=>setCfg({ lfoDepth: Number((e.target as HTMLInputElement).value) })} />
          <span class="val">{Math.round((cfg.lfoDepth ?? 0) * 100)}%</span>
        </label>
      </div>
      <div class="row">
        <label class="field">LFO CC1 Scale
          <input type="range" min="0" max="1" step="0.01" value={cfg.lfoCc1Scale ?? 1} oninput={(e)=>setCfg({ lfoCc1Scale: Number((e.target as HTMLInputElement).value) })} />
          <span class="val">{Math.round((cfg.lfoCc1Scale ?? 1) * 100)}%</span>
        </label>
      </div>
    </details>
    <details class="card" open>
      <summary class="card-title">Filter</summary>
      <label class="field">Type
        <select value={cfg.filterType} onchange={(e)=>setCfg({ filterType: (e.target as HTMLSelectElement).value as any })}>
          <option value="none">None</option>
          <option value="lowpass">Low Pass</option>
          <option value="highpass">High Pass</option>
          <option value="bandpass">Band Pass</option>
        </select>
      </label>
      {#if cfg.filterType !== 'none'}
        <div class="row">
          <label class="field">Frequency
            <input type="range" min="20" max="20000" step="1" value={cfg.filterFrequency} oninput={(e)=>setCfg({ filterFrequency: Number((e.target as HTMLInputElement).value) })} />
            <span class="val">{Math.round(cfg.filterFrequency)}Hz</span>
          </label>
        </div>
        <div class="row">
          <label class="field">Resonance (Q)
            <input type="range" min="0.1" max="20" step="0.1" value={cfg.filterQ} oninput={(e)=>setCfg({ filterQ: Number((e.target as HTMLInputElement).value) })} />
            <span class="val">{cfg.filterQ.toFixed(1)}</span>
          </label>
        </div>
        <div class="row">
          <label class="field">Envelope Amount
            <input type="range" min="-1" max="1" step="0.01" value={cfg.filterEnvAmount} oninput={(e)=>setCfg({ filterEnvAmount: Number((e.target as HTMLInputElement).value) })} />
            <span class="val">{(cfg.filterEnvAmount >= 0 ? '+' : '')}{(cfg.filterEnvAmount * 100).toFixed(0)}%</span>
          </label>
        </div>
      {/if}
    </details>

    <details class="card">
      <summary class="card-title">Mod Wheel</summary>
      <div class="row">
        <label class="field">Cutoff Amount
          <input type="range" min="0" max="1" step="0.01" value={cfg.mod?.cutoff ?? 0} oninput={(e)=>setCfg({ mod: { ...cfg.mod, cutoff: Number((e.target as HTMLInputElement).value) } })} />
          <span class="val">{Math.round((cfg.mod?.cutoff ?? 0) * 100)}%</span>
        </label>
      </div>
      <div class="row">
        <label class="field">Vibrato Amount
          <input type="range" min="0" max="1" step="0.01" value={cfg.mod?.vibrato ?? 0} oninput={(e)=>setCfg({ mod: { ...cfg.mod, vibrato: Number((e.target as HTMLInputElement).value) } })} />
          <span class="val">{Math.round((cfg.mod?.vibrato ?? 0) * 100)}%</span>
        </label>
      </div>
      <div class="row">
        <label class="field">Tremolo Amount
          <input type="range" min="0" max="1" step="0.01" value={cfg.mod?.tremolo ?? 0} oninput={(e)=>setCfg({ mod: { ...cfg.mod, tremolo: Number((e.target as HTMLInputElement).value) } })} />
          <span class="val">{Math.round((cfg.mod?.tremolo ?? 0) * 100)}%</span>
        </label>
      </div>
      <div class="row">
        <label class="field">Osc2 Depth (Mix/AM/FM)
          <input type="range" min="0" max="1" step="0.01" value={cfg.mod?.osc2Depth ?? 0} oninput={(e)=>setCfg({ mod: { ...cfg.mod, osc2Depth: Number((e.target as HTMLInputElement).value) } })} />
          <span class="val">{Math.round((cfg.mod?.osc2Depth ?? 0) * 100)}%</span>
        </label>
      </div>
      <div class="row">
        <label class="field">Detune Spread
          <input type="range" min="0" max="1" step="0.01" value={cfg.mod?.spread ?? 0} oninput={(e)=>setCfg({ mod: { ...cfg.mod, spread: Number((e.target as HTMLInputElement).value) } })} />
          <span class="val">{Math.round((cfg.mod?.spread ?? 0) * 100)}%</span>
        </label>
      </div>
      <div class="row">
        <label class="field">Mod Sensitivity
          <input type="range" min="0" max="2" step="0.01" value={cfg.modSensitivity ?? 1} oninput={(e)=>setCfg({ modSensitivity: Number((e.target as HTMLInputElement).value) })} />
          <span class="val">{Math.round((cfg.modSensitivity ?? 1) * 100)}%</span>
        </label>
      </div>
    </details>

    <details class="card">
      <summary class="card-title">FX</summary>
      <div class="row">
        <label class="field">Drive
          <input type="range" min="0" max="1" step="0.01" value={cfg.drive ?? 0} oninput={(e)=>setCfg({ drive: Number((e.target as HTMLInputElement).value) })} />
          <span class="val">{Math.round((cfg.drive ?? 0) * 100)}%</span>
        </label>
      </div>
      <div class="row">
        <label class="field">Chorus Mix
          <input type="range" min="0" max="1" step="0.01" value={cfg.chorusMix ?? 0} oninput={(e)=>setCfg({ chorusMix: Number((e.target as HTMLInputElement).value) })} />
          <span class="val">{Math.round((cfg.chorusMix ?? 0) * 100)}%</span>
        </label>
      </div>
      <div class="row">
        <label class="field">Chorus Depth
          <input type="range" min="0" max="20" step="0.5" value={cfg.chorusDepthMs ?? 0} oninput={(e)=>setCfg({ chorusDepthMs: Number((e.target as HTMLInputElement).value) })} />
          <span class="val">{(cfg.chorusDepthMs ?? 0).toFixed(1)} ms</span>
        </label>
      </div>
      <div class="row">
        <label class="field">Chorus Rate
          <input type="range" min="0.1" max="7" step="0.1" value={cfg.chorusRateHz ?? 0.5} oninput={(e)=>setCfg({ chorusRateHz: Number((e.target as HTMLInputElement).value) })} />
          <span class="val">{(cfg.chorusRateHz ?? 0.5).toFixed(1)} Hz</span>
        </label>
      </div>
    </details>
    <details class="card" open>
      <summary class="card-title">ADSR</summary>
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
    </details>
    
    <details class="card">
      <summary class="card-title">EQ (3-Band)</summary>
      <div class="row">
        <label class="field">Low (100Hz)
          <input type="range" min="-12" max="12" step="0.5" value={cfg.eqLowGain ?? 0} oninput={(e)=>setCfg({ eqLowGain: Number((e.target as HTMLInputElement).value) })} />
          <span class="val">{(cfg.eqLowGain ?? 0) >= 0 ? '+' : ''}{(cfg.eqLowGain ?? 0).toFixed(1)} dB</span>
        </label>
      </div>
      <div class="row">
        <label class="field">Mid (1kHz)
          <input type="range" min="-12" max="12" step="0.5" value={cfg.eqMidGain ?? 0} oninput={(e)=>setCfg({ eqMidGain: Number((e.target as HTMLInputElement).value) })} />
          <span class="val">{(cfg.eqMidGain ?? 0) >= 0 ? '+' : ''}{(cfg.eqMidGain ?? 0).toFixed(1)} dB</span>
        </label>
      </div>
      <div class="row">
        <label class="field">High (8kHz)
          <input type="range" min="-12" max="12" step="0.5" value={cfg.eqHighGain ?? 0} oninput={(e)=>setCfg({ eqHighGain: Number((e.target as HTMLInputElement).value) })} />
          <span class="val">{(cfg.eqHighGain ?? 0) >= 0 ? '+' : ''}{(cfg.eqHighGain ?? 0).toFixed(1)} dB</span>
        </label>
      </div>
    </details>
  </div>
</div>

{#if showPatchDialog}
  <div class="modal-layer">
    <button
      class="modal-overlay"
      type="button"
      aria-label="Close dialog"
      onclick={() => showPatchDialog = false}
    ></button>
    <div class="modal-dialog" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <h4>Save Patch</h4>
      <input type="text" bind:value={patchName} placeholder="Patch name" class="patch-input" />
      <div class="modal-actions">
        <button class="btn" onclick={() => showPatchDialog = false}>Cancel</button>
        <button class="btn primary" onclick={confirmSave}>Save</button>
      </div>
    </div>
  </div>
{/if}

{#if showLoadDialog}
  <div class="modal-layer">
    <button
      class="modal-overlay"
      type="button"
      aria-label="Close dialog"
      onclick={() => showLoadDialog = false}
    ></button>
    <div class="modal-dialog" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <h4>Load Patch</h4>
      <div class="patch-list">
        {#if patchManagerState.patches.length === 0}
          <p class="empty-state">No saved patches</p>
        {:else}
          {#each patchManagerState.patches as patch}
            <div class="patch-item">
              <button class="patch-btn" onclick={() => selectPatch(patch.id)}>
                <span class="patch-name">{patch.name}</span>
                <span class="patch-info">CH{patch.channel}</span>
              </button>
              <button class="btn-delete" onclick={() => deletePatch(patch.id)} title="Delete patch">×</button>
            </div>
          {/each}
        {/if}
      </div>
      <div class="modal-actions">
        <button class="btn" onclick={() => showLoadDialog = false}>Close</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .editor { width: min(920px, 95vw); background: #fff; border: 1px solid #2f313a; border-radius: 8px; box-shadow: none; padding: 14px; }
  .head { display:flex; align-items:center; justify-content: space-between; }
  .head-actions { display:flex; gap:8px; align-items:center; }
  h3 { margin: 0; }
  .btn { border:1px solid var(--du-border); background:#fff; padding:6px 10px; border-radius:6px; cursor:pointer; }
  .btn.primary { background: #2b2f36; color: #fff; border-color: #1f2329; }
  .btn.primary:hover { filter: brightness(0.97); }
  .stack { display:flex; flex-direction: column; gap: 12px; margin-top: 8px; }
.card { border:1px solid var(--du-border); border-radius:8px; padding:0 10px 10px; background:#fcfcfd; }
.card-title { display:flex; align-items:center; justify-content:space-between; cursor:pointer; padding:10px 0; }
.card > .card-title { list-style: none; }
.card > summary { list-style: none; }
.card > summary::-webkit-details-marker { display:none; }
  .card-title { font-weight:700; margin-bottom:8px; }
  .waves { display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; }
  .waves-extended { grid-template-columns: repeat(4, 1fr); }
  .wave { display:flex; flex-direction:column; gap:4px; align-items:center; padding:6px; border:1px solid var(--du-border); border-radius:6px; background:#fff; cursor:pointer; }
  .wave.active { outline:2px solid #2563eb; }
  .wave canvas { width: 60px; height: 28px; display:block; }
  .wave-name { font-size: 0.85em; }
  .field { display:flex; align-items:center; gap:8px; }
  .field select, .field input[type=range] { flex:1; }
  .row { margin-top: 6px; }
  .val { color:#6b7280; font-variant-numeric: tabular-nums; }
  .adsr { width: 100%; height: 140px; border:1px dashed var(--du-border); border-radius:6px; background:#fff; }
  .adsr canvas { width: 100%; height: 100%; display:block; }
  .adsr-sliders { display:flex; gap:8px; margin-top:8px; }
  .field.small { flex-direction:column; align-items:flex-start; }
  
  .modal-layer { position:fixed; inset:0; display:flex; align-items:center; justify-content:center; z-index:10000; }
  .modal-overlay { position:absolute; inset:0; background:rgba(0,0,0,0.5); border:0; padding:0; margin:0; cursor:pointer; }
  .modal-dialog { position:relative; background:#fff; border-radius:8px; padding:20px; min-width:320px; max-width:90vw; max-height:80vh; overflow:auto; box-shadow:0 8px 24px rgba(0,0,0,0.2); }
  .modal-dialog h4 { margin:0 0 16px; }
  .patch-input { width:100%; padding:8px; border:1px solid var(--du-border); border-radius:6px; font-size:14px; margin-bottom:16px; }
  .modal-actions { display:flex; gap:8px; justify-content:flex-end; }
  .patch-list { display:flex; flex-direction:column; gap:8px; margin-bottom:16px; max-height:400px; overflow-y:auto; }
  .patch-item { display:flex; gap:8px; align-items:stretch; }
  .patch-btn { flex:1; display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border:1px solid var(--du-border); border-radius:6px; background:#fff; cursor:pointer; text-align:left; }
  .patch-btn:hover { background:#f9fafb; }
  .patch-name { font-weight:500; }
  .patch-info { color:#6b7280; font-size:0.9em; }
  .btn-delete { padding:6px 10px; border:1px solid #ef4444; color:#ef4444; background:#fff; border-radius:6px; cursor:pointer; font-size:18px; line-height:1; }
  .btn-delete:hover { background:#fef2f2; }
  .empty-state { color:#6b7280; text-align:center; padding:20px; }
</style>
