import { soundBackend, type DrumKitIndexEntry } from '~/lib/soundBackend';

type DrumKitStatus = 'idle' | 'loading' | 'ready' | 'error';

const STORAGE_KEY = 'wavy_drum_kit_v1';

export const drumKitState = $state({
  kits: [] as DrumKitIndexEntry[],
  selectedId: null as string | null,
  status: 'idle' as DrumKitStatus,
  error: null as string | null,
});

async function fetchIndex(): Promise<DrumKitIndexEntry[]> {
  const res = await fetch('/assets/drums/index.json');
  if (!res.ok) throw new Error('Failed to load drum kit index');
  const kits = (await res.json()) as DrumKitIndexEntry[];
  return Array.isArray(kits) ? kits : [];
}

function persistSelected(id: string) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch {}
}

function loadStoredSelection(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch {}
  return null;
}

async function loadKitById(id: string) {
  const kit = drumKitState.kits.find((entry) => entry.id === id) ?? drumKitState.kits[0];
  if (!kit) return;
  const path = `/assets/drums/${kit.path}`;
  await soundBackend.loadDrumKitFromPath(path, kit.id);
  drumKitState.selectedId = kit.id;
  persistSelected(kit.id);
}

export async function initDrumKits() {
  if (drumKitState.status === 'loading') return;
  drumKitState.status = 'loading';
  drumKitState.error = null;
  try {
    drumKitState.kits = await fetchIndex();
    const stored = loadStoredSelection();
    const fallbackId = drumKitState.kits[0]?.id ?? null;
    const selected = stored && drumKitState.kits.some((kit) => kit.id === stored) ? stored : fallbackId;
    drumKitState.selectedId = selected;
    if (selected) await loadKitById(selected);
    drumKitState.status = 'ready';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    drumKitState.status = 'error';
    drumKitState.error = message;
  }
}

export async function selectDrumKit(id: string) {
  if (!id || drumKitState.status === 'loading') return;
  drumKitState.status = 'loading';
  drumKitState.error = null;
  try {
    await loadKitById(id);
    drumKitState.status = 'ready';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    drumKitState.status = 'error';
    drumKitState.error = message;
  }
}
