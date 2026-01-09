<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { editState, setEditorLoopData } from '~/features/device-utility/states/edits.svelte';
  import { TICKS_PER_BEAT, type LoopData, type DrumEvent } from '~/lib/parsers/device_storage_parser';
  import { soundBackend } from '~/lib/soundBackend';
  import { deviceSamplesState } from '~/lib/states/samples.svelte';
  import { SampleMode } from '~/lib/types/sampleMode';
  import { packDisplayName } from "../utils/samples";
  import { computeLoopLengthBeatsFromEvents } from '~/lib/utils/loop_utils';
  import { parseMidiFile, indexLoopEvents, clampVelocity } from '~/features/device-utility/utils/midiUtils';
  import { deviceState } from '~/features/device-utility/states/deviceState.svelte';
  import PackTypeBadge from "~/features/device-utility/components/PackTypeBadge.svelte";
  import JSONEditor from "~/features/device-utility/components/JSONEditor.svelte";
  import PlayStopButton from "~/features/device-utility/components/PlayStopButton.svelte";
  import { tickProviderSubscribe, tickProviderSetState, TickSubscriberState, type TickSubscriber } from '~/lib/tickProvider';

  // Constants
  const PIANO_WIDTH = 60;
  const HEADER_HEIGHT = 30;
  const MAX_TICKS = 511;

  // Props
  let { index, close } = $props<{ index: number, close?: () => void }>();

  // Core state
  let localLoop = $state<LoopData>({ length_beats: 16, events: [] });
  let originalLoop = $state<LoopData>({ length_beats: 16, events: [] });
  const workingPage = $derived(() => editState.loops?.[0] ?? null);
  const pageName = $derived.by(() => workingPage()?.name ?? '');
  const packInfo = $derived.by(() => {
    const idOrName = editState.id || workingPage()?.name || '';
    return idOrName ? packDisplayName(idOrName) : null;
  });
  
  // UI state
  let selectedNote = $state<DrumEvent | null>(null);
  let isDragging = $state(false);
  let dragMode = $state<'move' | 'velocity' | 'resize' | null>(null);
  let dragOriginalNote = $state<any>(null);
  let laneHeight = $state(34); // Larger lanes for better visibility
  // Pixels per tick. With 24 ticks/beat, 8 px/tick => 192 px/beat.
  // Shows ~1 bar + a bit within the editor width.
  let tickWidth = $state(8);
  let snapValue = $state<'1/1'|'1/2'|'1/4'|'1/8'|'1/16'|'1/32'>('1/16');
  
  // Default note length in ticks (1/16 note)
  const DEFAULT_NOTE_LENGTH = TICKS_PER_BEAT / 4;
  
  // Default view settings - more reasonable for screen width
  const DEFAULT_NOTE_RANGE = { min: 0, max: 127 }; // Full MIDI range for vertical scroll

  const isDrumMode = $derived(() => deviceSamplesState.activeMode === SampleMode.DRM);
  const midiChannel = $derived(() => (isDrumMode() ? 9 : 0));
  const DRUM_LABELS: Record<number, string> = {
    36: 'Kick',
    37: 'Rim',
    38: 'Snr 1',
    39: 'Clap',
    40: 'Snr 2',
    42: 'HH Cl',
    44: 'HH Pd',
    45: 'Tom L',
    46: 'HH Op',
    48: 'Tom M',
    49: 'Crash',
    50: 'Tom H',
    51: 'Ride',
  };
  function drumLabel(note: number): string {
    return DRUM_LABELS[note] ?? '';
  }
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  function isBlackKey(note: number): boolean {
    const mod = note % 12;
    return mod === 1 || mod === 3 || mod === 6 || mod === 8 || mod === 10;
  }
  function noteLabel(note: number): string {
    const name = NOTE_NAMES[note % 12] ?? '';
    const octave = Math.floor(note / 12);
    return `${name}${octave}`;
  }

  function playNote(note: number, velocity: number, durationMs: number) {
    const channel = midiChannel();
    soundBackend.noteOn(note, velocity, channel);
    setTimeout(() => soundBackend.noteOff(note, 0, channel), durationMs);
  }

  // Playback state
  let isPlaying = $state(false);
  let playbackPosition = $state(0);
  let playbackId = 0;
  let playbackSubscriber: TickSubscriber | null = null;
  let playbackTickHandler: (() => void) | null = null;
  let playbackEventArmed = false;
  let lastDevicePlayback: boolean | null = null;
  // Grid element ref for coordinate calculations
  let gridEl: HTMLElement | null = null;
  let gridContainerEl: HTMLElement | null = null;

  // Track pointer start in client space to compute deltas robustly
  let dragStartClient = $state({ x: 0, y: 0 });

  // Derive loop length early so other derived values can use it
  const loopLengthBeats = $derived(() => {
    // Use 4 beats (one bar) as minimum to avoid 4x oversizing
    return computeLoopLengthBeatsFromEvents(localLoop.events, {
      ticksPerBeat: TICKS_PER_BEAT,
      minBeats: 4,
      maxBeats: 64,
    });
  });

  // Derived metrics for overlay beyond loop end
  const overlayMetrics = $derived(() => {
    const effectiveWidth = gridDimensions().effectiveTickWidth || tickWidth;
    const loopEndLeft = loopLengthBeats() * TICKS_PER_BEAT * effectiveWidth;
    const overlayLeft = Math.max(0, Math.min(loopEndLeft, gridDimensions().gridWidth));
    const overlayWidth = Math.max(0, gridDimensions().gridWidth - overlayLeft);
    return { overlayLeft, overlayWidth };
  });

  // Show full MIDI range so vertical scrollbar can reach all notes
  const noteRange = $derived(() => DEFAULT_NOTE_RANGE);

  const gridDimensions = $derived(() => {
    const range = noteRange();
    const laneCount = range.max - range.min + 1;

    // X width equals loop length + 1 bar (4 beats)
    // Do not cap by MAX_TICKS here so the scrollbar grows with loop length
    const totalTicks = Math.max(TICKS_PER_BEAT, (loopLengthBeats() + 4) * TICKS_PER_BEAT);

    const gridWidth = totalTicks * tickWidth;
    const totalWidth = gridWidth + PIANO_WIDTH;

    const dimensions = {
      laneCount,
      totalTicks,
      gridWidth,
      gridHeight: laneCount * laneHeight,
      totalWidth,
      totalHeight: laneCount * laneHeight + HEADER_HEIGHT,
      effectiveTickWidth: tickWidth
    };

    return dimensions;
  });

    const snapStep = $derived(() => {
    const denominators = { '1/1': 1, '1/2': 2, '1/4': 4, '1/8': 8, '1/16': 16, '1/32': 32 };
    return Math.max(1, Math.round(TICKS_PER_BEAT / denominators[snapValue]));
  });

  // Helper functions
  function snapTick(tick: number): number {
    return Math.floor(tick / snapStep()) * snapStep();
  }
  
  // Note helpers to keep manipulation logic centralized
  const noteIds = new WeakMap<DrumEvent, number>();
  let nextNoteId = 1;
  function noteKey(note: DrumEvent) {
    let id = noteIds.get(note);
    if (!id) {
      id = nextNoteId++;
      noteIds.set(note, id);
    }
    return id;
  }
  function sortNotes(events: DrumEvent[]) {
    events.sort((a, b) =>
      a.time_ticks_press - b.time_ticks_press ||
      a.note - b.note ||
      a.time_ticks_release - b.time_ticks_release
    );
  }
  function noteAtPosition(x: number, y: number) {
    return localLoop.events.find((ev) => {
      const noteY = noteToY(ev.note);
      const noteStartX = tickToX(ev.time_ticks_press);
      const noteEndX = tickToX(ev.time_ticks_release);
      return y >= noteY && y <= noteY + laneHeight && x >= noteStartX && x <= noteEndX;
    }) || null;
  }
  function createNote(note: number, press: number, release: number): DrumEvent {
    return { note, velocity: 100, time_ticks_press: press, time_ticks_release: release };
  }
  function removeNote(note: DrumEvent | null) {
    if (!note) return;
    const idx = localLoop.events.indexOf(note);
    if (idx === -1) return;
    localLoop.events.splice(idx, 1);
    if (selectedNote === note) selectedNote = null;
  }

  // Sort events by press time to maintain proper order
  $effect(() => {
    sortNotes(localLoop.events);
  });
  
  function tickToX(tick: number): number {
    const effectiveWidth = gridDimensions().effectiveTickWidth || tickWidth;
    return tick * effectiveWidth;
  }

  function xToTick(x: number): number {
    const effectiveWidth = gridDimensions().effectiveTickWidth || tickWidth;
    return Math.max(0, Math.min(MAX_TICKS, x / effectiveWidth));
  }

  function noteToY(note: number): number {
    return (noteRange().max - note) * laneHeight;
  }

  function yToNote(y: number): number {
    const note = noteRange().max - Math.floor(y / laneHeight);
    return Math.max(0, Math.min(127, note));
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function isEditableTarget(target: EventTarget | null) {
    if (!target || !(target as HTMLElement).tagName) return false;
    const el = target as HTMLElement;
    const tag = el.tagName.toLowerCase();
    return el.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button';
  }

  // Global ESC to close the editor (if a close handler is provided)
  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && typeof close === 'function') {
      e.preventDefault();
      try { close(); } catch {}
      return;
    }
    if (e.code === 'Space' || e.key === ' ') {
      if (isEditableTarget(e.target) || showJsonEditor) return;
      e.preventDefault();
      if (isPlaying) stopPlayback();
      else startPlayback();
    }
  }
  onMount(() => {
    window.addEventListener('keydown', onWindowKeydown);
  });
  onMount(() => {
    playbackSubscriber = tickProviderSubscribe(() => { playbackTickHandler?.(); });
    lastDevicePlayback = deviceState.playback ?? null;
    playbackEventArmed = true;
  });
  onDestroy(() => {
    window.removeEventListener('keydown', onWindowKeydown);
    stopPlayback();
    if (playbackSubscriber) tickProviderSetState(playbackSubscriber, TickSubscriberState.Inactive);
  });

  $effect(() => {
    if (!playbackEventArmed) return;
    if (deviceState.playback == null) return;
    if (deviceState.playback === lastDevicePlayback) return;
    lastDevicePlayback = deviceState.playback;
    if (deviceState.playback) startPlayback();
    else stopPlayback();
  });

  // Initialize data
  function initializeLoop() {
    const wp = workingPage();
    if (!wp) return;
    
    const storeLoop = wp.loops?.[index] as LoopData;
    
    const defaultLoop = { length_beats: 16, events: [] };
    localLoop = JSON.parse(JSON.stringify(storeLoop || defaultLoop));
    originalLoop = JSON.parse(JSON.stringify(storeLoop || defaultLoop));
  }

  onMount(() => {
    initializeLoop();
    // After mount, scroll to the base note with padding below
    setTimeout(() => {
      try {
        if (!gridContainerEl) return;
        const notes = (localLoop.events || []).map((e) => e.note).filter((n) => typeof n === 'number');
        const fallback = isDrumMode() ? 36 : 60;
        const baseNote = notes.length ? Math.min(...notes) : fallback;
        const y = noteToY(baseNote) + HEADER_HEIGHT;
        const padding = laneHeight * 4;
        const target = y - (gridContainerEl.clientHeight - padding);
        const maxScroll = Math.max(0, gridDimensions().totalHeight - gridContainerEl.clientHeight);
        gridContainerEl.scrollTop = Math.max(0, Math.min(target, maxScroll));
      } catch {}
    }, 0);
  });

  const isDirty = $derived(JSON.stringify(localLoop) !== JSON.stringify(originalLoop));

  // Event handlers
  function handleGridPointerDown(event: PointerEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const tick = snapTick(xToTick(x));
    const note = yToNote(y);
    // Check if clicking on existing note
    const clickedNote = noteAtPosition(x, y);

    if (clickedNote) {
      selectedNote = clickedNote;
      isDragging = true;
      dragOriginalNote = { ...clickedNote };
      
      // Set pointer capture for smooth dragging
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
    } else {
      // Create new note starting at the nearest snap under the cursor
      const pointerTick = xToTick(x);
      let press = snapTick(pointerTick);
      const release = press + DEFAULT_NOTE_LENGTH;
      // clamp within valid tick bounds
      press = clamp(press, 0, MAX_TICKS - 1);
      const finalRelease = clamp(release, press + 1, MAX_TICKS);
      const newNote = createNote(note, press, finalRelease);
      
      localLoop.events.push(newNote);
      selectedNote = newNote;
    }
  }

  function handleGridPointerMove(event: PointerEvent) {
    if (!isDragging || !selectedNote || !dragOriginalNote) return;

    // Compute coordinates relative to grid for consistent behavior
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    if (!localLoop.events.includes(selectedNote)) {
      selectedNote = null;
      isDragging = false;
      return;
    }

    const currentNote = selectedNote;
    if (!currentNote) return;

    if (dragMode === 'velocity') {
      // Use client-space delta with sigmoid response for smoother control
      const deltaYClient = event.clientY - dragStartClient.y; // down is positive
      // Map to logistic range ~[-3, 3]
      const d = clamp(-(deltaYClient) / 80, -3, 3); // moving up increases velocity
      const sigmoid = 1 / (1 + Math.exp(-d));
      const centered = (sigmoid - 0.5) * 2; // [-1, 1]
      const maxChange = 64; // cap velocity change for comfort
      const velocityChange = Math.round(centered * maxChange);
      const newVelocity = clamp(dragOriginalNote.velocity + velocityChange, 1, 127);
      currentNote.velocity = newVelocity;

    } else if (dragMode === 'resize') {
      // Resize using delta from original release, not snapping to min length
      const effectiveWidth = gridDimensions().effectiveTickWidth || tickWidth;
      const deltaXClient = event.clientX - dragStartClient.x;
      const deltaTicksFloat = deltaXClient / effectiveWidth;
      // Apply grid snapping to resulting release position
      const tentativeRelease = dragOriginalNote.time_ticks_release + deltaTicksFloat;
      const snappedRelease = snapTick(tentativeRelease);
      const minRelease = dragOriginalNote.time_ticks_press + 1; // at least 1 tick
      const newRelease = clamp(Math.max(snappedRelease, minRelease), 0, MAX_TICKS);

      currentNote.time_ticks_release = newRelease;

    } else {
      // Move the entire note - PRESERVE ORIGINAL LENGTH and keep cursor alignment
      const pointerTick = xToTick(x);
      const pointerNote = yToNote(y);

      // Calculate original note length
      const originalLength = dragOriginalNote.time_ticks_release - dragOriginalNote.time_ticks_press;

      // Keep the grabbed offset so the note stays under the cursor
      const desiredPress = pointerTick - (dragOffsetTick ?? 0);
      const newTick = snapTick(desiredPress);
      const newNote = clamp(pointerNote - (dragOffsetNote ?? 0), 0, 127);

      // Ensure the note stays within bounds
      const clampedTick = clamp(newTick, 0, MAX_TICKS - originalLength);
      const clampedNote = clamp(newNote, 0, 127);

      currentNote.time_ticks_press = clampedTick;
      currentNote.time_ticks_release = clampedTick + originalLength;
      currentNote.note = clampedNote;

      // Audition only when the pitch actually changes (debounced by value)
      if (currentNote.note !== lastAuditionedNote) {
        lastAuditionedNote = currentNote.note;
        playNote(currentNote.note, currentNote.velocity, 100);
      }
    }
  }

  function handleGridPointerUp(event: PointerEvent) {
    if (isDragging && selectedNote) {
      // Audition the final note
      const currentNote = selectedNote;
      if (currentNote) {
        playNote(currentNote.note, currentNote.velocity, 150);
      }
    } else if (!isDragging && selectedNote) {
      // Simple click - audition the note
      const currentNote = selectedNote;
      if (currentNote) {
        playNote(currentNote.note, currentNote.velocity, 150);
      }
    }

    // Clean up drag state
    isDragging = false;
    dragMode = null;
    dragOriginalNote = null;
    lastAuditionedNote = null;
  }

  function handleGridContextMenu(event: MouseEvent) {
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    // Find note to delete
    const note = noteAtPosition(x, y);
    if (note) {
      removeNote(note);
    }
  }
  
  // Handle right-click on notes directly
  function handleNoteContextMenu(event: MouseEvent, note: DrumEvent) {
    event.preventDefault();
    event.stopPropagation();
    
    removeNote(note);
  }

  // Note-specific event handlers
  let lastAuditionedNote: number | null = null;
  let dragOffsetTick: number | null = null;
  let dragOffsetNote: number | null = null;

  function handleNotePointerDown(event: PointerEvent, note: DrumEvent, mode: 'move' | 'velocity' | 'resize' = 'move') {
    event.stopPropagation();
    
    selectedNote = note;
    isDragging = true;
    dragMode = mode;
    
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    dragStartClient = { x: event.clientX, y: event.clientY };
    dragOriginalNote = { ...note };

    // Compute grab offsets relative to grid to keep cursor aligned with note
    try {
      const grect = gridEl?.getBoundingClientRect();
      if (grect) {
        const gx = event.clientX - grect.left;
        const gy = event.clientY - grect.top;
        const pTick = xToTick(gx);
        const pNote = yToNote(gy);
        dragOffsetTick = pTick - dragOriginalNote.time_ticks_press;
        dragOffsetNote = pNote - dragOriginalNote.note;
      } else {
        dragOffsetTick = 0; dragOffsetNote = 0;
      }
    } catch { dragOffsetTick = 0; dragOffsetNote = 0; }

    lastAuditionedNote = dragOriginalNote.note;

    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }

  function handlePianoClick(note: number) {
    playNote(note, 100, 150);
  }

  function handleMidiDrop(e: DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!/\.midi?$/i.test(file.name)) {
      alert('Please drop a .mid file');
      return;
    }
    parseMidiFile(file).then((loop) => {
      localLoop = loop;
      selectedNote = null;
      isDragging = false;
    }).catch(() => {
      alert('Failed to parse MIDI');
    });
  }

  // Playback functions
  function startPlayback() {
    if (isPlaying || !playbackSubscriber) return;

    const loopLengthTicks = Math.max(1, loopLengthBeats() * TICKS_PER_BEAT);
    const eventIndex = indexLoopEvents(localLoop, loopLengthTicks, DEFAULT_NOTE_LENGTH);
    let currentTick = 0;

    const id = ++playbackId;
    isPlaying = true;
    playbackPosition = 0;
    soundBackend.allNotesOff();

    playbackTickHandler = () => {
      if (playbackId !== id) return;
      const tick = currentTick % eventIndex.loopLengthTicks;
      playbackPosition = tick;
      const channel = midiChannel();
      const ons = eventIndex.onByTick[tick] || [];
      for (const ev of ons) {
        soundBackend.noteOn(ev.note, clampVelocity(ev.velocity), channel);
      }
      const offs = eventIndex.offByTick[tick] || [];
      for (const ev of offs) {
        soundBackend.noteOff(ev.note, 0, channel);
      }
      currentTick = (currentTick + 1) % eventIndex.loopLengthTicks;
    };

    tickProviderSetState(playbackSubscriber, TickSubscriberState.Active);
  }

  function stopPlayback() {
    isPlaying = false;
    playbackId++;
    playbackPosition = 0;
    playbackTickHandler = null;
    if (playbackSubscriber) tickProviderSetState(playbackSubscriber, TickSubscriberState.Inactive);
    soundBackend.allNotesOff();
  }

  // Save functions
  function saveAndClose() {
    const src = workingPage();
    if (!src) return;
    
    const updated = { ...src } as any;
    if (!updated.loops) updated.loops = Array(15).fill(null);
    // Persist the derived loop length into saved data
    const toSave = JSON.parse(JSON.stringify(localLoop));
    toSave.length_beats = loopLengthBeats();
    updated.loops[index] = toSave;
    
    setEditorLoopData(0, updated);
    close?.();
  }

  function requestClose() {
    if (isDirty) {
      const confirmed = window.confirm('You have unsaved changes. Discard and close?');
      if (!confirmed) return;
    }
    
    stopPlayback();
    close?.();
  }

  // JSON editor
  let showJsonEditor = $state(false);
  function openJsonEditor() {
    showJsonEditor = true;
  }
  function applyJsonObject(parsed: any) {
    try {
      if (!parsed || typeof parsed !== 'object') return;
      const length_beats = Math.max(1, Math.min(64, Number(parsed.length_beats) || 16));
      const events = Array.isArray(parsed.events) ? parsed.events.map((e: any) => ({
        note: clamp(Number(e.note) || 60, 0, 127),
        velocity: clamp(Number(e.velocity) || 100, 1, 127),
        time_ticks_press: clamp(Number(e.time_ticks_press) || 0, 0, MAX_TICKS),
        time_ticks_release: clamp(Number(e.time_ticks_release) || 1, 0, MAX_TICKS)
      })) : [];
      localLoop = { length_beats, events };
    } catch {}
  }
</script>

<div class="editor-screen">
  <!-- Header -->
  <div class="editor-header">
    <div class="header-left">
      <button class="back-button" onclick={requestClose} title="Back">←</button>
      <h2>Piano Roll</h2>
      {#if packInfo}
        <PackTypeBadge type={packInfo.type} />
      {/if}
      <span class="subtitle">Editing {packInfo ? packInfo.name : pageName} — slot {index + 1}</span>
    </div>
    
    <div class="header-right">
      <div class="bpm-display">
        <span class="bpm-label">BPM</span>
        <span class="bpm-value" class:placeholder={!deviceState.bpmFromDevice}>{deviceState.bpm}</span>
      </div>
      <PlayStopButton
        playing={isPlaying}
        onToggle={isPlaying ? stopPlayback : startPlayback}
      />
      
      <label class="control-group">
        Snap:
        <select bind:value={snapValue}>
          <option value="1/1">1/1</option>
          <option value="1/2">1/2</option>
          <option value="1/4">1/4</option>
          <option value="1/8">1/8</option>
          <option value="1/16">1/16</option>
          <option value="1/32">1/32</option>
        </select>
      </label>
      
      <button class="text-button" onclick={openJsonEditor}>View raw</button>
      <button class="save-button" class:disabled={!isDirty} onclick={saveAndClose}>Save</button>
    </div>
  </div>

  <!-- Main Grid Area -->
  <div class="grid-container" bind:this={gridContainerEl}>
    <div class="grid-wrapper" style="width: {gridDimensions().totalWidth}px; height: {gridDimensions().totalHeight}px;">
      
      <!-- Piano Roll (Y-axis) -->
      <div class="piano-roll" style="height: {gridDimensions().gridHeight}px; top: {HEADER_HEIGHT}px;">
        {#each Array(gridDimensions().laneCount) as _, i}
          {@const note = noteRange().max - i}
          {@const isC = note % 12 === 0}
          {@const isC3 = note === 36}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div 
            class="piano-key" 
            class:is-c={isC}
            class:is-c3={isC3}
            class:is-drum={isDrumMode()}
            class:is-black={!isDrumMode() && isBlackKey(note)}
            style="height: {laneHeight}px; top: {i * laneHeight}px;"
            onclick={() => handlePianoClick(note)}
            onkeydown={(e) => e.key === 'Enter' && handlePianoClick(note)}
            role="button"
            tabindex="0"
          >
            {isDrumMode() ? drumLabel(note) : noteLabel(note)}
          </div>
        {/each}
      </div>

      <!-- Timeline (X-axis) -->
      <div class="timeline" style="width: {gridDimensions().gridWidth}px; left: {PIANO_WIDTH}px;">
        {#each Array(Math.ceil(gridDimensions().totalTicks / TICKS_PER_BEAT)) as _, beat}
          {@const effectiveWidth = gridDimensions().effectiveTickWidth || tickWidth}
          <div 
            class="beat-marker" 
            style="left: {beat * TICKS_PER_BEAT * effectiveWidth}px; width: {TICKS_PER_BEAT * effectiveWidth}px;"
          >
            {beat + 1}
          </div>
        {/each}
      </div>

      <!-- Grid Background -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div 
        class="grid-area"
        bind:this={gridEl}
        style="left: {PIANO_WIDTH}px; top: {HEADER_HEIGHT}px; width: {gridDimensions().gridWidth}px; height: {gridDimensions().gridHeight}px;"
        ondragover={(e) => { e.preventDefault(); }}
        ondrop={handleMidiDrop}
        onpointerdown={handleGridPointerDown}
        onpointermove={handleGridPointerMove}
        onpointerup={handleGridPointerUp}
        oncontextmenu={handleGridContextMenu}
        role="application"
        aria-label="Piano roll grid - click to add notes, drag to move, right-click to delete"
      >
        <!-- Grid lines -->
        <svg class="grid-lines" width="100%" height="100%">
          {#if !isDrumMode()}
            {#each Array(gridDimensions().laneCount) as _, i}
              {@const note = noteRange().max - i}
              {@const isBlack = isBlackKey(note)}
              {#if isBlack}
                <rect
                  x="0"
                  y={i * laneHeight}
                  width={gridDimensions().gridWidth}
                  height={laneHeight}
                  fill="rgba(15, 23, 42, 0.05)"
                />
              {/if}
            {/each}
          {/if}
          <!-- Horizontal lines (note lanes) -->
          {#each Array(gridDimensions().laneCount + 1) as _, i}
            {@const note = noteRange().max - i}
            {@const isC = note % 12 === 0}
            <line 
              x1="0" 
              y1={i * laneHeight} 
              x2="100%" 
              y2={i * laneHeight} 
              stroke={isC ? "#d1d5db" : "#e5e7eb"} 
              stroke-width={isC ? "1.5" : "1"}
              opacity={isC ? "0.8" : "0.6"}
            />
          {/each}
          
          <!-- Vertical lines (beats, bars, and snap grid) -->
          {#each Array(Math.ceil(gridDimensions().totalTicks / snapStep()) + 1) as _, i}
            {@const tick = i * snapStep()}
            {@const effectiveWidth = gridDimensions().effectiveTickWidth || tickWidth}
            {@const x = tick * effectiveWidth}
            {@const isBeat = tick % TICKS_PER_BEAT === 0}
            {@const isBar = tick % (TICKS_PER_BEAT * 4) === 0}
            {@const isSnapGrid = !isBeat && !isBar}
            <line 
              x1={x} 
              y1="0" 
              x2={x} 
              y2="100%" 
              stroke={isBar ? "#1f2937" : isBeat ? "#6b7280" : "#9ca3af"} 
              stroke-width={isBar ? "2" : isBeat ? "1" : "1"}
              opacity={isBar ? "0.8" : isBeat ? "0.6" : "0.4"}
              stroke-dasharray={isSnapGrid ? "2,2" : "none"}
            />
          {/each}
        </svg>

        <!-- Notes -->
        {#each localLoop.events as event, i (noteKey(event))}
          {@const effectiveWidth = gridDimensions().effectiveTickWidth || tickWidth}
          {@const x = (event.time_ticks_press * effectiveWidth)}
          {@const width = ((event.time_ticks_release - event.time_ticks_press) * effectiveWidth)}
          {@const y = (noteRange().max - event.note) * laneHeight}
          {@const isSelected = selectedNote === event}
          {@const intensity = 0.3 + (event.velocity / 127) * 0.7} <!-- 30% to 100% intensity -->
          
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div 
            class="note-block"
            class:selected={isSelected}
            style="left: {x}px; top: {y}px; width: {width}px; height: {laneHeight - 2}px;"
            onpointerdown={(e) => handleNotePointerDown(e, event, 'move')}
            oncontextmenu={(e) => handleNoteContextMenu(e, event)}
            role="button"
            tabindex="0"
          >
            <div 
              class="note-content" 
              style="background-color: rgba(0, 0, 0, {intensity})"
              title="Note {event.note}, Velocity {event.velocity} - drag to move, right-click to delete"
            >
              <!-- Velocity handle on the left -->
              <div 
                class="velocity-handle"
                title="Velocity: {event.velocity} - drag vertically to adjust"
                onpointerdown={(e) => handleNotePointerDown(e, event, 'velocity')}
              ></div>
              <!-- Main note body -->
              <div class="note-body"></div>
              <!-- Resize handle on the right -->
              <div 
                class="resize-handle"
                title="Drag to resize note length"
                onpointerdown={(e) => handleNotePointerDown(e, event, 'resize')}
              ></div>
            </div>
          </div>
        {/each}

        <!-- Grey overlay beyond loop end -->
        <div
          class="past-loop-overlay"
          style="left: {overlayMetrics().overlayLeft}px; width: {overlayMetrics().overlayWidth}px; height: 100%;"
        ></div>

        <!-- Playback cursor -->
        {#if isPlaying}
          {@const effectiveWidth = gridDimensions().effectiveTickWidth || tickWidth}
          {@const tickMs = deviceState.bpm > 0 ? 60000 / (TICKS_PER_BEAT * deviceState.bpm) : 0}
          <div 
            class="playback-cursor" 
            style="left: {playbackPosition * effectiveWidth}px; --tick-ms: {tickMs}ms;"
          ></div>
        {/if}

        <!-- Loop end indicator -->
        <div 
          class="loop-end" 
          style="left: {loopLengthBeats() * TICKS_PER_BEAT * (gridDimensions().effectiveTickWidth || tickWidth)}px;"
        ></div>
      </div>
    </div>
  </div>
</div>

<!-- JSON Editor Modal -->
{#if showJsonEditor}
  <JSONEditor json={localLoop} onSave={(obj)=>applyJsonObject(obj)} onClose={()=>showJsonEditor=false} />
{/if}

<style>
  .editor-screen {
    display: flex;
    flex-direction: column;
    height: 100vh;
    max-height: 90vh; /* scale up vertically */
    max-width: var(--du-maxw, 1100px); /* limit width similar to PackEditor */
    width: 100%;
    margin: 0 auto;
    overflow-x: hidden; /* avoid stray page-level x-scroll */
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
  }

  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #e5e7eb;
    background: #f9fafb;
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .bpm-display { display: inline-flex; align-items: baseline; gap: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
  .bpm-label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; }
  .bpm-value { font-weight: 600; color: #111827; }
  .bpm-value.placeholder { font-style: italic; }

  .back-button {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #d1d5db;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
  }

  .back-button:hover {
    background: #f3f4f6;
  }

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  .subtitle {
    color: #6b7280;
    font-size: 14px;
  }

  .control-group {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #374151;
  }

  .control-group select {
    font-size: 12px;
    padding: 2px 4px;
    border: 1px solid #d1d5db;
    border-radius: 3px;
  }

  .save-button,
  .text-button {
    padding: 6px 12px;
    border: 1px solid #d1d5db;
    background: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .text-button:hover {
    background: #f3f4f6;
  }

  .save-button {
    background: #2563eb;
    color: white;
    border-color: #1d4ed8;
  }
  .save-button:hover:not(.disabled) {
    background: #1d4ed8;
  }

  .save-button.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .grid-container {
    flex: 1;
    overflow: auto;
    background: #f8fafc;
    max-height: calc(90vh - 60px); /* allow taller editor */
    max-width: 100%; /* Prevent full-width overflow */
  }

  .grid-wrapper {
    position: relative;
    min-height: 400px;
    /* Controlled sizing to prevent layout issues */
    width: fit-content;
    height: fit-content;
    max-width: 100%;
  }

  .piano-roll {
    position: absolute;
    left: 0;
    width: 60px;
    background: white;
    border-right: 1px solid #e5e7eb;
    z-index: 10;
  }

  .piano-key {
    position: absolute;
    left: 0;
    right: 0;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    padding-left: 8px;
    font-size: 11px;
    color: #6b7280;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .piano-key:hover {
    background: #f3f4f6;
  }

  .piano-key.is-c {
    background: #f9fafb;
    color: #111827;
    font-weight: 500;
  }

  .piano-key.is-black {
    background: #f3f4f6;
    color: #374151;
  }

  .piano-key.is-c3 {
    background: #ecfdf5;
    color: #065f46;
    font-weight: 600;
    border-left: 3px solid #10b981;
  }

  .piano-key.is-drum {
    font-size: 10px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #374151;
  }

  .timeline {
    position: absolute;
    top: 0;
    height: 30px;
    background: white;
    border-bottom: 1px solid #e5e7eb;
    z-index: 10;
  }

  .beat-marker {
    position: absolute;
    top: 0;
    bottom: 0;
    border-right: 1px solid #d1d5db;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: #6b7280;
  }

  .grid-area {
    position: absolute;
    background: white;
    cursor: crosshair;
  }

  .past-loop-overlay {
    position: absolute;
    top: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.06);
    pointer-events: none;
    z-index: 8;
  }

  .grid-lines {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
  }

  .note-block {
    position: absolute;
    border: 1px solid rgba(0, 0, 0, 0.2);
    border-radius: 2px;
    cursor: grab;
    z-index: 5;
    user-select: none;
  }

  .note-block:hover {
    filter: brightness(1.1);
  }

  .note-block:active {
    cursor: grabbing;
  }

  .note-block.selected {
    outline: 2px solid #1e40af;
    outline-offset: 1px;
    z-index: 10;
  }

  .note-content {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 1px;
    display: flex;
    border: 1px solid rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .velocity-handle {
    width: 8px;
    height: 100%;
    cursor: ns-resize;
    background: rgba(255, 255, 255, 0.2);
    border-right: 1px solid rgba(255, 255, 255, 0.3);
    flex-shrink: 0;
  }

  .velocity-handle:hover {
    background: rgba(255, 255, 255, 0.4);
  }

  .note-body {
    flex: 1;
    height: 100%;
    cursor: grab;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .note-body:active {
    cursor: grabbing;
  }

  .resize-handle {
    width: 8px;
    height: 100%;
    cursor: ew-resize;
    background: rgba(255, 255, 255, 0.2);
    border-left: 1px solid rgba(255, 255, 255, 0.3);
    flex-shrink: 0;
  }

  .resize-handle:hover {
    background: rgba(255, 255, 255, 0.4);
  }

  .playback-cursor {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #ef4444;
    z-index: 20;
    pointer-events: none;
    transition: left var(--tick-ms, 0ms) linear;
    will-change: left;
  }

  .loop-end {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #f59e0b;
    z-index: 15;
    pointer-events: none;
  }

  @media (max-width: 900px) {
    .editor-screen {
      max-width: 100%;
      margin: 0;
      border-radius: 0;
      border-left: none;
      border-right: none;
      max-height: 100vh;
    }
    .editor-header {
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
      padding: 10px 12px;
    }
    .header-left,
    .header-right { flex-wrap: wrap; }
    .subtitle { width: 100%; }
    .grid-container { max-height: calc(100vh - 180px); }
  }

  @media (max-width: 600px) {
    h2 { font-size: 16px; }
    .subtitle { font-size: 12px; }
    .control-group { width: 100%; }
    .save-button,
    .text-button { padding: 6px 10px; }
  }
</style>
