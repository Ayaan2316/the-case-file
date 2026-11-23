"""Quick realism check on the rendered stills: the darkest pixels should be around sRGB 6-10
(no crushed blacks) and nothing should clip except the bulbs.
Usage: pnpm blender analyze_stills.py -- [glob]   (default: screenshots/blender/*.png, no _test)
"""
import glob
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from lib.common import SHOTS  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
pattern = argv[0] if argv else os.path.join(SHOTS, "*.png")
rows = []
for path in sorted(glob.glob(pattern)):
    if path.endswith("_test.png"):
        continue
    img = bpy.data.images.load(path)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)[:, :3] * 255.0
    lum = px @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    crushed = float(np.mean(px.max(axis=1) <= 3.0)) * 100
    clipped = float(np.mean(px.max(axis=1) >= 254.0)) * 100
    p01, p1, p50, p999 = np.percentile(lum, [0.1, 1, 50, 99.9])
    rows.append((os.path.basename(path), p01, p1, p50, p999, crushed, clipped))
    bpy.data.images.remove(img)

print(f"{'still':34} {'p0.1':>6} {'p1':>6} {'median':>7} {'p99.9':>7} {'crushed%':>9} {'clipped%':>9}")
for name, p01, p1, p50, p999, crushed, clipped in rows:
    print(f"STAT {name:29} {p01:6.1f} {p1:6.1f} {p50:7.1f} {p999:7.1f} {crushed:9.3f} {clipped:9.3f}")
