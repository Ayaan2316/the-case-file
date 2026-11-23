"""Triangle counts per top level root, heaviest first (for finding what to decimate).
Usage: pnpm blender heavy_objects.py
"""
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
from lib.common import SCENES  # noqa: E402

bpy.ops.wm.open_mainfile(filepath=os.path.join(SCENES, "case_file.blend"))
deps = bpy.context.evaluated_depsgraph_get()
roots = {}
for o in bpy.data.objects:
    if o.type not in {"MESH", "CURVE", "FONT"} or o.hide_render:
        continue
    top = o
    while top.parent:
        top = top.parent
    ev = o.evaluated_get(deps)
    try:
        me = ev.to_mesh()
    except RuntimeError:
        continue
    me.calc_loop_triangles()
    roots[top.name] = roots.get(top.name, 0) + len(me.loop_triangles)
    ev.to_mesh_clear()
for name, tris in sorted(roots.items(), key=lambda kv: -kv[1])[:30]:
    print(f"HEAVY {tris:9,d}  {name}")
