"""Generates the toolbar icons (src/icons/{on,off}-{16,32,48,128}.png).

Dev-only helper, needs Pillow and NumPy. The PNGs are committed, so the build does not
depend on this script. Run: python3 scripts/make-icons.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "src" / "icons"
SIZES = (16, 32, 48, 128)
COLORS = {"on": (217, 48, 37, 255), "off": (110, 110, 120, 255)}
SCALE = 8  # supersampling for smooth edges


def draw(size: int, color: tuple) -> Image.Image:
    s = size * SCALE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.22), fill=color)

    white = (255, 255, 255, 255)
    stroke = max(int(s * 0.075), 1)
    # Eye: lens shape = intersection of two large circles, drawn as outline
    def lens(inset: float) -> Image.Image:
        m1 = Image.new("L", (s, s), 0)
        m2 = Image.new("L", (s, s), 0)
        R = s * 0.55 - inset
        ImageDraw.Draw(m1).ellipse((s / 2 - R, s * 0.21 + inset, s / 2 + R, s * 0.21 + inset + 2 * R), fill=255)
        ImageDraw.Draw(m2).ellipse((s / 2 - R, s * 0.79 - inset - 2 * R, s / 2 + R, s * 0.79 - inset), fill=255)
        return Image.fromarray(np.minimum(np.array(m1), np.array(m2)))

    outer = np.array(lens(0))
    inner = np.array(lens(stroke))
    ring = Image.fromarray(np.clip(outer.astype(int) - inner.astype(int), 0, 255).astype("uint8"))
    img.paste(white, (0, 0), ring)
    # Pupil
    r = s * 0.11
    d.ellipse((s / 2 - r, s / 2 - r, s / 2 + r, s / 2 + r), fill=white)
    # Slash with a gap in the background colour
    d.line((s * 0.2, s * 0.8, s * 0.8, s * 0.2), fill=color, width=int(stroke * 2.4))
    d.line((s * 0.2, s * 0.8, s * 0.8, s * 0.2), fill=white, width=stroke)
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, color in COLORS.items():
        for size in SIZES:
            draw(size, color).save(OUT / f"{name}-{size}.png", optimize=True)


if __name__ == "__main__":
    main()
