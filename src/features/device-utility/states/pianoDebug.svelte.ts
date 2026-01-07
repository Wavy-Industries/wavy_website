/**
 * Piano Debug Preview State
 *
 * Manages the visibility and note tracking for the debug piano preview component.
 */

import { Log } from '~/lib/utils/Log';

const log = new Log('piano_debug', Log.LEVEL_DEBUG);

// Visibility state
let isVisible = $state(false);

// Active notes state - directly accessible by components
let activeNotes = $state<Set<number>>(new Set());

export const pianoDebugState = {
  get isVisible() {
    return isVisible;
  },
  set isVisible(value: boolean) {
    isVisible = value;
  },
  toggle() {
    isVisible = !isVisible;
  },
  get activeNotes() {
    return activeNotes;
  },
};

/**
 * Handle MIDI note on event
 */
export function pianoDebugNoteOn(note: number): void {
  log.debug(['Note ON', note]);
  activeNotes = new Set(activeNotes).add(note);
}

/**
 * Handle MIDI note off event
 */
export function pianoDebugNoteOff(note: number): void {
  log.debug(['Note OFF', note]);
  const newSet = new Set(activeNotes);
  newSet.delete(note);
  activeNotes = newSet;
}

/**
 * Clear all active notes (useful for debugging hanging notes)
 */
export function pianoDebugClearAll(): void {
  log.debug(['Clear all notes']);
  activeNotes = new Set();
}
