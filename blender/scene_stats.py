"""Object / triangle counts per collection, for planning the bake + merge (under 150 draw calls).
Usage: pnpm blender scene_stats.py
"""
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
from lib.common import SCENES  # noqa: E402

bpy.ops.wm.open_mainfile(filepath=os.path.join(SCENES, "case_file.blend"))
deps = bpy.context.evaluated_depsgraph_get()
rows = {}
for obj in bpy.data.objects:
    if obj.type not in {"MESH", "CURVE", "FONT"} or obj.hide_render:
        continue
    col = obj.users_collection[0].name if obj.users_collection else "-"
    ev = obj.evaluated_get(deps)
    try:
        me = ev.to_mesh()
    except RuntimeError:
        continue
    me.calc_loop_triangles()
    tris = len(me.loop_triangles)
    ev.to_mesh_clear()
    r = rows.setdefault(col, [0, 0, set()])
    r[0] += 1
    r[1] += tris
    for slot in obj.material_slots:
        if slot.material:
            r[2].add(slot.material.name)
total = [0, 0, set()]
for col, (n, tris, mats) in sorted(rows.items()):
    print(f"STAT {col:22} objects={n:4d} tris={tris:9,d} materials={len(mats)}")
    total[0] += n
    total[1] += tris
    total[2] |= mats
print(f"STAT {'TOTAL':22} objects={total[0]:4d} tris={total[1]:9,d} materials={len(total[2])}")
