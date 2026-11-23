"""Prints objects, collections and real world size for every downloaded poly haven model.
Usage: pnpm blender inspect_assets.py
"""
import bpy
import glob
import os
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets-src", "polyhaven", "models"))

for path in sorted(glob.glob(os.path.join(ROOT, "*", "*.blend"))):
    bpy.ops.wm.open_mainfile(filepath=path)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    size = hi - lo
    cols = [c.name for c in bpy.data.collections]
    names = [o.name for o in bpy.data.objects][:8]
    print(f"ASSET {os.path.basename(path)} objs={len(bpy.data.objects)} meshes={len(meshes)} "
          f"size=({size.x:.3f},{size.y:.3f},{size.z:.3f}) min_z={lo.z:.3f} "
          f"center=({(lo.x+hi.x)/2:.2f},{(lo.y+hi.y)/2:.2f}) cols={cols} names={names}")
