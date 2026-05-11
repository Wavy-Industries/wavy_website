#!/usr/bin/env python3
"""
greenscreen_to_gradient.py
==========================

Composite a green-screen product render onto a vertical gradient background
with an optional textured 'floor' fading in toward the bottom.

Designed for product-style hero shots (Fusion 360 renders against a pure
green background, etc). Three-step pipeline:

  1. Chroma key + despill
       Pixels are keyed by 'greenness' = G - max(R, B).
       Where green dominates, G is clamped to max(R, B) to remove the
       green tint that would otherwise cling to transparent / edge pixels.

  2. Vertical gradient background
       Linear blend top -> bottom in RGB.

  3. Floor texture (optional)
       Multi-octave Gaussian-blurred white noise, faded in over the lower
       portion of the frame, added to the gradient at low amplitude. Gives
       the bottom of the frame a sense of being a *surface* without
       drawing attention to itself.

Usage
-----
    python greenscreen_to_gradient.py input.png output.png

    # Customise:
    python greenscreen_to_gradient.py input.png output.png \\
        --top  0,0,0          \\
        --bot  44,44,44       \\
        --tex-strength 7      \\
        --tex-fade-start 0.45

Dependencies: numpy, pillow, scipy. (`pip install numpy pillow scipy`)
"""

from __future__ import annotations
import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter


# --------------------------------------------------------------------------- #
# Pipeline                                                                    #
# --------------------------------------------------------------------------- #

def chroma_key(rgba: np.ndarray,
               key_lo: float = 20.0,
               key_hi: float = 150.0
               ) -> tuple[np.ndarray, np.ndarray]:
    """
    Returns (foreground_rgb, alpha) where:
      - alpha is a soft mask in [0, 1]; 1 = fully opaque, 0 = pure key.
      - foreground_rgb has had green-spill clamped out.

    Parameters
    ----------
    key_lo, key_hi : 'greenness' thresholds (in 0..255 units).
        greenness = G - max(R, B). Below `key_lo` the pixel is fully kept,
        above `key_hi` fully keyed, linear in between for soft edges.
    """
    R, G, B = rgba[..., 0], rgba[..., 1], rgba[..., 2]
    max_rb = np.maximum(R, B)
    greenness = G - max_rb

    # Soft alpha mask
    alpha = 1.0 - np.clip((greenness - key_lo) / (key_hi - key_lo), 0.0, 1.0)

    # Despill: clamp G down to max(R, B) wherever G is the dominant channel
    G_despilled = np.where(greenness > 0, max_rb, G)
    fg = np.stack([R, G_despilled, B], axis=-1)

    return fg, alpha


def vertical_gradient(h: int, w: int,
                      top_rgb: tuple[int, int, int],
                      bot_rgb: tuple[int, int, int]
                      ) -> np.ndarray:
    """Linear top->bottom RGB gradient, shape (h, w, 3) float32."""
    t = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
    top = np.array(top_rgb, dtype=np.float32)
    bot = np.array(bot_rgb, dtype=np.float32)
    col = top * (1 - t) + bot * t                         # (h, 3)
    return np.broadcast_to(col[:, None, :], (h, w, 3)).copy()


def floor_texture(h: int, w: int,
                  fade_start: float = 0.45,
                  fade_curve: float = 1.4,
                  octaves: tuple[tuple[float, float], ...] = (
                      (60.0, 0.55),  # broad lighting unevenness
                      (18.0, 0.30),  # mid grain
                      ( 4.0, 0.15),  # fine grit
                  ),
                  horizontal_smear: float = 1.5,
                  seed: int = 7,
                  ) -> np.ndarray:
    """
    Returns a (h, w, 1) float32 mask in roughly [-1, 1] * fade(y).
    Multiplied by `tex_strength` (caller's choice) to get pixel offsets.

    `fade_start` is the vertical fraction at which the texture begins
    fading in; below it the texture is invisible.
    `horizontal_smear` slightly stretches the noise sideways so the surface
    reads as a floor seen across, not a top-down view.
    """
    rng_master = np.random.default_rng(seed)
    tex = np.zeros((h, w), dtype=np.float32)
    for sigma, weight in octaves:
        layer = rng_master.standard_normal((h, w)).astype(np.float32)
        layer = gaussian_filter(layer, sigma=sigma)
        layer = (layer - layer.mean()) / (layer.std() + 1e-8)
        tex += layer * weight

    tex /= np.abs(tex).max() + 1e-8                       # normalise to [-1, 1]
    tex = gaussian_filter(tex, sigma=(0.0, horizontal_smear))

    # Fade in toward the bottom
    t = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
    fade = np.clip((t - fade_start) / max(1e-6, 1.0 - fade_start), 0, 1)
    fade = fade ** fade_curve
    fade = np.broadcast_to(fade, (h, w))

    return (tex * fade)[..., None]                        # (h, w, 1)


def composite(input_path: Path,
              output_path: Path,
              top_rgb: tuple[int, int, int]  = (0, 0, 0),
              bot_rgb: tuple[int, int, int]  = (44, 44, 44),
              tex_strength: float            = 7.0,
              tex_fade_start: float          = 0.45,
              key_lo: float                  = 20.0,
              key_hi: float                  = 150.0,
              ) -> None:
    rgba = np.array(Image.open(input_path).convert('RGBA'), dtype=np.float32)
    h, w = rgba.shape[:2]

    fg, alpha = chroma_key(rgba, key_lo=key_lo, key_hi=key_hi)
    bg = vertical_gradient(h, w, top_rgb, bot_rgb)

    if tex_strength > 0:
        bg = bg + floor_texture(h, w, fade_start=tex_fade_start) * tex_strength

    a = alpha[..., None]
    out = fg * a + bg * (1.0 - a)
    out = np.clip(out, 0, 255).astype(np.uint8)

    Image.fromarray(out, mode='RGB').save(output_path, optimize=True)
    print(f"wrote {output_path}  ({w}x{h})")


# --------------------------------------------------------------------------- #
# CLI                                                                         #
# --------------------------------------------------------------------------- #

def _parse_rgb(s: str) -> tuple[int, int, int]:
    parts = [int(p) for p in s.split(',')]
    if len(parts) != 3 or not all(0 <= p <= 255 for p in parts):
        raise argparse.ArgumentTypeError(f"expected 'R,G,B' with 0-255 values, got {s!r}")
    return tuple(parts)  # type: ignore[return-value]


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('input',  type=Path, help='Green-screen RGBA PNG')
    p.add_argument('output', type=Path, help='Output PNG (RGB)')
    p.add_argument('--top', type=_parse_rgb, default=(0, 0, 0),
                   help="Gradient top color 'R,G,B' (default 0,0,0)")
    p.add_argument('--bot', type=_parse_rgb, default=(44, 44, 44),
                   help="Gradient bottom color 'R,G,B' (default 44,44,44)")
    p.add_argument('--tex-strength', type=float, default=7.0,
                   help='Floor-texture amplitude in 0-255 units. 0 disables. (default 7)')
    p.add_argument('--tex-fade-start', type=float, default=0.45,
                   help='Fraction of frame height where texture starts fading in (default 0.45)')
    p.add_argument('--key-lo', type=float, default=20.0,
                   help='Greenness threshold below which pixels are fully kept')
    p.add_argument('--key-hi', type=float, default=150.0,
                   help='Greenness threshold above which pixels are fully keyed')
    args = p.parse_args()

    composite(args.input, args.output,
              top_rgb=args.top, bot_rgb=args.bot,
              tex_strength=args.tex_strength,
              tex_fade_start=args.tex_fade_start,
              key_lo=args.key_lo, key_hi=args.key_hi)


if __name__ == '__main__':
    main()
