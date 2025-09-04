<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { editState, setEditorLoopData } from '~/features/device-utility/states/edits.svelte';
  import { tempoState } from '~/features/device-utility/states/tempo.svelte';
  import { TICKS_PER_BEAT, type LoopData, type SamplePack } from '~/lib/parsers/samples_parser';
  import { soundBackend } from '~/lib/soundBackend';
  import { calculateLoopLength } from "../utils/samples";
  import { Log } from '~/lib/utils/Log';
  
  const LOG_LEVEL = Log.LEVEL_DEBUG;
  const log = new Log("midi-editor", LOG_LEVEL);

  // Constants
  const PIANO_WIDTH = 60;
  const HEADER_HEIGHT = 30;
  const MAX_TICKS = 511;
  const MIN_LANE_HEIGHT = 18;
  const MAX_LANE_HEIGHT = 32;
  const MIN_TICK_WIDTH = 8;
  const MAX_TICK_WIDTH = 24;

  // Props
  let { index, close } = $props<{ index: number, close?: () => void }>();
  const dispatch = createEventDispatcher<{ save: void }>();

  // Core state
  let localLoop = $state<LoopData>({ length_beats: 16, events: [] });
  let originalLoop = $state<LoopData>({ length_beats: 16, events: [] });
  let pageName = $state('');
  
  // UI state
  let selectedNoteIndex = $state<number | null>(null);
  let isDragging = $state(false);
  let dragMode = $state<'move' | 'velocity' | 'resize' | null>(null);
  let dragStartPos = $state({ x: 0, y: 0 });
  let dragOriginalNote = $state<any>(null);
  let laneHeight = $state(34); // Larger lanes for better visibility
  let tickWidth = $state(16); // Larger for zoomed-in view
  let snapValue = $state<'1/1'|'1/2'|'1/4'|'1/8'|'1/16'|'1/32'>('1/16');
  
  // Default note length in ticks (1/16 note)
  const DEFAULT_NOTE_LENGTH = TICKS_PER_BEAT / 4;
  
  // Default view settings - more reasonable for screen width
  const DEFAULT_VIEW_BEATS = 4; // Reduced from 8.5 to prevent excessive width
  const DEFAULT_NOTE_RANGE = { min: 0, max: 127 }; // Full MIDI range for vertical scroll
  
  // Playback state
  let isPlaying = $state(false);
  let playbackPosition = $state(0);
  let playbackId = 0;
  let animationFrame: number | null = null;
  let playbackTimeout: number | null = null;
  // Grid element ref for coordinate calculations
  let gridEl: HTMLElement | null = null;

  // Track pointer start in client space to compute deltas robustly
  let dragStartClient = $state({ x: 0, y: 0 });

  // Derive loop length early so other derived values can use it
  const loopLengthBeats = $derived(() => {
    return calculateLoopLength(localLoop.events, TICKS_PER_BEAT, 16, 64);
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

    // X width equals loop length + 1 bar (4 beats), capped to MAX_TICKS
    const totalTicks = Math.min(
      MAX_TICKS,
      (loopLengthBeats() + 4) * TICKS_PER_BEAT
    );

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

    log.debug(`Grid calculation details:`);
    log.debug(`- Range: ${JSON.stringify(range)}, laneCount: ${laneCount}`);
    log.debug(`- totalTicks: ${totalTicks}`);
    log.debug(`- Total width: ${totalWidth}px, tick width: ${tickWidth}px`);

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
  
  // Sort events by press time to maintain proper order
  function sortEvents() {
    localLoop.events.sort((a, b) => a.time_ticks_press - b.time_ticks_press);
  }
  
  // Validate and clean up a single event
  function validateEvent(event: any): boolean {
    if (typeof event.note !== 'number' || event.note < 0 || event.note > 127) return false;
    if (typeof event.velocity !== 'number' || event.velocity < 1 || event.velocity > 127) return false;
    if (typeof event.time_ticks_press !== 'number' || event.time_ticks_press < 0 || event.time_ticks_press > 511) return false;
    if (typeof event.time_ticks_release !== 'number' || event.time_ticks_release < 0 || event.time_ticks_release > 511) return false;
    if (event.time_ticks_release <= event.time_ticks_press) return false;
    return true;
  }

  function tickToX(tick: number): number {
    const effectiveWidth = gridDimensions().effectiveTickWidth || tickWidth;
    return PIANO_WIDTH + tick * effectiveWidth;
  }

  function xToTick(x: number): number {
    const effectiveWidth = gridDimensions().effectiveTickWidth || tickWidth;
    return Math.max(0, Math.min(MAX_TICKS, (x - PIANO_WIDTH) / effectiveWidth));
  }

  function noteToY(note: number): number {
    return HEADER_HEIGHT + (noteRange().max - note) * laneHeight;
  }

  function yToNote(y: number): number {
    const note = noteRange().max - Math.floor((y - HEADER_HEIGHT) / laneHeight);
    return Math.max(0, Math.min(127, note));
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  // Initialize data
  function initializeLoop() {
    const page = editState.loops[0];
    if (!page) return;
    
    pageName = page.name || `U-${(editState.name7 || 'NONAME').slice(0,8)}`;
    const storeLoop = page.loops?.[index] as LoopData;
    
    const defaultLoop = { length_beats: 16, events: [] };
    localLoop = JSON.parse(JSON.stringify(storeLoop || defaultLoop));
    originalLoop = JSON.parse(JSON.stringify(storeLoop || defaultLoop));
  }

  onMount(initializeLoop);

  const isDirty = $derived(JSON.stringify(localLoop) !== JSON.stringify(originalLoop));

  // Event handlers
  function handleGridPointerDown(event: PointerEvent) {
    log.debug(`Grid pointer down: clientX=${event.clientX}, clientY=${event.clientY}`);
    
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    log.debug(`Grid coordinates: x=${x}, y=${y}`);
    
    const tick = snapTick(xToTick(x));
    const note = yToNote(y);
    
    log.debug(`Calculated position: tick=${tick}, note=${note}`);
    
    // Check if clicking on existing note
    const clickedNoteIndex = localLoop.events.findIndex(e => {
      const noteY = noteToY(e.note);
      const noteStartX = tickToX(e.time_ticks_press);
      const noteEndX = tickToX(e.time_ticks_release);
      
      return y >= noteY && y <= noteY + laneHeight &&
             x >= noteStartX && x <= noteEndX;
    });

    if (clickedNoteIndex >= 0) {
      log.debug(`Clicked existing note: noteIndex=${clickedNoteIndex}`);
      selectedNoteIndex = clickedNoteIndex;
      isDragging = true;
      dragStartPos = { x, y };
      dragOriginalNote = { ...localLoop.events[clickedNoteIndex] };
      
      // Set pointer capture for smooth dragging
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
    } else {
      // Create new note centered under cursor horizontally
      const baseTick = xToTick(x);
      const press = clamp(snapTick(baseTick - (DEFAULT_NOTE_LENGTH / 2)), 0, MAX_TICKS - 1);
      const release = clamp(press + DEFAULT_NOTE_LENGTH, 0, MAX_TICKS);
      const newNote = {
        note,
        velocity: 100,
        time_ticks_press: press,
        time_ticks_release: release
      };
      
      log.debug(`Creating new note: ${JSON.stringify(newNote)}`);
      localLoop.events.push(newNote);
      selectedNoteIndex = localLoop.events.length - 1;
      updateLoopLength();
    }
  }

  function handleGridPointerMove(event: PointerEvent) {
    if (!isDragging || selectedNoteIndex === null || !dragOriginalNote) {
      log.debug(`Skipping pointer move: isDragging=${isDragging}, selectedNoteIndex=${selectedNoteIndex}`);
      return;
    }

    // Compute coordinates relative to grid for consistent behavior
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    const currentNote = localLoop.events[selectedNoteIndex];
    if (!currentNote) {
      log.error(`No current note found for index: ${selectedNoteIndex}`);
      return;
    }

    log.debug(`Dragging note: mode=${dragMode}, x=${x}, y=${y}`);

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

      log.debug(`Velocity change: dY=${deltaYClient}, d=${d.toFixed(3)}, velChange=${velocityChange}, newVel=${newVelocity}`);
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

      log.debug(`Resize: dX=${deltaXClient}, ticks=${deltaTicksFloat.toFixed(2)}, snappedRelease=${snappedRelease}, newRelease=${newRelease}`);
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

      log.debug(`Note moved: newTick=${newTick}, newNote=${newNote}, originalLength=${originalLength}`);

      // Audition only when the pitch actually changes (debounced by value)
      if (currentNote.note !== lastAuditionedNote) {
        lastAuditionedNote = currentNote.note;
        log.debug(`Auditioning note change: ${currentNote.note}`);
        soundBackend.noteOn(currentNote.note, currentNote.velocity, 9);
        setTimeout(() => soundBackend.noteOff(currentNote.note, 0, 9), 100);
      }
    }
  }

  function handleGridPointerUp(event: PointerEvent) {
    if (isDragging && selectedNoteIndex !== null) {
      // Audition the final note
      const currentNote = localLoop.events[selectedNoteIndex];
      if (currentNote) {
        soundBackend.noteOn(currentNote.note, currentNote.velocity, 9);
        setTimeout(() => soundBackend.noteOff(currentNote.note, 0, 9), 150);
      }
    } else if (!isDragging && selectedNoteIndex !== null) {
      // Simple click - audition the note
      const currentNote = localLoop.events[selectedNoteIndex];
      if (currentNote) {
        soundBackend.noteOn(currentNote.note, currentNote.velocity, 9);
        setTimeout(() => soundBackend.noteOff(currentNote.note, 0, 9), 150);
      }
    }

    // Clean up drag state
    isDragging = false;
    dragMode = null;
    dragOriginalNote = null;
    lastAuditionedNote = null;
    
    // Only update loop length if we actually changed something
    if (dragOriginalNote) {
      updateLoopLength();
    }
  }

  function handleGridContextMenu(event: MouseEvent) {
    event.preventDefault();
    log.debug(`Right-click context menu: clientX=${event.clientX}, clientY=${event.clientY}`);
    
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    log.debug(`Context menu coordinates: x=${x}, y=${y}`);
    
    // Find note to delete
    const noteIndex = localLoop.events.findIndex(e => {
      const noteY = noteToY(e.note);
      const noteStartX = tickToX(e.time_ticks_press);
      const noteEndX = tickToX(e.time_ticks_release);
      
      const isInNote = y >= noteY && y <= noteY + laneHeight &&
                      x >= noteStartX && x <= noteEndX;
      
      log.debug(`Checking note for deletion: noteIndex=${localLoop.events.indexOf(e)}, isInNote=${isInNote}`);
      
      return isInNote;
    });

    if (noteIndex >= 0) {
      log.debug(`Deleting note: noteIndex=${noteIndex}`);
      localLoop.events.splice(noteIndex, 1);
      selectedNoteIndex = null;
      updateLoopLength();
    } else {
      log.debug(`No note found to delete at position: x=${x}, y=${y}`);
    }
  }
  
  // Handle right-click on notes directly
  function handleNoteContextMenu(event: MouseEvent, noteIndex: number) {
    event.preventDefault();
    event.stopPropagation();
    
    log.debug(`Right-click on note: noteIndex=${noteIndex}`);
    
    localLoop.events.splice(noteIndex, 1);
    selectedNoteIndex = null;
    updateLoopLength();
  }

  // Note-specific event handlers
  let lastAuditionedNote: number | null = null;
  let dragOffsetTick: number | null = null;
  let dragOffsetNote: number | null = null;

  function handleNotePointerDown(event: PointerEvent, noteIndex: number, mode: 'move' | 'velocity' | 'resize' = 'move') {
    event.stopPropagation();
    
    log.debug(`Note pointer down: noteIndex=${noteIndex}, mode=${mode}`);
    
    selectedNoteIndex = noteIndex;
    isDragging = true;
    dragMode = mode;
    
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    dragStartPos = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    dragStartClient = { x: event.clientX, y: event.clientY };
    dragOriginalNote = { ...localLoop.events[noteIndex] };

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
    soundBackend.noteOn(note, 100, 9);
    setTimeout(() => soundBackend.noteOff(note, 0, 9), 150);
  }

  function updateLoopLength() {
    // Kept for compatibility; actual loop length is derived reactively
    sortEvents();
  }


  // Playback functions
  function startPlayback() {
    if (isPlaying) return;
    
    const id = ++playbackId;
    isPlaying = true;
    playbackPosition = 0;
    
    const bpm = tempoState.bpm || 120;
    const msPerBeat = (60 / bpm) * 1000;
    const msPerTick = msPerBeat / TICKS_PER_BEAT;
    const loopLengthTicks = loopLengthBeats() * TICKS_PER_BEAT;
    const loopLengthMs = loopLengthTicks * msPerTick;
    
    soundBackend.allNotesOff();
    
    // Schedule notes
    const startTime = performance.now();
    const scheduleLoop = (cycleStart: number) => {
      localLoop.events.forEach(event => {
        const noteOnTime = cycleStart + (event.time_ticks_press * msPerTick);
        const noteOffTime = cycleStart + (event.time_ticks_release * msPerTick);
        
        setTimeout(() => {
          if (playbackId === id) {
            soundBackend.noteOn(event.note, event.velocity, 9);
          }
        }, Math.max(0, noteOnTime - performance.now()));
        
        setTimeout(() => {
          if (playbackId === id) {
            soundBackend.noteOff(event.note, 0, 9);
          }
        }, Math.max(0, noteOffTime - performance.now()));
      });
    };
    
    scheduleLoop(startTime);
    
    // Animation loop
    const animate = () => {
      if (playbackId !== id) return;
      
      const elapsed = performance.now() - startTime;
      const position = (elapsed % loopLengthMs) / msPerTick;
      playbackPosition = Math.floor(position) % loopLengthTicks;
      
      animationFrame = requestAnimationFrame(animate);
    };
    
    // Loop scheduling
    const scheduleNextLoop = () => {
      if (playbackId !== id) return;
      scheduleLoop(performance.now());
      playbackTimeout = window.setTimeout(scheduleNextLoop, loopLengthMs);
    };
    
    playbackTimeout = window.setTimeout(scheduleNextLoop, loopLengthMs);
    animationFrame = requestAnimationFrame(animate);
  }

  function stopPlayback() {
    isPlaying = false;
    playbackId++;
    playbackPosition = 0;
    soundBackend.allNotesOff();
    
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    
    if (playbackTimeout) {
      clearTimeout(playbackTimeout);
      playbackTimeout = null;
    }
  }

  // Save functions
  function saveAndClose() {
    const page = editState.loops[0];
    if (!page) return;
    
    const updated = { ...page } as any;
    if (!updated.loops) updated.loops = Array(15).fill(null);
    // Persist the derived loop length into saved data
    const toSave = JSON.parse(JSON.stringify(localLoop));
    toSave.length_beats = loopLengthBeats();
    updated.loops[index] = toSave;
    
    setEditorLoopData(0, updated);
    dispatch('save');
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
  let jsonText = $state('');
  let jsonError = $state('');

  function openJsonEditor() {
    jsonText = JSON.stringify(localLoop, null, 2);
    jsonError = '';
    showJsonEditor = true;
  }

  function applyJson() {
    try {
      const parsed = JSON.parse(jsonText);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid JSON object');
      }
      
      const length_beats = Math.max(1, Math.min(64, Number(parsed.length_beats) || 16));
      const events = Array.isArray(parsed.events) ? parsed.events.map((e: any) => ({
        note: clamp(Number(e.note) || 60, 0, 127),
        velocity: clamp(Number(e.velocity) || 100, 1, 127),
        time_ticks_press: clamp(Number(e.time_ticks_press) || 0, 0, MAX_TICKS),
        time_ticks_release: clamp(Number(e.time_ticks_release) || 1, 0, MAX_TICKS)
      })) : [];
      
      localLoop = { length_beats, events };
      showJsonEditor = false;
      jsonError = '';
    } catch (error) {
      jsonError = 'Invalid JSON format';
    }
  }
</script>

<div class="editor-screen">
  <!-- Header -->
  <div class="editor-header">
    <div class="header-left">
      <button class="back-button" onclick={requestClose} title="Back">←</button>
      <h2>Piano Roll</h2>
      <span class="subtitle">Editing {pageName} — slot {index + 1}</span>
    </div>
    
    <div class="header-right">
      <button class="play-button" onclick={isPlaying ? stopPlayback : startPlayback}>
        {isPlaying ? 'Stop' : 'Play'}
      </button>
      
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
      
      <button class="text-button" onclick={openJsonEditor}>Edit JSON</button>
      <button class="save-button" class:disabled={!isDirty} onclick={saveAndClose}>Save</button>
    </div>
  </div>

  <!-- Main Grid Area -->
  <div class="grid-container">
    <div class="grid-wrapper" style="width: {gridDimensions().totalWidth}px; height: {gridDimensions().totalHeight}px;">
      
      <!-- Piano Roll (Y-axis) -->
      <div class="piano-roll" style="height: {gridDimensions().gridHeight}px; top: {HEADER_HEIGHT}px;">
        {#each Array(gridDimensions().laneCount) as _, i}
          {@const note = noteRange().max - i}
          {@const isC = note % 12 === 0}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div 
            class="piano-key" 
            class:is-c={isC}
            style="height: {laneHeight}px; top: {i * laneHeight}px;"
            onclick={() => handlePianoClick(note)}
            onkeydown={(e) => e.key === 'Enter' && handlePianoClick(note)}
            role="button"
            tabindex="0"
          >
            {isC ? `C${Math.floor(note / 12)}` : ''}
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
        onpointerdown={handleGridPointerDown}
        onpointermove={handleGridPointerMove}
        onpointerup={handleGridPointerUp}
        oncontextmenu={handleGridContextMenu}
        role="application"
        aria-label="Piano roll grid - click to add notes, drag to move, right-click to delete"
      >
        <!-- Grid lines -->
        <svg class="grid-lines" width="100%" height="100%">
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
        {#each localLoop.events as event, i}
          {@const effectiveWidth = gridDimensions().effectiveTickWidth || tickWidth}
          {@const x = (event.time_ticks_press * effectiveWidth)}
          {@const width = ((event.time_ticks_release - event.time_ticks_press) * effectiveWidth)}
          {@const y = (noteRange().max - event.note) * laneHeight}
          {@const isSelected = selectedNoteIndex === i}
          {@const intensity = 0.3 + (event.velocity / 127) * 0.7} <!-- 30% to 100% intensity -->
          
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div 
            class="note-block"
            class:selected={isSelected}
            style="left: {x}px; top: {y}px; width: {width}px; height: {laneHeight - 2}px;"
            onpointerdown={(e) => handleNotePointerDown(e, i, 'move')}
            oncontextmenu={(e) => handleNoteContextMenu(e, i)}
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
                onpointerdown={(e) => handleNotePointerDown(e, i, 'velocity')}
              ></div>
              <!-- Main note body -->
              <div class="note-body"></div>
              <!-- Resize handle on the right -->
              <div 
                class="resize-handle"
                title="Drag to resize note length"
                onpointerdown={(e) => handleNotePointerDown(e, i, 'resize')}
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
          <div 
            class="playback-cursor" 
            style="left: {playbackPosition * effectiveWidth}px;"
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
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={() => showJsonEditor = false}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
      <div class="modal-header">
        <h3>Edit Loop JSON</h3>
        <button onclick={() => showJsonEditor = false}>✕</button>
      </div>
      
      <div class="modal-body">
        <textarea bind:value={jsonText} rows="15"></textarea>
        {#if jsonError}
          <div class="error-message">{jsonError}</div>
        {/if}
      </div>
      
      <div class="modal-footer">
        <button onclick={applyJson}>Apply</button>
        <button onclick={() => showJsonEditor = false}>Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .editor-screen {
    display: flex;
    flex-direction: column;
    height: 100vh;
    max-height: 90vh; /* scale up vertically */
    max-width: 95vw; /* Prevent exceeding viewport width */
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

  .play-button,
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

  .play-button:hover,
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
  }

  .piano-key:hover {
    background: #f3f4f6;
  }

  .piano-key.is-c {
    background: #f9fafb;
    color: #111827;
    font-weight: 500;
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

  /* Modal styles */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: white;
    border-radius: 8px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px;
    border-bottom: 1px solid #e5e7eb;
  }

  .modal-header h3 {
    margin: 0;
    font-size: 16px;
  }

  .modal-header button {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 18px;
  }

  .modal-body {
    padding: 16px;
    flex: 1;
    overflow: auto;
  }

  .modal-body textarea {
    width: 100%;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 12px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 8px;
    resize: vertical;
  }

  .modal-footer {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    padding: 16px;
    border-top: 1px solid #e5e7eb;
  }

  .error-message {
    color: #dc2626;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 4px;
    padding: 8px;
    margin-top: 8px;
    font-size: 12px;
  }
</style>
