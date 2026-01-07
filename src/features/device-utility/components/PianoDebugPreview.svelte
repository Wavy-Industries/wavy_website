<script lang="ts">
  /**
   * Piano Debug Preview Component
   *
   * Displays an 88-key piano keyboard showing currently pressed notes.
   * Useful for debugging MIDI note on/off issues and hanging notes.
   */

  import { pianoDebugState, pianoDebugClearAll } from '~/features/device-utility/states/pianoDebug.svelte';

  // Standard 88-key piano: A0 (21) to C8 (108)
  const PIANO_START_NOTE = 21; // A0
  const PIANO_END_NOTE = 108; // C8
  const TOTAL_KEYS = PIANO_END_NOTE - PIANO_START_NOTE + 1; // 88 keys

  // Generate array of all 88 keys with their properties
  const keys = Array.from({ length: TOTAL_KEYS }, (_, i) => {
    const midiNote = PIANO_START_NOTE + i;
    const noteInOctave = midiNote % 12;
    const isBlackKey = [1, 3, 6, 8, 10].includes(noteInOctave);
    const octave = Math.floor(midiNote / 12) - 1;
    const noteName = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][noteInOctave];

    return {
      midiNote,
      isBlackKey,
      octave,
      noteName: `${noteName}${octave}`,
    };
  });

  // Check if a note is currently active
  function isNoteActive(midiNote: number): boolean {
    return pianoDebugState.activeNotes.has(midiNote);
  }

  // Count of currently active notes
  const activeCount = $derived(pianoDebugState.activeNotes.size);
</script>

<div class="piano-debug-preview">
  <div class="piano-header">
    <div class="piano-title">Piano Preview</div>
    <div class="piano-info">
      {#if activeCount > 0}
        <span class="active-count">{activeCount} note{activeCount === 1 ? '' : 's'} active</span>
      {:else}
        <span class="idle-text">No notes active</span>
      {/if}
    </div>
    <button class="clear-button" onclick={pianoDebugClearAll} title="Clear all hanging notes">
      Clear All
    </button>
  </div>

  <div class="piano-container">
    <div class="piano-keyboard">
      {#each keys as key (key.midiNote)}
        <div
          class="piano-key"
          class:black={key.isBlackKey}
          class:white={!key.isBlackKey}
          class:active={isNoteActive(key.midiNote)}
          title="{key.noteName} (MIDI {key.midiNote})"
        >
          {#if !key.isBlackKey && key.noteName.startsWith('C')}
            <span class="key-label">{key.noteName}</span>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .piano-debug-preview {
    background: #fcfcfd;
    border: 1px solid var(--du-border);
    border-radius: var(--du-radius);
    padding: 10px;
    margin-bottom: 6px;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }

  .piano-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    gap: 12px;
  }

  .piano-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .04em;
    color: var(--du-text);
  }

  .piano-info {
    flex: 1;
    text-align: center;
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  }

  .active-count {
    color: #dc2626;
    font-weight: 700;
  }

  .idle-text {
    color: var(--du-muted);
  }

  .clear-button {
    padding: 4px 8px;
    font-size: 11px;
    background: #2b2f36;
    color: #fff;
    border: 1px solid #1f2329;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: .04em;
    transition: filter 0.15s;
  }

  .clear-button:hover {
    filter: brightness(0.97);
  }

  .piano-container {
    overflow-x: auto;
    overflow-y: hidden;
    background: #fff;
    border: 1px solid var(--du-border);
    border-radius: var(--du-radius);
    padding: 8px;
    width: 100%;
    max-width: 100%;
  }

  .piano-keyboard {
    display: flex;
    position: relative;
    height: 80px;
    min-width: min(880px, 100%);
    width: max-content;
  }

  .piano-key {
    position: relative;
    border: 1px solid #d1d5db;
    cursor: default;
    transition: background-color 0.1s ease;
  }

  .piano-key.white {
    width: 10px;
    height: 80px;
    background: #ffffff;
    z-index: 1;
  }

  .piano-key.black {
    width: 6px;
    height: 50px;
    background: #2f313a;
    margin-left: -3px;
    margin-right: -3px;
    z-index: 2;
    border-color: #1f2329;
  }

  .piano-key.white.active {
    background: #10b981;
    border-color: #059669;
  }

  .piano-key.black.active {
    background: #34d399;
    border-color: #10b981;
  }

  .key-label {
    position: absolute;
    bottom: 4px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 7px;
    color: #9ca3af;
    white-space: nowrap;
    pointer-events: none;
    user-select: none;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  }

  .piano-key.active .key-label {
    color: #ffffff;
    font-weight: 700;
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .piano-container {
      padding: 6px;
    }

    .piano-keyboard {
      min-width: 660px;
      height: 60px;
    }

    .piano-key.white {
      width: 7.5px;
      height: 60px;
    }

    .piano-key.black {
      width: 4.5px;
      height: 38px;
    }

    .key-label {
      font-size: 6px;
      bottom: 2px;
    }
  }
</style>
