import type { SynthChannelConfig } from '~/lib/soundBackend';
import { soundBackend } from '~/lib/soundBackend';

export type Patch = {
  id: string;
  name: string;
  channel: number;
  config: SynthChannelConfig;
  created: number;
};

const STORAGE_KEY = 'monkey-synth-patches';

export const patchManagerState = $state({
  patches: [] as Patch[],
  selectedPatchId: null as string | null,
});

// Load patches from localStorage
export function loadPatchesFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const patches = JSON.parse(stored);
      patchManagerState.patches = patches;
    }
  } catch (error) {
    console.error('Failed to load patches:', error);
  }
}

// Save patches to localStorage
function savePatchesToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patchManagerState.patches));
  } catch (error) {
    console.error('Failed to save patches:', error);
  }
}

// Save current channel config as a patch
export function savePatch(channel: number, name: string): Patch {
  const config = soundBackend.getChannelConfig(channel);
  const patch: Patch = {
    id: `patch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: name || `Patch ${patchManagerState.patches.length + 1}`,
    channel,
    config,
    created: Date.now(),
  };
  patchManagerState.patches.push(patch);
  savePatchesToStorage();
  return patch;
}

// Load a patch to a channel
export function loadPatch(patchId: string, targetChannel: number) {
  const patch = patchManagerState.patches.find(p => p.id === patchId);
  if (!patch) {
    console.error('Patch not found:', patchId);
    return;
  }
  soundBackend.setChannelConfig(targetChannel, patch.config);
  patchManagerState.selectedPatchId = patchId;
}

// Delete a patch
export function deletePatch(patchId: string) {
  const index = patchManagerState.patches.findIndex(p => p.id === patchId);
  if (index >= 0) {
    patchManagerState.patches.splice(index, 1);
    savePatchesToStorage();
    if (patchManagerState.selectedPatchId === patchId) {
      patchManagerState.selectedPatchId = null;
    }
  }
}

// Rename a patch
export function renamePatch(patchId: string, newName: string) {
  const patch = patchManagerState.patches.find(p => p.id === patchId);
  if (patch) {
    patch.name = newName;
    savePatchesToStorage();
  }
}

// Export patches as JSON
export function exportPatches(): string {
  return JSON.stringify(patchManagerState.patches, null, 2);
}

// Import patches from JSON
export function importPatches(json: string) {
  try {
    const imported = JSON.parse(json) as Patch[];
    // Validate structure
    if (!Array.isArray(imported)) throw new Error('Invalid patch format');
    for (const p of imported) {
      if (!p.id || !p.name || !p.config) throw new Error('Invalid patch structure');
    }
    // Merge with existing patches
    patchManagerState.patches.push(...imported);
    savePatchesToStorage();
  } catch (error) {
    console.error('Failed to import patches:', error);
    throw error;
  }
}

// Initialize on mount
if (typeof window !== 'undefined') {
  loadPatchesFromStorage();
}
