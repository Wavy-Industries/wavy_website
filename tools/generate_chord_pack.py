# Generates MIDI chord packs for PAT
# Each pack contains 15 chords mapped to white keys F0-F2
# Each MIDI file contains a single chord with configurable length
#
# Usage: python tools/generate_chord_pack.py

from pathlib import Path
from mido import MidiFile, MidiTrack, Message

# =============================================================================
# CONSTANTS
# =============================================================================

TICKS_PER_BEAT = 480  # Standard MIDI resolution
VELOCITY = 100        # Note velocity (0-127)

# White keys from F0 to F2 (15 keys total)
# MIDI note numbers: F0=17, G0=19, A0=21, B0=23, C1=24, D1=26, E1=28,
#                    F1=29, G1=31, A1=33, B1=35, C2=36, D2=38, E2=40, F2=41
WHITE_KEYS_F0_TO_F2 = [17, 19, 21, 23, 24, 26, 28, 29, 31, 33, 35, 36, 38, 40, 41]

# =============================================================================
# CHORD PACK DEFINITIONS
# =============================================================================

# Chord intervals relative to root (in semitones)
CHORD_TYPES = {
    'major':      [0, 4, 7],           # Root, M3, P5
    'minor':      [0, 3, 7],           # Root, m3, P5
    'dim':        [0, 3, 6],           # Root, m3, d5
    'dim7':       [0, 3, 6, 9],        # Root, m3, d5, d7
    'hdim7':      [0, 3, 6, 10],       # Root, m3, d5, m7 (half-diminished / m7b5)
    'aug':        [0, 4, 8],           # Root, M3, A5
    'sus2':       [0, 2, 7],           # Root, M2, P5
    'sus4':       [0, 5, 7],           # Root, P4, P5
    'maj7':       [0, 4, 7, 11],       # Root, M3, P5, M7
    'min7':       [0, 3, 7, 10],       # Root, m3, P5, m7
    'dom7':       [0, 4, 7, 10],       # Root, M3, P5, m7
    '7sus4':      [0, 5, 7, 10],       # Root, P4, P5, m7
    'add9':       [0, 4, 7, 14],       # Root, M3, P5, M9
    'madd9':      [0, 3, 7, 14],       # Root, m3, P5, M9
    'maj9':       [0, 4, 7, 11, 14],   # Root, M3, P5, M7, M9
    'min9':       [0, 3, 7, 10, 14],   # Root, m3, P5, m7, M9
    '6':          [0, 4, 7, 9],        # Root, M3, P5, M6
}

# =============================================================================
# PACK CONFIGURATION
# =============================================================================

# Each pack defines 15 chord types (one per white key trigger F0-F2)
# The chord root is derived from the trigger key, transposed up to a playable octave
# 'transpose_octaves' shifts the trigger note up N octaves for the chord root

PACKS = {
    # Pack 1: Diatonic triads in C major
    # Chord roots follow the trigger keys (F0->F, G0->G, etc.) transposed up 3 octaves
    'TRIADS': {
        'length_steps': 64,        # Chord length in steps (1 step = 1/16th note)
        'transpose_octaves': 3,   # Transpose trigger note up 3 octaves for chord root
        'chord_types': [
            # Chord type for each trigger (F0 through F2)
            # Using diatonic triads from C major scale
            'major',   # F0 -> F major
            'major',   # G0 -> G major
            'minor',   # A0 -> A minor
            'dim',     # B0 -> B dim
            'major',   # C1 -> C major
            'minor',   # D1 -> D minor
            'minor',   # E1 -> E minor
            'major',   # F1 -> F major
            'major',   # G1 -> G major
            'minor',   # A1 -> A minor
            'dim',     # B1 -> B dim
            'major',   # C2 -> C major
            'minor',   # D2 -> D minor
            'minor',   # E2 -> E minor
            'major',   # F2 -> F major
        ]
    },

    # Pack 2: Diatonic seventh chords in C major
    'SEVENS': {
        'length_steps': 64,
        'transpose_octaves': 3,
        'chord_types': [
            # Diatonic 7th chords from C major scale
            'maj7',    # F0 -> Fmaj7
            'dom7',    # G0 -> G7 (dominant)
            'min7',    # A0 -> Am7
            'hdim7',   # B0 -> Bm7b5 (half-diminished)
            'maj7',    # C1 -> Cmaj7
            'min7',    # D1 -> Dm7
            'min7',    # E1 -> Em7
            'maj7',    # F1 -> Fmaj7
            'dom7',    # G1 -> G7
            'min7',    # A1 -> Am7
            'hdim7',   # B1 -> Bm7b5
            'maj7',    # C2 -> Cmaj7
            'min7',    # D2 -> Dm7
            'min7',    # E2 -> Em7
            'maj7',    # F2 -> Fmaj7
        ]
    },
}

# =============================================================================
# MIDI GENERATION
# =============================================================================

def create_chord_midi(notes: list[int], length_ticks: int, velocity: int = VELOCITY) -> MidiFile:
    """Create a MIDI file with a single chord."""
    mid = MidiFile(ticks_per_beat=TICKS_PER_BEAT)
    track = MidiTrack()
    mid.tracks.append(track)

    # Note on events (all at time 0)
    for i, note in enumerate(notes):
        # First note has delta=0, subsequent notes also delta=0 (simultaneous)
        track.append(Message('note_on', note=note, velocity=velocity, time=0))

    # Note off events (all at length_ticks)
    for i, note in enumerate(notes):
        # First note_off has delta=length_ticks, subsequent notes delta=0
        delta = length_ticks if i == 0 else 0
        track.append(Message('note_off', note=note, velocity=0, time=delta))

    return mid


def midi_note_name(midi_note: int) -> str:
    """Convert MIDI note number to note name (e.g., 60 -> 'C4')."""
    note_names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
    name = note_names[midi_note % 12]
    octave = (midi_note // 12) - 1
    return f"{name}{octave}"


def generate_pack(pack_name: str, pack_config: dict, output_dir: Path):
    """Generate all MIDI files for a chord pack."""
    pack_dir = output_dir / pack_name
    pack_dir.mkdir(parents=True, exist_ok=True)

    length_steps = pack_config['length_steps']
    transpose_octaves = pack_config['transpose_octaves']
    chord_types = pack_config['chord_types']

    # Convert steps to ticks (1 step = 1/4 beat)
    length_ticks = length_steps * (TICKS_PER_BEAT // 4)

    print(f"\nGenerating pack: {pack_name}")
    print(f"  Length: {length_steps} steps ({length_ticks} ticks)")
    print(f"  Transpose: +{transpose_octaves} octaves")
    print(f"  Output: {pack_dir}")

    for i, chord_type in enumerate(chord_types):
        trigger_note = WHITE_KEYS_F0_TO_F2[i]
        trigger_name = midi_note_name(trigger_note)

        # Chord root = trigger note transposed up
        root_midi = trigger_note + (transpose_octaves * 12)

        # Build chord from root + intervals
        intervals = CHORD_TYPES[chord_type]
        chord_notes = [root_midi + interval for interval in intervals]

        # Create MIDI file
        midi = create_chord_midi(chord_notes, length_ticks)

        # Save with zero-padded filename
        filename = f"{i+1:02d}.mid"
        filepath = pack_dir / filename
        midi.save(filepath)

        root_name = midi_note_name(root_midi)
        print(f"  [{i+1:02d}] {trigger_name} -> {root_name} {chord_type}: {chord_notes}")


def main():
    output_dir = Path("tools/midi/PAT")

    print("=" * 60)
    print("CHORD PACK GENERATOR")
    print("=" * 60)
    print(f"\nTrigger keys: F0 to F2 (15 white keys)")
    print(f"MIDI notes: {WHITE_KEYS_F0_TO_F2}")

    for pack_name, pack_config in PACKS.items():
        generate_pack(pack_name, pack_config, output_dir)

    print("\n" + "=" * 60)
    print("Done!")
    print("=" * 60)


if __name__ == "__main__":
    main()
