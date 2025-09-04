import { type SamplePack } from '~/lib/parsers/samples_parser';
// Temporary minimal editor state; real editor will be implemented later.
const canonicalIdKeyUtil = (id: string) => id;

type EditContext = 'selected' | 'available';

export interface EditState { open: boolean; id: string | null; context: EditContext; name7: string; bpm: number; loops: (SamplePack | null)[]; loading: boolean; unsaved: boolean; errors: string[]; }

export const editState = $state<EditState>({ open: false, id: null, context: 'available', name7: '', bpm: 120, loops: Array(15).fill(null), loading: false, unsaved: false, errors: [] });

const canonicalIdKey = (id: string) => id;

export async function openPackEditorFor(_id: string | null = null, _context: EditContext = 'available') { /* no-op for now */ }

export function closePackEditor() { editState.open = false; }

export function setEditorLoopData(_slot: number, _page: SamplePack) { /* no-op */ }

export function saveEditor() { /* no-op */ }

export function saveEditorAsNew() { /* no-op */ }

function normalizeAndSortLoops(loopsIn: any[]): any[] { return Array(15).fill(null).map((_,i)=> (loopsIn?.[i] ?? null)); }


