<script>
  import { computeLoopEndTicks } from '~/lib/music/loop_utils';
  import { TICKS_PER_BEAT } from '~/lib/parsers/device_samples_parser';

  export let loop = null;
  export let w = 360;
  export let h = 60;
  export let playhead = null;

  // Use a prop callback instead of createEventDispatcher (deprecated in this codebase)
  export let onOpen = null;
  export let ariaLabel = 'Open MIDI editor';

  function snapRangeToCs(minN, maxN) {
    const minC = Math.floor(minN / 12) * 12;
    let maxC = Math.ceil(maxN / 12) * 12;
    if (maxN % 12 === 0) maxC += 12;
    if (maxC < minC + 12) maxC = minC + 12;
    return { minC, maxC };
  }

  function getBounds(loop) {
    const width = w, height = h;
    if (!loop || !loop.events || loop.events.length === 0) {
      return { w: width, h: height, minN: 0, maxN: 1, rangeN: 1, minT: 0, maxT: 1, rangeT: 1, steps: 16 };
    }
    let minN = Infinity, maxN = -Infinity, minT = 0, maxT = computeLoopEndTicks(loop);
    for (const ev of loop.events) { if (ev.note < minN) minN = ev.note; if (ev.note > maxN) maxN = ev.note; }
    const snapped = snapRangeToCs(minN, maxN);
    minN = snapped.minC;
    maxN = snapped.maxC;
    const rangeN = Math.max(1, maxN - minN + 1);
    const rangeT = Math.max(1, maxT - minT);
    const beats = Math.max(1, Math.round(rangeT / TICKS_PER_BEAT));
    const steps = Math.max(1, beats * 4);
    return { w: width, h: height, minN, maxN, rangeN, minT, maxT, rangeT, steps };
  }

  $: bounds = getBounds(loop);

  function handleClick(e) {
    // forward a simple "open" event to parent
  if (typeof onOpen === 'function') onOpen();
  }

  function handleKeydown(e) {
    const k = e.key;
    if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
      e.preventDefault();
      handleClick();
    }
  }
</script>

{#if loop && loop.events && loop.events.length}
  <svg class="pianoroll" viewBox={`0 0 ${bounds.w} ${bounds.h}`} preserveAspectRatio="none" on:click={handleClick} role="button" tabindex="0" aria-label={ariaLabel} on:keydown={handleKeydown}>
    <!-- light grid lines to resemble MIDI editor -->
    {#each Array(bounds.steps + 1) as _, i}
      <line x1={(i/bounds.steps)*bounds.w} y1="0" x2={(i/bounds.steps)*bounds.w} y2={bounds.h} stroke="#edf0f4" stroke-width="1" />
    {/each}
    {#each Array(4) as _, i}
      <line x1="0" y1={(i/4)*bounds.h} x2={bounds.w} y2={(i/4)*bounds.h} stroke="#f0f2f4" stroke-width="1" />
    {/each}
    {#each loop.events as ev}
      {@const x = (ev.time_ticks_press - bounds.minT) / bounds.rangeT * bounds.w}
      {@const wRect = Math.max(1, (ev.time_ticks_release - ev.time_ticks_press) / bounds.rangeT * bounds.w)}
      {@const y = (bounds.maxN - ev.note) / bounds.rangeN * bounds.h}
      {@const lane = Math.max(1, bounds.h / Math.max(1,bounds.rangeN))}
      {@const intensity = 0.35 + (Math.max(1,Math.min(127, ev.velocity||100))/127)*0.55}
      <rect x={x} y={y} width={wRect} height={lane-1} fill={`rgba(0,0,0,${intensity.toFixed(3)})`} />
    {/each}
    {#if playhead !== null && playhead >= 0 && playhead <= 1}
      {@const px = playhead * bounds.w}
      <line x1={px} y1="0" x2={px} y2={bounds.h} stroke="#111827" stroke-width="2" opacity="0.6" />
    {/if}
  </svg>
{:else}
  <svg class="pianoroll" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" on:click={handleClick} role="button" tabindex="0" aria-label={ariaLabel} on:keydown={handleKeydown}>
    <rect x="0" y="0" width={w} height={h} fill="#f8fafc" />
    <text x="8" y="60%" fill="#9ca3af" font-size="12">Empty</text>
  </svg>
{/if}

<style>
.pianoroll { background: #fff; border-radius: 6px; padding: 6px; font-size: 0.9em; height: 100%; width: 100%; display: block; }
</style>
