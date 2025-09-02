<script>
  import { computeLoopEndTicks } from '~/lib/music/loop_utils';

  export let loop = null;
  export let w = 300;
  export let h = 48;

  // Use a prop callback instead of createEventDispatcher (deprecated in this codebase)
  export let onOpen = null;
  export let ariaLabel = 'Open MIDI editor';

  function getBounds(loop) {
    const width = w, height = h;
    if (!loop || !loop.events || loop.events.length === 0) return { w: width, h: height, minN: 0, maxN: 1, rangeN: 1, minT: 0, maxT: 1, rangeT: 1 };
    let minN = Infinity, maxN = -Infinity, minT = 0, maxT = computeLoopEndTicks(loop);
    for (const ev of loop.events) { if (ev.note < minN) minN = ev.note; if (ev.note > maxN) maxN = ev.note; }
    const rangeN = Math.max(1, maxN - minN + 1);
    const rangeT = Math.max(1, maxT - minT);
    return { w: width, h: height, minN, maxN, rangeN, minT, maxT, rangeT };
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
    {#each loop.events as ev}
      {@const x = (ev.time_ticks_press - bounds.minT) / bounds.rangeT * bounds.w}
      {@const wRect = Math.max(1, (ev.time_ticks_release - ev.time_ticks_press) / bounds.rangeT * bounds.w)}
      {@const y = (bounds.maxN - ev.note) / bounds.rangeN * bounds.h}
      <rect x={x} y={y} width={wRect} height={Math.max(1, bounds.h / Math.max(1,bounds.rangeN))} fill="#4a90e2" />
    {/each}
  </svg>
{:else}
  <svg class="pianoroll" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" on:click={handleClick} role="button" tabindex="0" aria-label={ariaLabel} on:keydown={handleKeydown}>
    <rect x="0" y="0" width={w} height={h} fill="#f7f7f7" />
  </svg>
{/if}

<style>
.pianoroll { background: #f7f7f7; border-radius: var(--du-radius); padding: 6px; font-size: 0.9em; height: 100%; width: 100%; display: block; }
</style>
