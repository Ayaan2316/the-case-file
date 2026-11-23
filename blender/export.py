"""Exports the baked scene to GLBs + lightmaps + a scene manifest.

Usage: pnpm blender export.py
Reads blender/scenes/case_file_baked.blend, writes to assets-src/export/ (raw, git ignored).
scripts/optimize.mjs then compresses them into public/models and public/textures.

- <scene>.glb: joined static meshes, every dyn_* piece (pivots go in scene.json), glass and
  emitters. one file per room so each shared atlas only ships once
- lightmaps/<group>_lm.png: RGBM lightmaps (matched by mesh name in lib/materials.ts)
- scene.json: groups, lightmaps, live lights and cameras in three.js (Y-up) coords
"""
import json
import math
import os
import re
import shutil
import sys

sys.path.insert(0, os.path.dirname(__file__))

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from lib import common  # noqa: E402

OUT = os.path.join(common.ASSETS, "export")
BAKES = os.path.join(common.REPO, "blender", "bakes")
FLOORS = {"corridor_terrazzo", "office_floor", "evidence_floor", "interro_floor"}


def to_three(v):
    """blender Z-up -> three Y-up"""
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def scene_of(o):
    names = {c.name for c in o.users_collection}
    for c in list(names):
        col = bpy.data.collections.get(c)
        while col is not None:
            names.add(col.name)
            col = next((p for p in bpy.data.collections if col.name in p.children), None)
    group = o.get("case_group", "")
    if group.startswith("corridor") or any(n.startswith("corridor") for n in names):
        return "corridor"
    if group.startswith("evidence") or any(n.startswith("evidence") for n in names):
        return "evidence"
    if group.startswith("interro") or any(n.startswith("interro") for n in names):
        return "interrogation"
    return "office"


def _inside(poly, pt):
    """point in polygon (2D, even-odd)"""
    x, y = pt
    hit = False
    for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]):
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * (x1 - x0) / (y1 - y0):
            hit = not hit
    return hit


def drop_faces_under_floors():
    """each room's slab (keeps cycles light tight) has its top face exactly on the floor plane. in the
    browser two coplanar surfaces z-fight and the slab's skirting/plaster shows through the floor in
    bands that crawl when the camera moves. so drop every other horizontal shell face that sits in
    the floor plane, under the floor
    """
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        slots = [s.material.name if s.material else "" for s in o.material_slots]
        if not FLOORS.intersection(slots):
            continue
        mw = o.matrix_world
        nm = mw.inverted_safe().transposed().to_3x3()
        bm = bmesh.new()
        bm.from_mesh(o.data)
        floors = []
        for f in bm.faces:
            if slots[f.material_index] in FLOORS:
                pts = [mw @ v.co for v in f.verts]
                floors.append(([(p.x, p.y) for p in pts], sum(p.z for p in pts) / len(pts)))
        doomed = []
        for f in bm.faces:
            if slots[f.material_index] in FLOORS or abs((nm @ f.normal).normalized().z) < 0.999:
                continue
            pts = [mw @ v.co for v in f.verts]
            c = sum(pts, Vector()) / len(pts)
            if any(all(abs(p.z - z) < 0.001 for p in pts) and _inside(poly, (c.x, c.y)) for poly, z in floors):
                doomed.append(f)
        if doomed:
            area = sum(f.calc_area() for f in doomed)
            bmesh.ops.delete(bm, geom=doomed, context="FACES_ONLY")
            bm.to_mesh(o.data)
            print(f"[export] {o.name}: dropped {len(doomed)} faces ({area:.1f} m²) under the floor")
        bm.free()


def export(objs, path):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
        export_texcoords=True, export_normals=True, export_materials="EXPORT", export_image_format="AUTO",
        export_extras=True, export_cameras=False, export_lights=False, export_animations=False)
    print(f"[export] {os.path.basename(path)}: {len(objs)} objects, {os.path.getsize(path) / 1e6:.1f} MB")


def main():
    bpy.ops.wm.open_mainfile(filepath=os.path.join(common.SCENES, "case_file_baked.blend"))
    os.makedirs(os.path.join(OUT, "lightmaps"), exist_ok=True)
    report = json.load(open(os.path.join(BAKES, "bake_report.json")))

    # glass/emissive leftovers from scans carry full 2K texture sets but they're tiny on screen,
    # cap them at 512px
    for o in bpy.data.objects:
        if o.type == "MESH" and "case_special" in o:
            for slot in o.material_slots:
                m = slot.material
                for n in (m.node_tree.nodes if m and m.use_nodes else []):
                    img = getattr(n, "image", None)
                    if img and max(img.size) > 512:
                        img.scale(512, 512)

    drop_faces_under_floors()

    sets = {"office": [], "corridor": [], "evidence": [], "interrogation": []}
    for o in bpy.data.objects:
        if o.type != "MESH" or o.name.startswith("__"):
            continue
        if not (o.name.startswith(("static_", "dyn_", "fx_")) or "case_special" in o or "case_group" in o):
            continue
        sets[scene_of(o)].append(o)
    for name, objs in sets.items():
        if objs:
            export(objs, os.path.join(OUT, f"{name}.glb"))

    groups = {}
    for g, info in report.items():
        src = os.path.join(BAKES, f"{info['lightmap']}.png")
        if os.path.exists(src):
            shutil.copy(src, os.path.join(OUT, "lightmaps", f"{info['lightmap']}.png"))
        groups[g] = {k: info[k] for k in ("kind", "lightmap", "rgbmRange", "objects")}

    lights = []
    for o in bpy.data.objects:
        if o.type != "LIGHT" or not o.name.startswith("live_"):
            continue
        d = o.matrix_world.to_quaternion() @ Vector((0, 0, -1))
        L = o.data
        lights.append({
            "name": o.name, "type": L.type, "position": to_three(o.matrix_world.translation),
            "direction": to_three(d), "energyW": L.energy,
            "temperature": L.temperature if L.use_temperature else None, "color": list(L.color),
            "spotAngle": getattr(L, "spot_size", None), "spotBlend": getattr(L, "spot_blend", None),
            "realtime": bool(o.get("case_realtime")),
        })
    # every light that puts a highlight on glossy stuff (bake_* too - browser lightmaps only have their
    # diffuse, shine.ts adds the specular). the ambient fill has none
    highlights = []
    for o in bpy.data.objects:
        if o.type != "LIGHT" or not o.name.startswith(("live_", "bake_")) or "ambient" in o.name:
            continue
        # swinging lamp does its own highlights live, bounce stand-ins have none
        if o.get("case_realtime") or o.get("case_bake_only"):
            continue
        L = o.data
        d = o.matrix_world.to_quaternion() @ Vector((0, 0, -1))
        highlights.append({
            "name": o.name, "type": L.type, "position": to_three(o.matrix_world.translation),
            "direction": to_three(d), "axis": to_three(o.matrix_world.to_quaternion() @ Vector((1, 0, 0))),
            "energyW": L.energy, "color": list(L.color),
            "temperature": L.temperature if getattr(L, "use_temperature", False) else None,
            "spotSize": getattr(L, "spot_size", None), "spotBlend": getattr(L, "spot_blend", None),
            "size": [getattr(L, "size", 0.0), getattr(L, "size_y", 0.0) if L.type == "AREA" else 0.0]
            if L.type == "AREA" else [getattr(L, "shadow_soft_size", 0.0), 0.0],
        })
    # evidence board layout for the live polaroids/pins/yarn that replace the baked ones
    # (evidence_board in furniture.py: board faces local +X, cork at x=0.0228)
    board = {}
    root = bpy.data.objects.get("static_evidence_board") or bpy.data.objects.get("__root_static_evidence_board")
    if root:
        loc, rot, _ = root.matrix_world.decompose()
        q = [round(rot.x, 6), round(rot.z, 6), round(-rot.y, 6), round(rot.w, 6)]
        board = {"position": to_three(loc), "quaternion": q, "size": [1.6, 1.1], "face": 0.0228, "polaroids": {}}
        for o in bpy.data.objects:
            m = re.match(r"^dyn_polaroid_([A-Z])$", o.name)
            if not m or o.type != "EMPTY":
                continue
            local = root.matrix_world.inverted() @ o.matrix_world
            pos = local.to_translation()
            board["polaroids"][m.group(1)] = {
                "local": [round(pos.y, 4), round(pos.z, 4)],  # across, up on the board
                "tilt": round(local.to_euler().x, 4),
            }
    # evidence table bags in order (evidence_room.py drops a marker on each)
    spots = sorted((o for o in bpy.data.objects if o.name.startswith("evid_spot_bag_")), key=lambda o: o.name)
    table = {"bags": [{"position": to_three(o.matrix_world.translation), "yaw": round(o.matrix_world.to_euler().z, 4),
                       "tool": o.get("tool", "")} for o in spots]}
    # where the browser prints the bag panels, tags and log (the bake keeps the paper blank)
    table["decals"] = []
    for o in sorted((o for o in bpy.data.objects if o.name.startswith("evid_decal_")), key=lambda o: o.name):
        loc, rot, _ = o.matrix_world.decompose()
        table["decals"].append({"kind": o["kind"], "index": o["index"], "position": to_three(loc),
                                "quaternion": [round(rot.x, 6), round(rot.z, 6), round(-rot.y, 6), round(rot.w, 6)],
                                "size": [round(v, 4) for v in o["size"]]})
    # interrogation room: one-way mirror + the paper the browser prints on
    def pose(o):
        loc, rot, _ = o.matrix_world.decompose()
        return {"position": to_three(loc), "quaternion": [round(rot.x, 6), round(rot.z, 6), round(-rot.y, 6), round(rot.w, 6)],
                "size": [round(v, 4) for v in o["size"]]}
    interrogation = {o.name.removeprefix("interro_").removeprefix("decal_"): pose(o) for o in bpy.data.objects
                     if o.name.startswith(("interro_mirror", "interro_decal_"))}
    follow = {o.name: o["case_follow"] for o in bpy.data.objects if "case_follow" in o}
    # real pivots of the moving pieces (three coords). meshopt quantization moves node origins,
    # the browser puts them back (restorePivots in geometry.ts)
    pivots = {}
    for o in bpy.data.objects:
        if o.type == "MESH" and (o.name.startswith("dyn_") or "case_follow" in o):
            loc, rot, _ = o.matrix_world.decompose()
            pivots[o.name] = {"position": to_three(loc), "quaternion": [round(rot.x, 6), round(rot.z, 6), round(-rot.y, 6), round(rot.w, 6)]}
    special = {o.name: o["case_special"] for o in bpy.data.objects if "case_special" in o}
    manifest = {"groups": groups, "lights": lights, "highlights": highlights, "board": board, "table": table,
                "interrogation": interrogation, "follow": follow,
                "special": special,
                "pivots": pivots,
                "units": "metres, three.js Y-up (blender x, z, -y)"}
    with open(os.path.join(OUT, "scene.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"[export] scene.json: {len(groups)} groups, {len(lights)} live lights")


main()
