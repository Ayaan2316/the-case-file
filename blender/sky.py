"""Night sky backdrop for the office window: the poly haven HDRI as an 8 bit png for KTX2.

Usage: pnpm blender sky.py  (then pnpm assets:optimize)
Reads assets-src/hdri/modern_buildings_night_1k.hdr (pnpm assets:fetch), writes assets-src/export/sky/city_night_sky.png.
The sky is only ever seen as a background through the rainy window (reflections come from
RoomProbe) so full float range isn't needed - linear values get divided by SKY_RANGE and sRGB
encoded. CitySky.tsx multiplies SKY_RANGE back in.
"""
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from lib.common import REPO  # noqa: E402

SKY_RANGE = 8.0  # keep in sync with SKY_RANGE in CitySky.tsx
SRC = os.path.join(REPO, "assets-src", "hdri", "modern_buildings_night_1k.hdr")
OUT = os.path.join(REPO, "assets-src", "export", "sky", "city_night_sky.png")

img = bpy.data.images.load(SRC)
w, h = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
lin = np.clip(px[..., :3] / SKY_RANGE, 0, 1)
srgb = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
clipped = (px[..., :3].max(axis=2) > SKY_RANGE).mean()

png = bpy.data.images.new("city_night_sky", w, h, alpha=False)
png.colorspace_settings.name = "Non-Color"  # values are already sRGB encoded, store as is
png.pixels[:] = np.concatenate([srgb, np.ones((h, w, 1), np.float32)], axis=2).ravel()
os.makedirs(os.path.dirname(OUT), exist_ok=True)
png.filepath_raw = OUT
png.file_format = "PNG"
png.save()
print(f"[sky] {OUT} {w}x{h}, {clipped:.4%} of texels above {SKY_RANGE} clipped")
