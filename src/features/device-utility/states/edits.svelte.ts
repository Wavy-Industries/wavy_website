import { getPackType, getSamplePack } from "../utils/samples";
import type { SamplePack } from "~/lib/parsers/device_samples_parser";
import { newLocalSamplePack, updateLocalSamplePack } from "./samplesLocal.svelte";
import { deviceSamplesState } from "~/lib/states/samples.svelte";

type EditorState = {
  open: boolean;
  id: string | null; // existing ID if editing a local pack; null when creating/cloning
  sourceId: string | null; // id that the editor was opened from (for selection replacement)
  name7: string; // editable suffix (7 chars max)
  loops: (SamplePack | null)[]; // editor slots; slot 0 contains the working pack
  unsaved: boolean;
  errors: string[];
};

export const editState = $state<EditorState>({
  open: false,
  id: null,
  sourceId: null,
  name7: "",
  loops: [null],
  unsaved: false,
  errors: [],
});

function makeLocalId(name7: string): string {
  const n = (name7 || "NONAME").slice(0, 7);
  return `L-${n}`;
}

function deepClone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

function ensurePageScaffold(name7: string): SamplePack {
  return { name: makeLocalId(name7), loops: Array(15).fill(null) } as SamplePack;
}

export async function openPackEditorForId(id: string) {
  const packType = getPackType(id);
  const existing = await getSamplePack(id, deviceSamplesState.activeMode);

  const baseName7 = id?.slice(2) || "";
  const localId = makeLocalId(baseName7);

  // Prepare working copy
  let working: SamplePack;
  if (existing) {
    working = deepClone(existing);
  } else {
    working = ensurePageScaffold(baseName7);
  }

  // Only local packs are editable in-place. Others are cloned into a local working copy.
  if (packType === 'Local') {
    // keep existing local id for Save-in-place
    editState.id = id;
    editState.name7 = baseName7;
    working.name = localId; // normalize name to L- prefix
  } else {
    // user/official → treat as new local until explicit Save
    editState.id = null;
    editState.name7 = baseName7;
    working.name = localId;
  }

  editState.loops[0] = working;
  editState.open = true;
  editState.sourceId = id || null;
  editState.unsaved = false;
  editState.errors = [];
}

export async function openPackEditorNew() {
  editState.id = null;
  editState.name7 = "";
  editState.loops[0] = ensurePageScaffold("");
  editState.open = true;
  editState.unsaved = false;
  editState.errors = [];
}

export function closePackEditor() {
  // if unsaved, ask before closing
  if (editState.unsaved) {
    const ok = typeof window !== 'undefined' ? window.confirm('You have unsaved changes. Discard and go back?') : true;
    if (!ok) return;
  }
  editState.open = false;
  editState.id = null;
  editState.loops = [null];
  editState.errors = [];
  editState.unsaved = false;
  editState.sourceId = null;
}

export function setEditorLoopData(slotIndex: number, page: SamplePack) {
  const copy = deepClone(page);
  // keep name synced with current name7 (enforce local prefix while editing)
  copy.name = makeLocalId(editState.name7 || copy.name.slice(2));
  editState.loops[slotIndex] = copy;
  editState.unsaved = true;
}

export function setEditorName7(name7: string) {
  editState.name7 = (name7 || "").slice(0, 7);
  const page = editState.loops[0];
  if (page) {
    page.name = makeLocalId(editState.name7);
    editState.unsaved = true;
  }
}

export function saveEditor(): boolean {
  // Save in-place only allowed when editing an existing local pack
  const page = editState.loops[0];
  if (!page) return false;

  const id = editState.id;
  if (!id || !id.startsWith('L-')) return false;

  // ensure the working copy has the correct local name
  const newName = makeLocalId(editState.name7 || id.slice(2));
  page.name = newName;
  updateLocalSamplePack(deepClone(page), id, deviceSamplesState.activeMode);
  editState.unsaved = false;
  closePackEditor();
  return true;
}

export function saveEditorAsNew(): boolean {
  // Always save to a new local ID
  const page = editState.loops[0];
  if (!page) return false;

  const newId = makeLocalId(editState.name7 || page.name.slice(2));
  page.name = newId;
  newLocalSamplePack(deepClone(page), deviceSamplesState.activeMode);
  editState.unsaved = false;
  closePackEditor();
  return true;
}
