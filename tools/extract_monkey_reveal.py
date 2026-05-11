#!/usr/bin/env python3
# Extract WebP frames from the monkey reveal video for the scroll-driven canvas animation.
#
# Source: src/assets/monkey/monkey_front_reveal_LED_compressed.mp4 (1920x570, 30fps, ~4.9s)
# Output: src/assets/monkey/reveal/frame_NNN.webp  (frames 0..N, covering 0–END_SEC)
#
# The page plays these in REVERSE on scroll (last frame -> first frame), so the
# device animates from its END_SEC pose back to the start as the user scrolls down.
# Frames live under src/assets so Astro/Vite hashes + serves them with cache busting.
#
# Usage: python tools/extract_monkey_reveal.py

import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC = REPO_ROOT / "src/assets/monkey/monkey_front_reveal_LED_compressed.mp4"
OUT_DIR = REPO_ROOT / "src/assets/monkey/reveal"

FPS = 30           # source frame rate
END_SEC = 2.8      # last second to include — the first-displayed frame in the reveal
TARGET_WIDTH = 1600
QUALITY = 78       # libwebp quality

def main():
    if not SRC.exists():
        print(f"Source video not found: {SRC}", file=sys.stderr)
        sys.exit(1)
    if shutil.which("ffmpeg") is None:
        print("ffmpeg is not on PATH", file=sys.stderr)
        sys.exit(1)

    if OUT_DIR.exists():
        shutil.rmtree(OUT_DIR)
    OUT_DIR.mkdir(parents=True)

    args = [
        "ffmpeg",
        "-y",
        "-i", str(SRC),
        "-t", str(END_SEC),
        "-vf", f"fps={FPS},scale={TARGET_WIDTH}:-1:flags=lanczos",
        "-c:v", "libwebp",
        "-quality", str(QUALITY),
        "-compression_level", "6",
        "-loop", "0",
        str(OUT_DIR / "frame_%03d.webp"),
    ]
    print(" ".join(args))
    subprocess.run(args, check=True)

    files = sorted(p for p in OUT_DIR.iterdir() if p.suffix == ".webp")
    total = sum(p.stat().st_size for p in files)
    print(f"\nGenerated {len(files)} frames, {total / 1024:.1f} KB total")
    if files:
        print(f"First: {files[0].name}, last: {files[-1].name}")

if __name__ == "__main__":
    main()
