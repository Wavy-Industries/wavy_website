# Used to convert a folder of midi loops into a json file storing a drum pack
# use like: python scripts/midi_to_json.py pack_name
# where pack_name is the folder name inside scripts/midi/ which you want to convert.
# The resulting json file is stored in public/samples/MONKEY/DRM/pack_name.json

import json
import math
import os
from pathlib import Path
import mido
import sys

from colorama import Fore, Style
LOG_LEVEL = 3  # 0=important, 1=error, 2=warning, 3=info
def print_important(msg): print(Fore.BLUE + "IMP: " + msg + Style.RESET_ALL) if LOG_LEVEL >= 0 else None
def print_error(msg): print(Fore.RED + "ERR: " + msg + Style.RESET_ALL) if LOG_LEVEL >= 1 else None
def print_warning(msg): print(Fore.YELLOW + "WRN: " + msg + Style.RESET_ALL) if LOG_LEVEL >= 2 else None
def print_info(msg): print(Fore.WHITE + "INF: " + msg + Style.RESET_ALL) if LOG_LEVEL >= 3 else None
def print_debug(msg): print(Fore.BLACK + "DBG: " + msg + Style.RESET_ALL) if LOG_LEVEL >= 4 else None

assert len(sys.argv) > 1, "Please provide a pack name"

TICKS_PER_BEAT = 24
MAX_BEATS = 16

def main(pack_name):
    print_important(f'processing {pack_name}...')
    pack_root_dir = "scripts/midi/"
    pack_dir = pack_root_dir + pack_name

    # import loops
    midi_files = []
    for f in os.listdir(pack_dir):
        if f.endswith(".mid") and not f.endswith("-.mid"):
            midi_files.append(f)
    midi_files.sort()

    loops = []
    for i, midi_file in enumerate(midi_files):
        midi = mido.MidiFile(os.path.join(pack_dir, midi_file))
        scale = TICKS_PER_BEAT / midi.ticks_per_beat

        # simplify by combining all tracks, assuming they are all relevant
        tracks_merged = mido.merge_tracks(midi.tracks)

        abs_tick = 0
        loop = []
        for msg in tracks_merged:
            abs_tick += msg.time
            current_tick = int(round(abs_tick * scale))
            match msg.type:
                case "note_on":
                    print_debug(f"Note {msg.note} on at tick {current_tick} with velocity {msg.velocity}")
                    if (ongoing_event := next((event for event in loop if event["note"] == msg.note and event["time_ticks_release"] is None), None)) is not None:
                        print_warning(f"Note {msg.note} pressed at tick {current_tick} but previous press at tick {ongoing_event['time_ticks_press']} not released")
                        ongoing_event["time_ticks_release"] = current_tick
                    
                    loop.append({
                        "note": msg.note,
                        "time_ticks_press": current_tick,
                        "velocity": msg.velocity,
                        "time_ticks_release": None
                    })

                case "note_off":
                    print_debug(f"Note {msg.note} off at tick {current_tick}")
                    note_on_event = next((event for event in loop if event["note"] == msg.note and event["time_ticks_release"] is None), None)
                    if note_on_event is None:
                        print_error(f"Note {msg.note} released at tick {current_tick} but no press found")
                        continue
                    
                    note_on_event["time_ticks_release"] = current_tick

                case _:
                    pass
                
        # if press and release is on same tick, then make the length 1 tick
        for event in loop:
            if event["time_ticks_press"] == event["time_ticks_release"]:
                print_warning(f"Note length zero, setting to 1 tick")
                event["time_ticks_release"] = event["time_ticks_press"] + 1

        total_ticks = max((max(event["time_ticks_press"], event["time_ticks_release"] or 0) for event in loop))
        total_beats = total_ticks / (4*TICKS_PER_BEAT)

        # Handle any remaining press events (terminate at end)
        for event in loop:
            if event["time_ticks_release"] is None:
                print_warning(f"Note {event['note']} pressed at tick {event['time_ticks_press']} has no release - terminating at end")
                event["time_ticks_release"] = int(math.ceil(total_ticks))
        
        if total_beats > MAX_BEATS:
            print_error(f"{midi_file}: Length {total_beats:.1f} beats exceeds {MAX_BEATS} beat limit")
            exit(1)
            
        loop_length_beats = int(4 * 2 ** math.ceil(math.log2(total_ticks / (4 * TICKS_PER_BEAT))))
        loop = {
            "length_beats": loop_length_beats,
            "events": loop
        }

        loops.append(loop)
        print_info(f"Created loop {i} [{midi_file}] with {len(loop)} events, {loop_length_beats} beats ({total_ticks} ticks)")

    output = {
        "name": pack_name,
        "loops": loops
    }

    out_dir = Path("public/samples/MONKEY/DRM")
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{pack_name}.json"

    with open(out_path, 'w') as f:
        json.dump(output, f, indent=2)

    print_important(f"[SUCCESS] Wrote {len(loops)} loops to {out_path}\n")

if __name__ == "__main__":
    pack_names = sys.argv[1:]
    for pack_name in pack_names:
        main(pack_name)