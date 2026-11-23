"""Office furniture: procedural desk, filing cabinet, coat rack + fedora, evidence board, and the
poly haven pieces (chairs, credenza, fan, clock, frames, books, plant).
"""
import json
import math
import os
import random

import bmesh
import bpy
from mathutils import Vector

import materials as M
from lib.common import (REPO, adopt, append_model, bevel, bounds, box, collection, curve_tube, cylinder,
                        empty, floor_origin, lathe, mesh_object, parent, place, plane, text, to_mesh,
                        world_uvs)
from procedural import office_shell as shell

CONTENT = json.load(open(os.path.join(REPO, "blender", "content.json"), encoding="utf-8"))
DESK = dict(x=2.4, y=2.4, w=1.6, d=0.8, top=0.75)
rng = random.Random(7)


def build(root):
    col = collection("office_furniture", root)
    oak = M.scanned("black_oak_veneer", tile=1.2, val=0.9, coat=0.35, rough_mult=0.8, name="black_oak", dust=0.25)
    blk = M.powder_coat()
    desk(col, oak, blk)
    filing_cabinet(col)
    coat_rack(col)
    evidence_board(col)
    polyhaven_pieces(col)
    return col


# ---------------------------------------------------------------- desk

def desk(col, oak, blk):
    x, y, w, d, top = DESK["x"], DESK["y"], DESK["w"], DESK["d"], DESK["top"]
    t = 0.04
    parts = [box("static_desk_top", (w, d, t), (x, y, top - t / 2), col, oak, bevel_w=0.004)]
    # pedestal on the left (drawers face the chair), slim steel legs on the right (reference 01)
    px = x - w / 2 + 0.23
    parts.append(box("static_desk_pedestal", (0.44, d - 0.06, top - t), (px, y, (top - t) / 2), col, oak, bevel_w=0.003))
    for i, (z0, z1) in enumerate(((0.47, 0.70), (0.25, 0.465), (0.02, 0.245))):
        parts.append(box(f"static_desk_drawer_{i}", (0.42, 0.012, z1 - z0 - 0.004),
                         (px, y + (d - 0.06) / 2 + 0.006, (z0 + z1) / 2), col, oak, bevel_w=0.002))
        parts.append(box(f"static_desk_pull_{i}", (0.14, 0.012, 0.008), (px, y + (d - 0.06) / 2 + 0.016, z1 - 0.03),
                         col, blk, bevel_w=0.002))
    lx = x + w / 2 - 0.06
    for yy in (y - d / 2 + 0.05, y + d / 2 - 0.05):
        parts.append(box(f"static_desk_leg_{yy:.2f}", (0.03, 0.03, top - t), (lx, yy, (top - t) / 2), col, blk, bevel_w=0.002))
    parts.append(box("static_desk_rail", (0.03, d - 0.1, 0.03), (lx, y, top - t - 0.015), col, blk, bevel_w=0.002))
    parts.append(box("static_desk_apron", (w - 0.5, 0.02, 0.06), (x + 0.2, y - d / 2 + 0.06, top - t - 0.03), col, blk, bevel_w=0.002))
    for p in parts:
        world_uvs(p, 1.2)


# ---------------------------------------------------------------- filing cabinet

def filing_cabinet(col):
    steel = M.powder_coat("cabinet_paint", (0.045, 0.05, 0.048), 0.36)
    chrome = M.chrome()
    brass = M.brass()
    card = M.paper("label_card", (0.78, 0.74, 0.64))
    ink = M.principled("typed_ink", (0.02, 0.02, 0.025), 0.6)
    w, dpt, h = 0.47, 0.62, 1.32
    cx, cy = dpt / 2 + 0.01, shell.D - 0.04 - w / 2
    box("static_cabinet_body", (dpt, w, h), (cx, cy, h / 2), col, steel, bevel_w=0.004)
    labels = ["A – G", "CLOSED CASES", "RÉSUMÉ", "MISC."]
    face_x = dpt + 0.01
    for i, label in enumerate(labels):
        z0 = h - 0.03 - (i + 1) * 0.315
        zc = z0 + 0.155
        resume = label == "RÉSUMÉ"
        name = "dyn_cabinet_drawer_resume" if resume else f"static_cabinet_drawer_{i}"
        box(name, (0.016, w - 0.03, 0.3), (face_x + 0.008, cy, zc), col, steel, bevel_w=0.004)
        box(f"static_cabinet_handle_{i}", (0.02, 0.16, 0.018), (face_x + 0.03, cy, zc - 0.03), col, chrome, bevel_w=0.004)
        for s in (-1, 1):
            box(f"static_cabinet_handle_post_{i}_{s}", (0.02, 0.01, 0.012), (face_x + 0.02, cy + s * 0.075, zc - 0.03), col, chrome, bevel_w=0.002)
        box(f"static_cabinet_labelframe_{i}", (0.004, 0.1, 0.035), (face_x + 0.018, cy, zc + 0.06), col, brass, bevel_w=0.001)
        box(f"static_cabinet_labelcard_{i}", (0.002, 0.092, 0.027), (face_x + 0.0205, cy, zc + 0.06), col, card, bevel_w=0)
        t = text(f"static_cabinet_label_{i}", label, "SpecialElite-Regular.ttf", 0.0115 if len(label) < 8 else 0.0085,
                 col, ink, extrude=0.0002)
        t.location = (face_x + 0.0224, cy, zc + 0.06)
        t.rotation_euler = (math.radians(90), 0, math.radians(90))
    return cx, cy, h


# ---------------------------------------------------------------- coat rack + fedora

def coat_rack(col):
    wood = M.scanned("black_oak_veneer", tile=0.5, val=1.6, sat=1.4, hue=0.52, coat=0.6, name="bentwood")
    x, y = 1.85, 0.32
    h = 1.82
    cylinder("static_coatrack_pole", 0.019, h, (x, y, h / 2), col, wood, verts=24)
    lathe("static_coatrack_finial", [(0.0, 0.0), (0.024, 0.0), (0.03, 0.02), (0.024, 0.045), (0.0, 0.055)], col, wood,
          loc=(x, y, h - 0.005))
    for i in range(3):
        a = math.radians(30 + i * 120)
        foot = Vector((math.cos(a), math.sin(a), 0))
        pts = [Vector((x, y, 0.42)) + foot * 0.0, Vector((x, y, 0.2)) + foot * 0.12, Vector((x, y, 0.03)) + foot * 0.3,
               Vector((x, y, 0.012)) + foot * 0.34]
        curve_tube(f"static_coatrack_leg_{i}", [tuple(p) for p in pts], 0.012, col, wood)
    for i in range(4):
        a = math.radians(i * 90 + 15)
        dvec = Vector((math.cos(a), math.sin(a), 0))
        base = Vector((x, y, h - 0.12))
        pts = [base, base + dvec * 0.09 + Vector((0, 0, 0.03)), base + dvec * 0.16 + Vector((0, 0, 0.0)),
               base + dvec * 0.18 + Vector((0, 0, -0.05)), base + dvec * 0.15 + Vector((0, 0, -0.07))]
        curve_tube(f"static_coatrack_hook_{i}", [tuple(p) for p in pts], 0.008, col, wood)
    # fedora on the hook facing the room
    a = math.radians(15)
    hook_tip = Vector((x, y, h - 0.12)) + Vector((math.cos(a), math.sin(a), 0)) * 0.17
    fedora(col, (hook_tip.x, hook_tip.y, hook_tip.z - 0.03), tilt=(math.radians(18), math.radians(-8), math.radians(40)))


def fedora(col, loc, tilt):
    felt = M.felt()
    band = M.principled("fedora_band", (0.012, 0.008, 0.006), 0.45, Sheen_Weight=0.4)
    root = empty("dyn_fedora", loc, col, rot=tilt)
    # crown: a lathe, then pinched at the front and creased on top
    crown = lathe("dyn_fedora_crown",
                  [(0.0, 0.118), (0.03, 0.12), (0.06, 0.118), (0.078, 0.108), (0.088, 0.08), (0.092, 0.045),
                   (0.094, 0.0)], col, felt, segments=72)
    for v in crown.data.vertices:
        r = math.hypot(v.co.x, v.co.y)
        a = math.atan2(v.co.y, v.co.x)
        v.co.x *= 1.12  # oval, longer front to back
        if v.co.z > 0.07:
            crease = max(0.0, 1 - abs(v.co.x) / 0.07) * 0.035 * min(1, (v.co.z - 0.07) / 0.05)
            v.co.z -= crease * max(0.0, 1 - abs(v.co.y) / 0.05) ** 0.5
            pinch = max(0.0, math.cos(a)) ** 3 * 0.014 * (v.co.z - 0.07) / 0.05
            v.co.y *= 1 - pinch / max(r, 1e-3)
    sol = crown.modifiers.new("thick", "SOLIDIFY")
    sol.thickness = 0.003
    crown.modifiers.new("sub", "SUBSURF").levels = 1
    brim = lathe("dyn_fedora_brim", [(0.094, 0.0), (0.12, 0.002), (0.15, 0.008), (0.165, 0.016)], col, felt, segments=72)
    for v in brim.data.vertices:
        v.co.x *= 1.1
        # snap brim, down at the front and back, up at the sides
        a = math.atan2(v.co.y, v.co.x)
        r = math.hypot(v.co.x, v.co.y)
        v.co.z += (r - 0.094) * (0.5 * math.sin(a) ** 2 - 0.35 * max(0.0, math.cos(a)) ** 2)
    sb = brim.modifiers.new("thick", "SOLIDIFY")
    sb.thickness = 0.003
    brim.modifiers.new("sub", "SUBSURF").levels = 1
    b = lathe("dyn_fedora_band", [(0.0945, 0.0), (0.0945, 0.028)], col, band, segments=72)
    for v in b.data.vertices:
        v.co.x *= 1.12
    sbb = b.modifiers.new("thick", "SOLIDIFY")
    sbb.thickness = 0.0015
    adopt([crown, brim, b], root)
    return root


# ---------------------------------------------------------------- evidence board

def evidence_board(col):
    """cork board on the left wall. the browser rebuilds it live, here it just dresses the room with
    the real exhibits from content/case.ts
    """
    cork = M.cork()
    frame_m = M.scanned("black_oak_veneer", tile=0.8, val=1.0, coat=0.3, name="board_frame")
    W, H = 1.6, 1.1
    # built in a local frame (board face towards local +X), then turned to face the room from the
    # back wall between the filing cabinet and the shelves
    board_root = empty("static_evidence_board", (1.6, shell.D - 0.014, 1.6), col, rot=(0, 0, math.radians(-90)))
    first = set(col.objects)
    cx, cy, cz = 0.0, 0.0, 0.0
    face = 0.0228  # cork surface is at x=0.022
    box("static_board_cork", (0.02, W, H), (0.012, cy, cz), col, cork, bevel_w=0.002)
    for name, size, loc in (
        ("top", (0.035, W + 0.06, 0.03), (0.018, cy, cz + H / 2 + 0.015)),
        ("bottom", (0.035, W + 0.06, 0.03), (0.018, cy, cz - H / 2 - 0.015)),
        ("left", (0.035, 0.03, H), (0.018, cy - W / 2 - 0.015, cz)),
        ("right", (0.035, 0.03, H), (0.018, cy + W / 2 + 0.015, cz)),
    ):
        world_uvs(box(f"static_board_frame_{name}", size, loc, col, frame_m, bevel_w=0.003), 0.8)

    exhibits = CONTENT["exhibits"]
    n = len(exhibits)
    cols_n = math.ceil(math.sqrt(n * W / H))
    rows_n = math.ceil(n / cols_n)
    pin_m = M.principled("map_pin_red", (0.45, 0.012, 0.015), 0.22, Coat_Weight=1.0, Coat_Roughness=0.05)
    needle_m = M.chrome()
    white = M.paper("polaroid_frame", (0.86, 0.85, 0.80), 0.6)
    pins = {}
    for i, ex in enumerate(exhibits):
        r, c = divmod(i, cols_n)
        u = (c + 0.5) / cols_n - 0.5
        v = 0.5 - (r + 0.5) / rows_n
        if r == rows_n - 1:  # centre a short last row
            left = n - r * cols_n
            u = (c + 0.5 - left / 2) / cols_n
        py = cy + u * (W - 0.32) + rng.uniform(-0.05, 0.05)
        pz = cz + v * (H - 0.32) + rng.uniform(-0.04, 0.04)
        rot = math.radians(rng.uniform(-7, 7))
        photo = os.path.join(REPO, "public", ex["photo"].lstrip("/"))
        pol = empty(f"dyn_polaroid_{ex['id']}", (face, py, pz), col, rot=(rot, 0, 0))
        # real polaroid proportions, printed ~1.6x so you can read them on the board
        s = 1.6
        fw, fh, img = 0.088 * s, 0.107 * s, 0.079 * s
        frame = box(f"dyn_polaroid_{ex['id']}_frame", (0.0008, fw, fh), (0, 0, 0), col, white, bevel_w=0)
        pic = plane(f"dyn_polaroid_{ex['id']}_photo", (img, img), (0.0006, 0, (fh - fw) / 2 - 0.0005), col,
                    M.image_paper(f"photo_{ex['slug']}", photo) if os.path.exists(photo) else white,
                    rot=(math.radians(90), 0, math.radians(90)))
        _photo_uvs(pic, photo)
        adopt([frame, pic], pol)
        pin_pos = Vector((face + 0.012, py, pz + fh / 2 - 0.012))
        pin = lathe(f"static_pin_{ex['id']}", [(0.0, 0.0), (0.0065, 0.002), (0.0072, 0.008), (0.005, 0.013), (0.0, 0.014)],
                    col, pin_m, loc=tuple(pin_pos), rot=(0, math.radians(90), 0))
        cylinder(f"static_pin_{ex['id']}_needle", 0.0006, 0.02, tuple(pin_pos - Vector((0.008, 0, 0))), col, needle_m,
                 rot=(0, math.radians(90), 0), verts=8, bevel_w=0)
        pins[ex["id"]] = pin_pos

    yarn = M.principled("red_yarn", (0.38, 0.01, 0.012), 0.8, Sheen_Weight=0.5)
    for c in CONTENT["connections"]:
        a, b = pins.get(c["from"]), pins.get(c["to"])
        if a is None or b is None:
            continue
        pts = []
        for k in range(13):
            t = k / 12
            p = a.lerp(b, t)
            sag = 0.045 * (a - b).length * 4 * t * (1 - t)
            pts.append((p.x + 0.004, p.y, p.z - sag))
        curve_tube(f"static_string_{c['from']}{c['to']}", pts, 0.0011, col, yarn, resolution=6)

    ink = M.principled("typed_ink", (0.02, 0.02, 0.025), 0.6)
    card = M.paper("index_card", (0.80, 0.78, 0.70))
    t = text("static_board_title", f"CASE No. {CONTENT['caseNumber']}", "SpecialElite-Regular.ttf", 0.045, col, ink,
             extrude=0.0002)
    t.location = (face + 0.001, cy - W / 2 + 0.25, cz + H / 2 - 0.06)
    t.rotation_euler = (math.radians(90), 0, math.radians(90))
    box("static_board_titlecard", (0.0008, 0.38, 0.07), (face - 0.0005, cy - W / 2 + 0.25, cz + H / 2 - 0.06), col, card, bevel_w=0)
    adopt([o for o in col.objects if o not in first and o.parent is None and o is not board_root], board_root)


def _photo_uvs(obj, path):
    """square crop the photo into the polaroid window (centre crop, any aspect)"""
    if not os.path.exists(path):
        return
    img = bpy.data.images.load(path, check_existing=True)
    w, h = img.size
    aspect = w / h if h else 1
    me = obj.data
    uv = me.uv_layers.active or me.uv_layers.new()
    for loop in me.loops:
        u, v = uv.data[loop.index].uv
        if aspect > 1:
            u = 0.5 + (u - 0.5) / aspect
        else:
            v = 0.5 + (v - 0.5) * aspect
        uv.data[loop.index].uv = (u, v)


# ---------------------------------------------------------------- poly haven set dressing

def polyhaven_pieces(col):
    D = shell.D
    objs = append_model("mid_century_lounge_chair", col)
    place(objs, "static_desk_chair", (2.5, 3.15, 0), col, rot=(0, 0, math.radians(-8)), origin=floor_origin(objs))

    objs = append_model("modern_arm_chair_01", col)
    place(objs, "static_reading_chair", (4.2, 1.05, 0), col, rot=(0, 0, math.radians(-126)), origin=floor_origin(objs))

    objs = append_model("modern_wooden_cabinet", col)
    place(objs, "static_credenza", (3.9, D - 0.215, 0), col, scale=0.78, origin=floor_origin(objs))

    objs = append_model("ceiling_fan", col)
    lo, hi = bounds(objs)
    fan = place(objs, "dyn_ceiling_fan", (2.5, 1.95, shell.H), col, origin=Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, hi.z)))
    for o in objs:
        if o.name.startswith("ceiling_fan_blades"):
            o.name = "dyn_ceiling_fan_blades"
            o.rotation_euler.z = math.radians(23)

    objs = append_model("wall_clock", col)
    place(objs, "dyn_wall_clock", (2.66, D - 0.03, 2.42), col)

    objs = append_model("hanging_picture_frame_02", col)
    place(objs, "static_frame_front", (3.3, 0.03, 1.75), col, rot=(0, 0, math.radians(180)))

    objs = append_model("potted_plant_02", col)
    place(objs, "static_floor_plant", (4.72, 0.38, 0), col, origin=floor_origin(objs))

    # shelves: books, frame, binder, multimeter
    z0, z1, z2 = 1.32 + 0.0225, 1.74 + 0.0225, 2.16 + 0.0225
    books = append_model("decorative_book_set_01", col)
    groups = {0: [], 1: [], 2: []}
    for o in books:
        lo, hi = bounds([o])
        xc = (lo.x + hi.x) / 2
        if xc < 0.75:
            groups[0].append(o)
        elif 1.0 < xc < 1.65:
            groups[1].append(o)
        elif 1.9 < xc < 2.45:
            groups[2].append(o)
        else:
            bpy.data.objects.remove(o)
    shelf_spots = {0: ((3.05, D - 0.16, z0), 0), 1: ((3.95, D - 0.16, z1), 1), 2: ((3.2, D - 0.16, z2), 2)}
    for k, objs in groups.items():
        if not objs:
            continue
        lo, hi = bounds(objs)
        origin = Vector((lo.x, (lo.y + hi.y) / 2, lo.z))
        place(objs, f"static_books_{k}", shelf_spots[k][0], col, origin=origin)

    objs = append_model("standing_picture_frame_01", col)
    place(objs, "static_shelf_frame", (4.45, D - 0.16, z0), col, rot=(0, 0, math.radians(-12)), origin=floor_origin(objs))
    objs = append_model("binder_notebook", col, names=["binder_notebook_closed"])
    place(objs, "static_shelf_binder", (4.5, D - 0.17, z2), col, rot=(0, 0, math.radians(4)), origin=floor_origin(objs))
    objs = append_model("retro_multimeter", col)
    place(objs, "static_shelf_multimeter", (3.45, D - 0.15, z1), col, rot=(0, 0, math.radians(-10)), origin=floor_origin(objs))
    objs = append_model("potted_plant_04", col)
    place(objs, "static_shelf_succulent", (4.6, D - 0.15, z1), col, origin=floor_origin(objs))
