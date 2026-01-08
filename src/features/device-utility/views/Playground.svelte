<script lang="ts">
  import { midiControlState, initPlaygroundSynthPersistence, resetAllSynthChannels, resetSynthChannel, playgroundUI } from '~/features/device-utility/states/playground.svelte';
  import { drumKitState, selectDrumKit } from '~/features/device-utility/states/drumKits.svelte';
  import SynthChannelEditor from '~/features/device-utility/components/SynthChannelEditor.svelte';
  import { deviceState } from '~/features/device-utility/states/deviceState.svelte';
  import PlayStopButton from '~/features/device-utility/components/PlayStopButton.svelte';
  import { soundBackend, type EffectInstance, type EffectType, type TrackId } from '~/lib/soundBackend';
  import { onMount } from 'svelte';
  import PianoDebugPreview from '~/features/device-utility/components/PianoDebugPreview.svelte';
  import { pianoDebugState } from '~/features/device-utility/states/pianoDebug.svelte';

  type TrackDefinition = {
    id: string;
    label: string;
    channel: number | null;
    isDrums?: boolean;
    isMaster?: boolean;
    canOpenSettings?: boolean;
  };

  const trackDefinitions: TrackDefinition[] = [
    { id: '0', label: 'CH 1 (SOFT BELL)', channel: 0, canOpenSettings: true },
    { id: '1', label: 'CH 2 (PLUCK)', channel: 1, canOpenSettings: true },
    { id: '2', label: 'CH 3 (SAW LEAD)', channel: 2, canOpenSettings: true },
    { id: '3', label: 'CH 4 (SQUARE ORGAN)', channel: 3, canOpenSettings: true },
    { id: '4', label: 'CH 5 (MELLOW PAD)', channel: 4, canOpenSettings: true },
    { id: '5', label: 'CH 6 (REED ORGAN)', channel: 5, canOpenSettings: true },
    { id: '6', label: 'CH 7 (SYNTH BASS)', channel: 6, canOpenSettings: true },
    { id: '7', label: 'CH 8 (SYNTH PAD)', channel: 7, canOpenSettings: true },
    { id: '8', label: 'CH 9 (WIDE PAD)', channel: 8, canOpenSettings: true },
    { id: '9', label: 'CH 0 (DRUMS)', channel: 9, isDrums: true, canOpenSettings: false },
    { id: 'master', label: 'MASTER', channel: null, isMaster: true, canOpenSettings: false },
  ];

  type EffectControl = { key: string; label: string; min: number; max: number; step: number };
  type EffectDefinition = {
    label: string;
    shortLabel: string;
    color: string;
    defaults: Record<string, number>;
    controls: EffectControl[];
  };

  const effectDefinitions: Record<EffectType, EffectDefinition> = {
    reverb: {
      label: 'Reverb',
      shortLabel: 'R',
      color: '#d0393a',
      defaults: { mix: 0.3, time: 1.6, decay: 3.0, preDelay: 0.02 },
      controls: [
        { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01 },
        { key: 'time', label: 'Time', min: 0.2, max: 4, step: 0.05 },
        { key: 'preDelay', label: 'Pre-delay', min: 0, max: 0.2, step: 0.01 },
      ],
    },
    delay: {
      label: 'Delay',
      shortLabel: 'D',
      color: '#3a6ed0',
      defaults: { mix: 0.25, time: 0.35, feedback: 0.4 },
      controls: [
        { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01 },
        { key: 'time', label: 'Time', min: 0.05, max: 0.8, step: 0.01 },
        { key: 'feedback', label: 'Feedback', min: 0, max: 0.9, step: 0.01 },
      ],
    },
    chorus: {
      label: 'Chorus',
      shortLabel: 'C',
      color: '#2d9d6a',
      defaults: { mix: 0.2, depth: 0.4, rate: 1.4 },
      controls: [
        { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01 },
        { key: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01 },
        { key: 'rate', label: 'Rate', min: 0.1, max: 5, step: 0.1 },
      ],
    },
  };

  let effectInstanceCounter = 0;
  function createEffectInstance(type: EffectType): EffectInstance {
    const definition = effectDefinitions[type];
    effectInstanceCounter += 1;
    return {
      id: `${type}-${effectInstanceCounter}`,
      type,
      settings: { ...definition.defaults } as EffectInstance['settings'],
    };
  }

  const initialEffectsByTrack = Object.fromEntries(
    trackDefinitions.map((track) => [track.id, []]),
  ) as Record<string, EffectInstance[]>;
  const effectsByTrack = $state<Record<string, EffectInstance[]>>(initialEffectsByTrack);

  let effectMenuTrackKey = $state<string | null>(null);
  const effectPanelState = $state<{ trackKey: string | null; effectId: string | null }>({
    trackKey: null,
    effectId: null,
  });

  const trackDefinitionById = new Map(trackDefinitions.map((track) => [track.id, track]));
  function resolveTrackId(trackKey: string): TrackId | null {
    const definition = trackDefinitionById.get(trackKey);
    if (!definition) return null;
    if (definition.isMaster) return 'master';
    if (typeof definition.channel === 'number') return definition.channel;
    return null;
  }

  function syncTrackEffects(trackKey: string) {
    const trackId = resolveTrackId(trackKey);
    if (trackId === null) return;
    const effects = effectsByTrack[trackKey] ?? [];
    soundBackend.setTrackEffects(trackId, effects);
  }

  function toggleEffectMenu(trackKey: string) {
    effectMenuTrackKey = effectMenuTrackKey === trackKey ? null : trackKey;
  }

  function addEffectToTrack(trackKey: string, type: EffectType) {
    const next = [...(effectsByTrack[trackKey] ?? []), createEffectInstance(type)];
    effectsByTrack[trackKey] = next;
    syncTrackEffects(trackKey);
    effectMenuTrackKey = null;
  }

  function removeEffectFromTrack(trackKey: string, effectId: string) {
    effectsByTrack[trackKey] = (effectsByTrack[trackKey] ?? []).filter((effect) => effect.id !== effectId);
    syncTrackEffects(trackKey);
    if (effectPanelState.trackKey === trackKey && effectPanelState.effectId === effectId) {
      effectPanelState.trackKey = null;
      effectPanelState.effectId = null;
    }
  }

  function toggleEffectPanel(trackKey: string, effectId: string) {
    if (effectPanelState.trackKey === trackKey && effectPanelState.effectId === effectId) {
      effectPanelState.trackKey = null;
      effectPanelState.effectId = null;
      return;
    }
    effectPanelState.trackKey = trackKey;
    effectPanelState.effectId = effectId;
  }

  function updateEffectSetting(trackKey: string, effectId: string, key: string, value: number) {
    effectsByTrack[trackKey] = (effectsByTrack[trackKey] ?? []).map((effect) => {
      if (effect.id !== effectId) return effect;
      return { ...effect, settings: { ...effect.settings, [key]: value } };
    });
    syncTrackEffects(trackKey);
  }
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
  function eventIsNote(ev: any) { return ev.kind === 'noteon' || ev.kind === 'noteoff'; }
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
  const octaveValues = [-1, 0, 1, 2, 3, 4, 5, 6, 7];
  const effectLabels: Record<number, string> = {
    0: 'NONE',
    1: 'ARP',
    2: 'DOUBLE',
    3: 'DRM',
    4: 'STUTTER',
    5: 'ECHO',
    6: 'PAT',
  };
  const deviceChannelOrder = $derived(
    deviceState.channel != null && deviceState.channel > 9
      ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  );
  const effectOrder = [
    { id: 1, label: 'ARP' },
    { id: 2, label: 'DOUBLE' },
    { id: 4, label: 'STUTTER' },
    { id: 5, label: 'ECHO' },
    { id: 6, label: 'PAT' },
    { id: 3, label: 'DRM' },
  ];
  const effectPresets = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  const selectedChannel = $derived(deviceState.channel == null ? null : (deviceState.channel === 9 ? 10 : deviceState.channel + 1));
  const muteBits = $derived(deviceState.muteMask == null
    ? null
    : deviceChannelOrder.map((ch) => ((deviceState.muteMask >> (ch === 10 ? 9 : ch - 1)) & 1) === 1));
  const selectedEffectId = $derived(deviceState.effectId == null ? null : deviceState.effectId);
  const isKnownEffect = $derived(selectedEffectId == null || selectedEffectId === 0 ? true : effectOrder.some((opt) => opt.id === selectedEffectId));
  const hasEffect = $derived(selectedEffectId != null && selectedEffectId !== 0);
  const selectedPreset = $derived(deviceState.effectPreset == null || !hasEffect ? null : deviceState.effectPreset);
  // Use shared UI state for refresh key (nudges editor to reload)
  const refreshKey = $derived(playgroundUI.refreshKey);
  // Focus management for modal dialog
  let modalPanelEl = $state<HTMLDivElement | null>(null);
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

  onMount(() => {
    initPlaygroundSynthPersistence();
    for (const track of trackDefinitions) {
      const trackId = resolveTrackId(track.id);
      if (trackId === null) continue;
      effectsByTrack[track.id] = soundBackend.getTrackEffects(trackId);
    }
  });

  // When the dialog opens, move focus to it so ESC works immediately
  $effect(() => {
    if (selected.ch !== null && modalPanelEl) {
      try { modalPanelEl.focus(); } catch {}
    }
  });

  function resetAll() { resetAllSynthChannels(); }

  function resetChannel(ch: number) { resetSynthChannel(ch); }

  function handleDrumKitChange(e: Event) {
    const target = e.currentTarget as HTMLSelectElement;
    if (!target?.value) return;
    selectDrumKit(target.value);
  }
</script>

<div class="content">
  <div class="beta-banner">
    <span class="beta-badge">BETA</span>
    <span>This feature is in beta — please report issues to <a href="mailto:hello@wavyindustries.com">hello@wavyindustries.com</a>.</span>
  </div>

  <div class="toolbar">
    <div class="left">
      <h1>Playground</h1>
      <span class="muted">Go ahead, play on your MONKEY.</span>
    </div>
    <div class="right">
      {#if deviceState.isAvailable}
      <div class="status-item">
        <span class="status-label">Octave:</span>
        <span class="status-value">{deviceState.octave >= 0 ? '+' : ''}{deviceState.octave}</span>
      </div>
      {/if}
      <div class="status-item">
        <span class="status-label">BPM:</span>
        <span class="status-value" class:placeholder={!deviceState.bpmFromDevice}>{deviceState.bpm}</span>
      </div>
      <button
        class="piano-toggle-btn"
        class:active={pianoDebugState.isVisible}
        onclick={() => pianoDebugState.toggle()}
        title={pianoDebugState.isVisible ? "Hide piano debug preview" : "Show piano debug preview"}
        aria-label="Toggle piano debug preview"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
          <path d="M2 1v12h2V1H2zm3 0v12h2V8h2v5h2V8h2v5h2V1h-2v7H9V1H7v7H5V1H3z" fill="currentColor"/>
        </svg>
      </button>
    </div>
  </div>

  {#if pianoDebugState.isVisible}
    <PianoDebugPreview />
  {/if}

  {#if deviceState.isAvailable}
  <div class="state-details">
    <div class="detail-stack">
      <div class="detail-block">
        <span class="detail-label">Oct</span>
        <table class="mini-table" aria-label="Octave selection">
          <thead>
            <tr>
              {#each octaveValues as oct}
                <th>{oct}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            <tr>
              {#each octaveValues as oct}
                <td class:marked={deviceState.octave === oct}>{deviceState.octave === oct ? 'X' : ''}</td>
              {/each}
            </tr>
          </tbody>
        </table>
      </div>
      <div class="detail-block">
        <span class="detail-label">Channel</span>
        <table class="mini-table" aria-label="Selected channel">
          <thead>
            <tr>
              {#each deviceChannelOrder as ch}
                <th class:extended={ch > 10}>{ch}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            <tr>
              {#each deviceChannelOrder as ch}
                <td class:marked={selectedChannel === ch} class:extended={ch > 10}>{selectedChannel === ch ? 'X' : ''}</td>
              {/each}
            </tr>
          </tbody>
        </table>
      </div>
      <div class="detail-block">
        <span class="detail-label">Channel mute</span>
        {#if muteBits == null}
          <span class="detail-value">unset</span>
        {:else}
          <table class="mini-table" aria-label="Mute mask by channel">
            <thead>
              <tr>
                {#each deviceChannelOrder as ch}
                  <th class:extended={ch > 10}>{ch}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              <tr>
                {#each muteBits as muted, idx}
                  <td class:muted={muted} class:extended={deviceChannelOrder[idx] > 10}>{muted ? 'X' : ''}</td>
                {/each}
              </tr>
            </tbody>
          </table>
        {/if}
      </div>
    </div>
    <div class="detail-stack">
      <div class="detail-block">
        <span class="detail-label">BPM</span>
        <span class="detail-value" class:placeholder={!deviceState.bpmFromDevice}>{deviceState.bpmFromDevice ? deviceState.bpm : `${deviceState.bpm} (default)`}</span>
      </div>
      <div class="detail-block">
        <span class="detail-label">Hold</span>
        {#if deviceState.hold == null}
          <span class="detail-value">unset</span>
        {:else}
          <span class="lever" class:on={deviceState.hold} aria-label={deviceState.hold ? 'Hold on' : 'Hold off'}></span>
        {/if}
      </div>
    </div>
    <div class="detail-block detail-wide">
      <span class="detail-label">Effect</span>
      <table class="mini-table" aria-label="Effect selection">
        <thead>
          <tr>
            {#each effectOrder as effect}
              <th>{effect.label}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          <tr>
            {#each effectOrder as effect}
              <td class:marked={selectedEffectId === effect.id}>{selectedEffectId === effect.id ? 'X' : ''}</td>
            {/each}
          </tr>
        </tbody>
      </table>
      {#if hasEffect && !isKnownEffect}
        <span class="detail-note">unknown({selectedEffectId})</span>
      {/if}
      <table class="mini-table" aria-label="Effect preset selection">
        <thead>
          <tr>
            {#each effectPresets as preset}
              <th>{preset}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          <tr>
            {#each effectPresets as preset}
              <td class:marked={selectedPreset === preset}>{selectedPreset === preset ? 'X' : ''}</td>
            {/each}
          </tr>
        </tbody>
      </table>
    </div>
    <div class="detail-stack">
      <div class="detail-block">
        <span class="detail-label">Playback</span>
        {#if deviceState.playback == null}
          <span class="detail-value">unset</span>
        {:else}
          <PlayStopButton playing={!deviceState.playback} disabled={true} class="playback-indicator" />
        {/if}
      </div>
      <div class="detail-block">
        <span class="detail-label">Recording</span>
        {#if deviceState.recording == null}
          <span class="detail-value">unset</span>
        {:else}
          <span class="record-dot" class:active={deviceState.recording}></span>
        {/if}
      </div>
      <div class="detail-block">
        <span class="detail-label">Undo</span>
        <span class="detail-value">{deviceState.undoSession ?? 'unset'}</span>
      </div>
    </div>
  </div>
  {/if}

  <div class="pane">
    <div class="pane-header">
      <h3>Channel Activity</h3>
      <button class="btn-reset-all" title="Reset all synth channels to defaults" onclick={resetAll}>Reset All</button>
    </div>
    <div class="list">
      {#each trackDefinitions as track}
        {@const trackKey = track.id}
        {@const channel = track.channel}
        {@const isMaster = track.isMaster ?? false}
        {@const isDrums = track.isDrums ?? false}
        {@const canOpenSettings = track.canOpenSettings ?? false}
        {@const isActive = isMaster ? true : (channel !== null ? midiControlState.activeChannels[channel] : false)}
        {@const isDeviceSelected = channel !== null && deviceState.channel === channel}
        <div class="row" class:device-selected={isDeviceSelected}>
          <div class="track-cell">
            <div class="track-controls">
              <button
                class={`label btn-chan ${canOpenSettings ? '' : 'disabled'}`}
                class:device-selected={isDeviceSelected}
                title={isMaster ? 'Master track' : (isDrums ? 'Drums channel' : 'Edit synth')}
                onclick={() => { if (canOpenSettings && channel !== null) selected.ch = channel; }}
              >
                <span class="indicator {isActive ? 'active' : ''}" aria-label={isActive ? 'Active' : 'Inactive'}></span>
                <span class="chan-text">{track.label}</span>
                <span class={`gear ${canOpenSettings ? '' : 'muted'}`} aria-hidden="true">⚙</span>
              </button>
              <div class="fx-controls">
                <button class="btn-fx-add" title="Add effect" aria-label="Add effect" onclick={() => toggleEffectMenu(trackKey)}>+</button>
                {#if effectMenuTrackKey === trackKey}
                  <select
                    class="fx-select"
                    aria-label="Select effect"
                    onchange={(e) => {
                      const selectedEffectType = (e.currentTarget as HTMLSelectElement).value as EffectType;
                      if (selectedEffectType) addEffectToTrack(trackKey, selectedEffectType);
                    }}
                    onblur={() => { effectMenuTrackKey = null; }}
                  >
                    <option value="" selected disabled>Add effect</option>
                    {#each Object.entries(effectDefinitions) as [key, definition]}
                      <option value={key}>{definition.label}</option>
                    {/each}
                  </select>
                {/if}
                <div class="fx-rack">
                  {#each effectsByTrack[trackKey] ?? [] as effect (effect.id)}
                    {@const definition = effectDefinitions[effect.type]}
                    <button
                      class="fx-chip"
                      style={`--fx-color: ${definition.color};`}
                      title={definition.label}
                      onclick={() => toggleEffectPanel(trackKey, effect.id)}
                    >
                      {definition.shortLabel}
                    </button>
                  {/each}
                </div>
              </div>
            </div>
            {#if isDrums}
              <div class="drum-kit-row">
                <span class="drum-kit-label">Kit</span>
                <select
                  class="drum-kit-select"
                  value={drumKitState.selectedId ?? ''}
                  disabled={drumKitState.status === 'loading' || drumKitState.kits.length === 0}
                  onchange={handleDrumKitChange}
                >
                  {#each drumKitState.kits as kit}
                    <option value={kit.id}>{kit.name}</option>
                  {/each}
                </select>
                {#if drumKitState.status === 'loading'}
                  <span class="drum-kit-status">Loading…</span>
                {:else if drumKitState.status === 'error'}
                  <span class="drum-kit-status error">Kit unavailable</span>
                {/if}
              </div>
            {/if}
            {#if effectPanelState.trackKey === trackKey}
              {@const activeEffect = (effectsByTrack[trackKey] ?? []).find((effect) => effect.id === effectPanelState.effectId)}
              {#if activeEffect}
                {@const activeDefinition = effectDefinitions[activeEffect.type]}
                <div class="fx-panel">
                  <div class="fx-panel-header">
                    <span>{activeDefinition.label} settings</span>
                    <button
                      class="fx-panel-close"
                      aria-label="Close settings"
                      onclick={() => { effectPanelState.trackKey = null; effectPanelState.effectId = null; }}
                    >
                      ×
                    </button>
                  </div>
                  <div class="fx-controls-grid">
                    {#each activeDefinition.controls as control}
                      <label class="fx-control">
                        <span>{control.label}</span>
                        <input
                          type="range"
                          min={control.min}
                          max={control.max}
                          step={control.step}
                          value={activeEffect.settings[control.key]}
                          oninput={(e) => updateEffectSetting(trackKey, activeEffect.id, control.key, parseFloat(e.currentTarget.value))}
                        />
                        <span class="fx-value">{activeEffect.settings[control.key].toFixed(2)}</span>
                      </label>
                    {/each}
                  </div>
                  <button class="fx-remove" onclick={() => removeEffectFromTrack(trackKey, activeEffect.id)}>Delete effect</button>
                </div>
              {/if}
            {/if}
          </div>
          <div class={`events ${isMaster ? 'master' : ''}`}>
            {#if isMaster}
              <div class="master-strip">Master output</div>
            {:else if channel !== null}
              <canvas use:modCanvas={channel} class="mod-canvas-overlay"></canvas>
              <div class="strip">
                {#each midiControlState.events[channel] as ev (ev.id)}
                  {#if eventIsNote(ev)}
                    <div class="evt {ev.kind}"
                         style={`--a:${Math.max(0, Math.min(1, (ev.velocity ?? 0) / 127))}; --dur:${3000}ms;`}
                         title={fmtTime(ev.ts)}
                         onanimationend={() => removeEvent(channel, ev.id)}>{fmtEvent(ev)}</div>
                  {/if}
                {/each}
                {#if midiControlState.events[channel].filter(eventIsNote).length === 0}
                  <div class="hint">No events</div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>

{#if selected.ch !== null}
  <div
    class="modal-overlay"
    role="button"
    tabindex="0"
    aria-label="Close editor"
    onclick={() => selected.ch = null}
    onkeydown={(e) => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { selected.ch = null; } }}
  >
    <div class="modal-panel" role="dialog" aria-modal="true" tabindex="-1" bind:this={modalPanelEl} onclick={(e)=> e.stopPropagation()} onkeydown={(e) => { if (e.key === 'Escape') { selected.ch = null; } }}>
      <SynthChannelEditor channel={selected.ch!} refreshKey={refreshKey} onReset={() => resetChannel(selected.ch!)} onClose={() => selected.ch = null} />
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
  .toolbar .left h1 { position: relative; display: inline-block; padding-bottom: 6px; margin: 0; }
  .toolbar .left h1::after { content: ""; position: absolute; left: 0; bottom: 0; width: 120px; height: 3px; background: #2f313a; border-radius: 0; }
  .toolbar .right { display: flex; gap: 16px; align-items: center; }
  .status-item { display: flex; gap: 6px; align-items: baseline; font-size: 0.95em; }
  .status-label { color: var(--du-muted); }
  .status-value { font-weight: 600; font-variant-numeric: tabular-nums; }
  .toolbar .right { display:flex; align-items:center; gap:8px; }
  .status { display:flex; gap: 16px; align-items: center; flex-wrap: wrap; font-size: 0.95em; }
  .status-item { display: flex; gap: 6px; align-items: baseline; }
  .status-label { color: var(--du-muted); font-weight: 500; }
  .status-value { color: var(--du-text); font-weight: 600; font-family: monospace; font-size: 1.05em; }
  .status-value.placeholder { font-style: italic; }

  .piano-toggle-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #ffffff;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.15s ease;
    padding: 0;
  }
  .piano-toggle-btn:hover {
    background: #f3f4f6;
    border-color: #9ca3af;
    color: #374151;
  }
  .piano-toggle-btn.active {
    background: #3b82f6;
    border-color: #2563eb;
    color: #ffffff;
  }
  .piano-toggle-btn.active:hover {
    background: #2563eb;
    border-color: #1d4ed8;
  }
  .state-details {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 11px;
    border: 1px solid var(--du-border);
    background: #f8fafc;
    padding: 8px 10px;
    border-radius: var(--du-radius);
    margin-top: 6px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px 16px;
    align-items: flex-start;
  }
  .detail-stack { display: flex; flex-direction: column; gap: 8px; }
  .detail-block { display: flex; flex-direction: column; gap: 4px; }
  .detail-block.detail-wide { min-width: 280px; }
  .detail-label { color: #4b5563; text-transform: uppercase; letter-spacing: .08em; font-size: 10px; }
  .detail-value { font-variant-numeric: tabular-nums; }
  .detail-value.placeholder { font-style: italic; color: #6b7280; }
  .detail-note { color: #6b7280; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; }
  :global(.play-stop-button.playback-indicator) {
    width: 20px;
    height: 20px;
    border: none;
    background: transparent;
    padding: 0;
    cursor: default;
    box-shadow: none;
  }
  :global(.play-stop-button.playback-indicator:hover) { background: transparent; }
  .record-dot { width: 10px; height: 10px; border-radius: 999px; background: #9ca3af; box-shadow: inset 0 0 0 1px #6b7280; display: inline-block; }
  .record-dot.active { background: #dc2626; box-shadow: 0 0 6px rgba(220, 38, 38, 0.6); }
  .mini-table { border-collapse: collapse; border: 1px solid var(--du-border); }
  .mini-table th, .mini-table td { border: 1px solid var(--du-border); padding: 2px 5px; text-align: center; font-size: 10px; min-width: 18px; height: 18px; line-height: 14px; }
  .mini-table th { background: #eef2f7; font-weight: 700; }
  .mini-table th.extended { background: #fee2e2; color: #991b1b; }
  .mini-table td.marked { background: #111827; color: #fff; font-weight: 700; }
  .mini-table td.muted { background: #fff3a6; color: #6b5600; font-weight: 700; }
  .mini-table td.extended { background: #fecaca; color: #991b1b; border-color: #f87171; }
  .mini-table td.extended.marked { background: #dc2626; color: #fff; }
  .lever {
    min-width: 36px;
    height: 18px;
    border-radius: 4px;
    border: 1px solid #9ca3af;
    background: #f3f4f6;
    color: #4b5563;
    font-weight: 700;
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .lever::before { content: "OFF"; }
  .lever.on {
    background: #ffedd5;
    border-color: #f59e0b;
    color: #b45309;
  }
  .lever.on::before { content: "ON"; }

  .pane { display: flex; flex-direction: column; gap: 8px; }
  .pane-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .list { display: flex; flex-direction: column; gap: 6px; }
  .row { display: grid; grid-template-columns: 360px 1fr; align-items: start; gap: 8px; padding: 10px; border: 1px solid #2f313a; border-radius: var(--du-radius); background: #fcfcfd; box-shadow: none; }
  .row.device-selected { border-color: #f59e0b; background: #fff8e1; }
  @media (max-width: 860px) { .row { grid-template-columns: 1fr; } }
  .track-cell { display: flex; flex-direction: column; gap: 8px; }
  .track-controls { display: flex; align-items: center; gap: 8px; }
  .drum-kit-row { display: flex; align-items: center; gap: 8px; }
  .drum-kit-label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #4b5563; }
  .drum-kit-select { border: 1px solid #1f2329; border-radius: 4px; padding: 4px 6px; font-size: 12px; background: #fff; min-width: 140px; }
  .drum-kit-status { font-size: 11px; color: #6b7280; }
  .drum-kit-status.error { color: #b91c1c; }
  .label { font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--du-text); text-align:left; }
  .btn-chan { background:#fff; padding:6px 8px; cursor:pointer; border:1px solid black; display:flex; align-items:center; gap:6px; width: 100%; justify-content: flex-start; flex: 1; }
  .btn-chan.device-selected { box-shadow: inset 0 0 0 2px #f59e0b; border-color: #b45309; }
  .btn-chan:hover { background:#f9fafb; }
  .btn-chan.disabled { opacity: 0.6; cursor: default; }
  .btn-chan .gear { margin-left: auto; font-size: 18px; color: #000; line-height: 1; }
  .btn-chan .gear.muted { opacity: 0.5; }
.chan-text { white-space: nowrap; }
  .indicator { width: 8px; height: 8px; border-radius: 50%; background: #d1d5db; transition: background 0.15s ease; flex-shrink: 0; }
  .indicator.active { background: #10b981; box-shadow: 0 0 4px rgba(16, 185, 129, 0.5); }
  .btn-reset { border:1px solid var(--du-border); background:#fff; padding:6px 8px; border-radius:6px; cursor:pointer; }
  .btn-reset:hover { background:#f3f4f6; }
  .btn-reset-all { border: 1px solid #1f2329; background: #2b2f36; color: #fff; padding:6px 12px; border-radius:6px; cursor:pointer; }
  .btn-reset-all:hover { filter: brightness(0.97); }

  .field { display: inline-flex; align-items: center; gap: 6px; }
  .events { flex: 1; overflow: hidden; position: relative; height: 28px; }
  .events.master { height: auto; }
  .mod-canvas-overlay { position: absolute; inset: 0; width: 100%; height: 100%; display: block; background: transparent; pointer-events: none; z-index: 0; }
  .strip { position: absolute; inset: 0; z-index: 1; }
  .evt { position: absolute; left: 0; top: 6px; animation: flow-right var(--dur, 3000ms) linear forwards; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; padding: 0 3px; border: none; background: #fff; color: rgba(17, 24, 39, var(--a, 1)); white-space: nowrap; border-radius: 2px; }
  @keyframes flow-right { from { left: 0; } to { left: calc(100% + 100px); } }
  .hint { color: #888; font-size: 12px; padding: 2px 0; }

  .master-strip { font-size: 12px; color: #666; border: 1px dashed #c7cad1; border-radius: 4px; padding: 6px 8px; width: 100%; }

  .fx-controls { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .btn-fx-add { width: 24px; height: 24px; border-radius: 4px; border: 1px solid #1f2329; background: #fff; font-weight: 700; line-height: 1; cursor: pointer; }
  .btn-fx-add:hover { background: #f4f4f7; }
  .fx-select { border: 1px solid #1f2329; border-radius: 4px; padding: 2px 6px; font-size: 12px; background: #fff; }
  .fx-rack { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .fx-chip { width: 24px; height: 24px; border-radius: 4px; border: 1px solid #1f2329; background: var(--fx-color, #111); color: #fff; font-weight: 700; font-size: 12px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
  .fx-chip:hover { filter: brightness(0.95); }

  .fx-panel { border: 1px solid #1f2329; border-radius: 6px; background: #fff; padding: 8px; display: flex; flex-direction: column; gap: 8px; }
  .fx-panel-header { display: flex; align-items: center; justify-content: space-between; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; font-size: 11px; }
  .fx-panel-close { border: 1px solid #1f2329; background: #fff; width: 22px; height: 22px; border-radius: 4px; line-height: 1; cursor: pointer; }
  .fx-panel-close:hover { background: #f4f4f7; }
  .fx-controls-grid { display: grid; gap: 6px; }
  .fx-control { display: grid; grid-template-columns: 1fr 140px 44px; align-items: center; gap: 8px; font-size: 12px; color: #2b2f36; }
  .fx-control input[type="range"] { width: 100%; }
  .fx-value { font-variant-numeric: tabular-nums; font-size: 11px; text-align: right; color: #555; }
  .fx-remove { align-self: flex-start; border: 1px solid #1f2329; background: #fff; padding: 4px 8px; border-radius: 4px; font-size: 12px; cursor: pointer; }
  .fx-remove:hover { background: #f4f4f7; }
  
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; z-index: 1000; padding: 20px; }
.modal-panel { max-width: 98vw; max-height: 92vh; overflow: auto; padding: 4px; background:#fff; border-radius:10px; }

  @media (max-width: 900px) {
    .content { padding: 12px; max-width: 100%; }
    .toolbar { flex-direction: column; align-items: stretch; gap: 10px; }
    .toolbar .right { flex-wrap: wrap; justify-content: flex-start; }
    .status { gap: 8px; }
    .detail-block.detail-wide { min-width: 0; }
    .state-details { gap: 8px 10px; }
    .row { grid-template-columns: 1fr; }
    .fx-control { grid-template-columns: 1fr 120px 40px; }
  }

  @media (max-width: 600px) {
    .mini-table th, .mini-table td { font-size: 9px; min-width: 16px; }
  }
</style>
