<script>
  const {
    playing = false,
    onToggle = null,
    class: className = '',
    ...rest
  } = $props();

  function handleClick(event) {
    if (typeof onToggle === 'function') onToggle(event);
  }
</script>

<button
  {...rest}
  type="button"
  class={`play-stop-button ${className}`.trim()}
  aria-pressed={playing}
  aria-label={playing ? 'Stop' : 'Play'}
  title={playing ? 'Stop' : 'Play'}
  onclick={handleClick}
>
  {#if playing}
    <svg class="stop-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="1"></rect>
    </svg>
    <span class="sr-only">Stop</span>
  {:else}
    <svg class="play-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5l12 7-12 7z"></path>
    </svg>
    <span class="sr-only">Play</span>
  {/if}
</button>

<style>
  .play-stop-button {
    border: 1px solid #2f313a;
    background: #f2f3f5;
    color: #111827;
    border-radius: 6px;
    width: 32px;
    height: 32px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    appearance: none;
  }

  .play-stop-button:hover {
    background: #e9ebee;
  }

  .play-stop-button:disabled {
    background: #f3f4f6;
    color: #9ca3af;
    border-color: #e5e7eb;
    cursor: not-allowed;
  }

  .play-stop-button svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .play-stop-button svg.play-icon {
    fill: #1d6f3a;
    stroke: none;
  }

  .play-stop-button svg.stop-icon {
    fill: #b45309;
    stroke: none;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
