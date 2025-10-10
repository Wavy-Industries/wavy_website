<script lang="ts">
  import { updateTrackConfig, setTrackSliderValue } from '~/features/device-utility/states/playground.svelte';

  const { channel, track, refreshKey = 0, onReset = null, onClose } = $props<{
    channel: number;
    track?: import('~/lib/soundBackend').TrackConfigView;
    refreshKey?: number;
    onReset?: (() => void) | null;
    onClose: () => void;
  }>();

  let name = track?.name ?? `Track ${channel + 1}`;
  let script = track?.script ?? '';
  let localError: string | null = null;
  let saving = false;
  let sliderValues: Record<string, number> = track?.sliderValues ? { ...track.sliderValues } : {};

  $effect(() => {
    void refreshKey;
    name = track?.name ?? `Track ${channel + 1}`;
    script = track?.script ?? '';
    localError = null;
    sliderValues = track?.sliderValues ? { ...track.sliderValues } : {};
  });

  function save() {
    saving = true;
    try {
      updateTrackConfig(channel, { name, script });
      localError = null;
    } catch (err) {
      localError = err instanceof Error ? err.message : String(err);
    }
    saving = false;
  }

  function saveAndClose() {
    save();
    if (!localError) onClose();
  }

  function formatSliderValue(value: number, step?: number) {
    if (!Number.isFinite(value)) return '0';
    const precision = step && step > 0 ? Math.min(4, Math.max(0, Math.round(-Math.log10(step)))) : 2;
    const normalised = Number(value.toFixed(precision));
    return normalised.toString();
  }

  function handleSliderInput(slider: import('~/lib/soundBackend').TrackConfigView['sliders'][number], event: Event) {
    const target = event.target as HTMLInputElement;
    const value = Number(target.value);
    sliderValues = { ...sliderValues, [slider.id]: value };
    setTrackSliderValue(channel, slider.id, value);
  }

  const shortcuts = [
    'Return an object with onNoteOn/onNoteOff handlers',
    'Directly return a value or array to trigger simple sounds',
    'Access helpers: clamp(value,min,max), midiToFreq(note), velocityToUnit(velocity,scale)',
    'Set cut/duckorbit/orbit to manage sidechains and busses',
  ];
</script>

<div class="editor">
  <div class="head">
    <h3>Track {channel + 1} Script</h3>
    <div class="head-actions">
      <button class="btn" onclick={onClose}>Close</button>
      <button class="btn primary" onclick={saveAndClose} disabled={saving}>Save & Close</button>
    </div>
  </div>

  <div class="stack">
    <div class="card">
      <label class="field">Track name
        <input type="text" maxlength="40" bind:value={name} placeholder={`Track ${channel + 1}`} />
      </label>
      <div class="field info">
        <span class="label">Script helpers</span>
        <ul>
          {#each shortcuts as tip}
            <li>{tip}</li>
          {/each}
        </ul>
      </div>
      {#if track?.description}
        <div class="field description">{track.description}</div>
      {/if}
      {#if track?.error}
        <div class="field error">Current script error: {track.error}</div>
      {/if}
      {#if localError}
        <div class="field error">{localError}</div>
      {/if}
      {#if track?.sliders?.length}
        <div class="field sliders">
          <span class="label">Sound sliders</span>
          <div class="slider-list">
            {#each track.sliders as slider (slider.id)}
              <label class="slider">
                <div class="slider-head">
                  <span>{slider.label}</span>
                  <span class="slider-value">{formatSliderValue(sliderValues[slider.id] ?? slider.default, slider.step)}</span>
                </div>
                <input
                  type="range"
                  min={slider.min}
                  max={slider.max}
                  step={slider.step ?? 'any'}
                  value={sliderValues[slider.id] ?? slider.default}
                  oninput={(event) => handleSliderInput(slider, event)}
                />
                {#if slider.comment}
                  <div class="slider-comment">{slider.comment}</div>
                {/if}
              </label>
            {/each}
          </div>
        </div>
      {/if}
      <label class="field">Script
        <textarea bind:value={script} spellcheck="false" class="code" rows="18"></textarea>
      </label>
      <div class="actions">
        <button class="btn" onclick={save} disabled={saving}>Save</button>
        {#if typeof onReset === 'function'}
          <button class="btn" onclick={onReset}>Reset to default</button>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 620px;
    width: min(90vw, 720px);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .head h3 {
    margin: 0;
    font-size: 1.4rem;
  }
  .head-actions {
    display: flex;
    gap: 8px;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .card {
    background: #fff;
    border: 1px solid #2f313a;
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field.info ul {
    margin: 0;
    padding-left: 18px;
    font-size: 0.9rem;
    color: #4b5563;
  }
  .field.description {
    font-size: 0.9rem;
    color: #374151;
  }
  .field.sliders {
    gap: 12px;
  }
  .slider-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .slider {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .slider-head {
    display: flex;
    justify-content: space-between;
    font-size: 0.9rem;
    font-weight: 600;
  }
  .slider-value {
    font-variant-numeric: tabular-nums;
    color: #111827;
  }
  .slider input[type="range"] {
    width: 100%;
    accent-color: #111827;
  }
  .slider-comment {
    font-size: 0.85rem;
    color: #4b5563;
  }
  .field.error {
    color: #b91c1c;
    background: #fee2e2;
    border-radius: 6px;
    padding: 6px 8px;
    font-size: 0.9rem;
  }
  input[type="text"] {
    border: 1px solid #1f2937;
    border-radius: 6px;
    padding: 6px 8px;
    font-size: 1rem;
  }
  .code {
    font-family: var(--font-mono, 'Fira Code', monospace);
    border: 1px solid #1f2937;
    border-radius: 8px;
    padding: 10px;
    background: #0f172a;
    color: #f1f5f9;
    resize: vertical;
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .btn {
    border: 1px solid #111827;
    border-radius: 6px;
    background: #fff;
    padding: 6px 12px;
    cursor: pointer;
    font-weight: 600;
  }
  .btn.primary {
    background: #111827;
    color: #fff;
  }
  .btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .error {
    color: #b91c1c;
    margin-left: 8px;
    font-weight: 700;
  }
</style>
