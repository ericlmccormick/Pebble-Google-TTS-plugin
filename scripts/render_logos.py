#!/usr/bin/env python3
"""Render Pebble Universal TTS icons from the approved transparent SVG.

PNG output is deterministic and uses the same original logo proportions.
A 25x25 black/white resource is also generated for watch-app launcher menus.
"""
from io import BytesIO
from pathlib import Path

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SVG = (ROOT / "src" / "icon.svg").read_text(encoding="utf-8")
DEST = ROOT / "assets"
DEST.mkdir(parents=True, exist_ok=True)


def make_icon(size, destination, monochrome=False):
    source = SVG
    if monochrome:
        # Pebble grayscale/black-white launchers invert monochrome resources.
        source = source.replace("#0053f9", "#06080f")
    output = cairosvg.svg2png(
        bytestring=source.encode("utf-8"),
        output_width=size,
        output_height=size,
    )
    image = Image.open(BytesIO(output)).convert("RGBA")
    assert image.size == (size, size)
    assert image.getpixel((0, 0))[3] == 0
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, optimize=True, compress_level=9)
    print(destination.relative_to(ROOT), destination.stat().st_size, "bytes")


for n in (144, 80, 25):
    make_icon(n, DEST / ("universal_tts_logo_%d.png" % n))
make_icon(25, DEST / "universal_tts_logo_25_bw.png", monochrome=True)
make_icon(
    25,
    ROOT / "examples" / "hello-speech" / "resources" / "menu_icon.png",
    monochrome=True,
)
