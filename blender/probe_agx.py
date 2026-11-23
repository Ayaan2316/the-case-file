"""Compares blender's AgX view with three's on a grey ramp and prints the curve that maps three's
displayed value onto blender's (`AGX_TO_BLENDER` in grading.ts). the stills use AgX with the
Medium High Contrast look (render_stills.py), the browser fakes that look with contrast 1.2
around grey before three's AgX (WhiteBalanceEffect in grading.ts).
Usage: pnpm blender probe_agx.py
"""
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from lib.common import SHOTS  # noqa: E402

STOPS = np.linspace(-14, 4, 361)
GREYS = 2.0 ** STOPS
N = 32  # curve segments, even in sqrt(three's value) because the toe needs the resolution


def blender_view(greys):
    """the ramp as blender's AgX + medium high contrast writes it (sRGB display, 0..1)"""
    img = bpy.data.images.new("agx_ramp", len(greys), 1, float_buffer=True, alpha=True)
    img.colorspace_settings.name = "Linear Rec.709"
    px = np.ones((len(greys), 4), dtype=np.float32)
    px[:, :3] = greys[:, None]
    img.pixels.foreach_set(px.ravel())
    scene = bpy.context.scene
    scene.display_settings.display_device = "sRGB"
    settings = scene.render.image_settings
    settings.file_format, settings.color_depth, settings.color_mode = "PNG", "16", "RGB"
    vs = scene.view_settings
    vs.view_transform = "AgX"
    vs.look = "AgX - Medium High Contrast"
    vs.exposure, vs.gamma = 0.0, 1.0
    vs.use_curve_mapping = vs.use_white_balance = False
    path = os.path.join(SHOTS, "_agx_probe.png")
    img.save_render(path, scene=scene)
    back = bpy.data.images.load(path)
    back.colorspace_settings.name = "Non-Color"
    out = np.array(back.pixels[:], dtype=np.float64).reshape(-1, 4)[:, 0]
    os.remove(path)
    return out


def three_view(greys):
    """three's AgXToneMapping on greys (its matrices cancel out), after our contrast, as displayed"""
    g = 0.18 * (greys / 0.18) ** 1.2
    t = np.clip((np.log2(g) + 12.47393) / (4.026069 + 12.47393), 0, 1)
    t2 = t * t
    t4 = t2 * t2
    s = 15.5 * t4 * t2 - 40.14 * t4 * t + 31.96 * t4 - 6.868 * t2 * t + 0.4298 * t2 + 0.1191 * t - 0.00232
    lin = np.clip(np.maximum(s, 0) ** 2.2, 0, 1)
    return np.where(lin <= 0.0031308, 12.92 * lin, 1.055 * lin ** (1 / 2.4) - 0.055)


blender = blender_view(GREYS)
three = three_view(GREYS)
keep = np.r_[True, np.diff(three) > 1e-9]
u, y = np.sqrt(three[keep]), blender[keep]
curve = np.interp(np.linspace(0, 1, N + 1), u, y)
curve[0] = 0.0
err = (np.interp(u, np.linspace(0, 1, N + 1), curve) - y) * 255
print(f"[agx] max fit error {np.abs(err).max():.2f} levels; monotonic {bool(np.all(np.diff(curve) >= 0))}")
for stop in (-8, -6, -4, -2.47393, 0, 2):
    i = int(np.argmin(np.abs(STOPS - stop)))
    print(f"[agx] {stop:+6.2f} stops: blender {blender[i] * 255:6.1f}  three {three[i] * 255:6.1f}")
print("const AGX_TO_BLENDER = [" + ", ".join(f"{v:.4f}" for v in curve) + "];")
