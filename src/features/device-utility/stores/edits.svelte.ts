import { type Page } from '~/lib/parsers/samples_parser';
import { sampleState, addPackToSelected, createOrReplaceUserPack, computeDirty, computeDiffs, getPackPageById } from '~/features/device-utility/stores/samples.svelte';
import { canonicalIdKey as canonicalIdKeyUtil } from '~/features/device-utility/utils/packs';

type EditContext = 'selected' | 'available';

export interface EditState {
    open: boolean;
    id: string | null;
    context: EditContext;
    name7: string;
    bpm: number;
    loops: (Page | null)[];
    loading: boolean;
    unsaved: boolean;
    errors: string[];
}

export const editState = $state<EditState>({
    open: false,
    id: null,
    context: 'available',
    name7: '',
    bpm: 120,
    loops: Array(15).fill(null),
    loading: false,
    unsaved: false,
    errors: [],
});

const canonicalIdKey = (id: string) => canonicalIdKeyUtil(id);

export async function openPackEditorFor(id: string | null = null, context: EditContext = 'available') {
    editState.open = true;
    editState.id = id;
    editState.context = context;
    editState.bpm = 120;
    editState.loading = !!id;
    if (id) {
        const page = await getPackPageById(id);
        const name = id.startsWith('W-') || id.startsWith('P-') || id.startsWith('U-') ? id.substring(2) : (id[0]==='W'||id[0]==='P'||id[0]==='U' ? id.substring(1).trimEnd() : id);
        editState.name7 = (name || '').slice(0,7);
        const slots: (Page|null)[] = Array(15).fill(null);
        if (page) {
            const editable: Page = { name: page.name, loops: (page as any).loops } as any;
            slots[0] = editable;
        }
        editState.loops = slots;
        editState.loading = false;
        editState.unsaved = false;
        editState.errors = [];
    } else {
        editState.name7 = '';
        editState.loops = Array(15).fill(null);
        editState.loading = false;
        editState.unsaved = false;
        editState.errors = [];
    }
}

export function closePackEditor() {
    editState.open = false;
}

export function setEditorLoopData(slot: number, page: Page) {
    const arr = [...editState.loops];
    arr[slot] = page;
    editState.loops = arr;
    editState.unsaved = true;
}

export function saveEditor() {
    editState.errors = [];
    const name7 = (editState.name7 || '').slice(0,7);
    if (!name7) { editState.errors = [ 'Please enter a name (max 7 chars)' ]; return; }
    const prevId = editState.id;
    const prevIsUser = !!(prevId && (prevId.startsWith('U-') || prevId[0] === 'U'));
    const slot0 = editState.loops[0];
    const loopsRaw = (slot0 && (slot0 as any).loops) ? (slot0 as any).loops : Array(15).fill(null);
    const loops = normalizeAndSortLoops(loopsRaw);
    const id = `U-${name7}`;
    const page: Page = { name: id, loops } as any;

    if (editState.context === 'selected') {
        const targetId = prevId || id;
        const key = canonicalIdKey(targetId);
        sampleState.stagedDeviceContent[key] = page;
        editState.unsaved = false;
        editState.errors = [];
        computeDirty();
        computeDiffs();
        closePackEditor();
        return;
    }

    if (prevIsUser && canonicalIdKey(prevId!) === canonicalIdKey(id)) {
        createOrReplaceUserPack(name7, page);
        editState.unsaved = false;
        editState.errors = [];
        computeDirty();
        computeDiffs();
        closePackEditor();
    } else {
        saveEditorAsNew();
    }
}

export function saveEditorAsNew() {
    editState.errors = [];
    const name7 = (editState.name7 || '').slice(0,7);
    if (!name7) { editState.errors = [ 'Please enter a name (max 7 chars)' ]; return; }
    const id = `U-${name7}`;
    const exists = sampleState.userPacks.some(p => canonicalIdKey(p.id) === canonicalIdKey(id));
    if (exists) { editState.errors = [ `A local pack named ${id} already exists` ]; return; }
    const slot0 = editState.loops[0];
    const loopsRaw = (slot0 && (slot0 as any).loops) ? (slot0 as any).loops : Array(15).fill(null);
    const loops = normalizeAndSortLoops(loopsRaw);
    const page: Page = { name: id, loops } as any;
    createOrReplaceUserPack(name7, page);
    const prevId = editState.id;
    if (editState.context === 'selected') {
        let replaced = false;
        if (prevId) {
            for (let i = 0; i < sampleState.selected.length; i++) {
                if (sampleState.selected[i]?.id === prevId) {
                    sampleState.selected[i] = { id, type: 'local' as any, source: 'user_local', loops: page } as any;
                    replaced = true;
                }
            }
        }
        if (!replaced) {
            addPackToSelected(id);
        }
        // Stage to device immediately so future edits can diverge from local
        sampleState.stagedDeviceContent[canonicalIdKey(id)] = page;
    } else {
        addPackToSelected(id);
    }
    editState.unsaved = false;
    editState.errors = [];
    computeDirty();
    computeDiffs();
    closePackEditor();
}

function normalizeAndSortLoops(loopsIn: any[]): any[] {
    const out = Array(15).fill(null);
    for (let i = 0; i < Math.min(15, (loopsIn?.length ?? 0)); i++) {
        const l = loopsIn[i];
        if (!l || !Array.isArray(l.events)) { out[i] = l ?? null; continue; }
        const sorted = [...l.events].sort((a:any,b:any) => (a.time_ticks_press ?? 0) - (b.time_ticks_press ?? 0));
        out[i] = { ...l, events: sorted } as any;
    }
    return out;
}


