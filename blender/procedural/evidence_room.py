"""Scene E - the evidence room, "Tools found at the scene".

A windowless store room well away from the office (x 0-4.2, y 30-33.6, 3.1m ceiling, the camera
cuts here from the evidence board): painted block walls, worn painted concrete floor, archive
shelves in the dark, a CCTV camera in the corner and a steel table under one hard industrial lamp.
On the table there's one clear evidence bag per entry in `content.tools`, each with something
that stands for the skill, its item number on the bag's print panel, a yellow numbered marker
next to it and a manila tag with the tool typed and the confidence handwritten.
"""
import math
import random
import re

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

import materials as M
from lib.common import (adopt, append_model, bounds, box, collection, curve_tube, cylinder, empty, floor_origin,
                        lathe, mesh_object, place, plane, rest_on, text, world_uvs)
from procedural.furniture import CONTENT

X0, X1 = 0.0, 4.2
Y0, Y1 = 30.0, 33.6
H = 3.1
T = 0.14
TABLE = Vector((2.1, 31.75))
TABLE_W, TABLE_D = 2.0, 0.9
TOP = 0.92
DOOR = (30.45, 31.35, 2.05)  # left wall (x = 0): y from, y to, height
TYPED = "SpecialElite-Regular.ttf"
HAND = "Caveat.ttf"
BAG = (0.26, 0.33)  # x, y
rng = random.Random(2316)


def build(root):
    col = collection("evidence_build", root)
    m = {
        "floor": M.scanned("concrete_floor_painted", tile=2.2, val=0.8, sat=0.55, rough_mult=0.85, macro=0.25,
                           name="evidence_floor", dust=0.2),
        "block": M.scanned("concrete_block_wall", tile=2.4, val=0.95, sat=0.35, hue=0.52, tint=(0.62, 0.68, 0.64),
                           macro=0.22, name="evidence_block"),
        "ceiling": M.scanned("concrete_floor_painted", tile=3.0, val=0.75, sat=0.2, name="evidence_ceiling"),
        "cove": M.rubber("evidence_cove", (0.035, 0.036, 0.034)),
        "door": M.powder_coat("evidence_door", (0.16, 0.19, 0.17), 0.5),
        "frame": M.powder_coat("evidence_door_frame", (0.05, 0.055, 0.05), 0.45),
        # constant roughness - any variation ends up as 4x4 texel compression blocks in the (1024) ORM
        # atlas and the lamp reflection across the top shows every single one
        "steel": M.principled("stainless_table", (0.62, 0.63, 0.64), 0.3, 1.0),
        "chrome": M.chrome(),
        "paper": M.paper("evidence_paper", (0.84, 0.82, 0.76)),
        "manila": M.manila(),
        "ink": M.principled("evidence_typed_ink", (0.02, 0.02, 0.025), 0.6),
        "pencil": M.principled("evidence_hand_ink", (0.03, 0.035, 0.07), 0.55),
        "red": M.principled("evidence_red_print", (0.45, 0.02, 0.03), 0.5),
        "yellow": M.plastic("marker_yellow", (0.78, 0.55, 0.02), 0.45),
        "black": M.plastic("marker_black", (0.015, 0.015, 0.015), 0.5),
        "string": M.principled("tag_string", (0.62, 0.58, 0.5), 0.9),
        "ring": M.principled("tag_ring", (0.55, 0.5, 0.4), 0.7),
        "bag": M.plastic_bag(),
        "print": M.paper("bag_print", (0.9, 0.9, 0.88), 0.45),
        "white": M.plastic("scale_white", (0.8, 0.8, 0.78), 0.55),
        "grey": M.plastic("scale_grey", (0.32, 0.32, 0.32), 0.6),
    }
    shell_(col, m)
    door_(col, m)
    shelves_(col)
    cctv_(col)
    table_(col, m)
    lamp_(col)
    clipboard_(col, m)
    ruler_(col, m)
    bags = [bag_(col, m, i, tool) for i, tool in enumerate(CONTENT["tools"])]
    return {"bags": bags}


# ---------------------------------------------------------------- room

def shell_(col, m):
    W, D = X1 - X0, Y1 - Y0
    cx, cy = (X0 + X1) / 2, (Y0 + Y1) / 2
    fl = plane("static_evid_floor", (W, D), (cx, cy, 0), col, m["floor"], subdiv=6)
    world_uvs(fl, 2.2)
    # slab and roof keep the room light tight for cycles, export.py drops the slab's top face
    box("static_evid_slab", (W + 2 * T, D + 2 * T, 0.2), (cx, cy, -0.1), col, m["cove"], bevel_w=0)
    ceil = box("static_evid_ceiling", (W + 2 * T, D + 2 * T, 0.14), (cx, cy, H + 0.07), col, m["ceiling"], bevel_w=0)
    world_uvs(ceil, 3.0)
    d0, d1, dh = DOOR
    walls = [
        ("left_a", (T, d0 - Y0 + T, H), (X0 - T / 2, (Y0 - T + d0) / 2, H / 2)),
        ("left_b", (T, Y1 + T - d1, H), (X0 - T / 2, (d1 + Y1 + T) / 2, H / 2)),
        ("left_top", (T, d1 - d0, H - dh), (X0 - T / 2, (d0 + d1) / 2, (H + dh) / 2)),
        ("right", (T, D + 2 * T, H), (X1 + T / 2, cy, H / 2)),
        ("front", (W, T, H), (cx, Y0 - T / 2, H / 2)),
        ("back", (W, T, H), (cx, Y1 + T / 2, H / 2)),
    ]
    for name, size, loc in walls:
        world_uvs(box(f"static_evid_wall_{name}", size, loc, col, m["block"], bevel_w=0), 2.4)
    # rubber cove base along the walls (not across the door)
    for name, size, loc in (("left_a", (0.012, d0 - Y0, 0.1), (X0 + 0.006, (Y0 + d0) / 2, 0.05)),
                            ("left_b", (0.012, Y1 - d1, 0.1), (X0 + 0.006, (d1 + Y1) / 2, 0.05)),
                            ("right", (0.012, D, 0.1), (X1 - 0.006, cy, 0.05)),
                            ("front", (W, 0.012, 0.1), (cx, Y0 + 0.006, 0.05)),
                            ("back", (W, 0.012, 0.1), (cx, Y1 - 0.006, 0.05))):
        box(f"static_evid_cove_{name}", size, loc, col, m["cove"], bevel_w=0.002)


def door_(col, m, door=DOOR, prefix="evid"):
    """steel door on the left wall (x = 0) with an EXIT sign over it (only colour in the room apart
    from red). shared with the interrogation room
    """
    d0, d1, dh = door
    cy = (d0 + d1) / 2
    jamb = 0.05
    parts = [box(f"static_{prefix}_door_jamb_a", (0.16, jamb, dh + jamb), (0.0, d0 + jamb / 2, (dh + jamb) / 2), col, m["frame"]),
             box(f"static_{prefix}_door_jamb_b", (0.16, jamb, dh + jamb), (0.0, d1 - jamb / 2, (dh + jamb) / 2), col, m["frame"]),
             box(f"static_{prefix}_door_head", (0.16, d1 - d0, jamb), (0.0, cy, dh + jamb / 2), col, m["frame"])]
    leaf = box(f"static_{prefix}_door_leaf", (0.045, d1 - d0 - 2 * jamb - 0.006, dh - 0.01), (0.0, cy, (dh - 0.01) / 2 + 0.008),
               col, m["door"], bevel_w=0.004)
    kick = box(f"static_{prefix}_door_kick", (0.004, d1 - d0 - 2 * jamb - 0.04, 0.25), (0.025, cy, 0.14), col,
               M.brushed_metal("kick_plate", (0.5, 0.5, 0.5), 0.32), bevel_w=0.001)
    rose = cylinder(f"static_{prefix}_door_rose", 0.03, 0.012, (0.03, d1 - 0.16, 1.02), col, m["chrome"],
                    rot=(0, math.radians(90), 0), verts=32)
    lever = box(f"static_{prefix}_door_lever", (0.02, 0.13, 0.018), (0.05, d1 - 0.21, 1.02), col, m["chrome"], bevel_w=0.006)
    parts += [leaf, kick, rose, lever]
    sign = box(f"static_{prefix}_exit_box", (0.035, 0.32, 0.13), (0.02, cy, dh + 0.22), col,
               M.powder_coat("exit_box", (0.6, 0.6, 0.58), 0.4), bevel_w=0.004)
    panel = box(f"fx_{prefix}_exit_panel", (0.002, 0.29, 0.1), (0.039, cy, dh + 0.22), col, M.emission("exit_glow", (0.15, 1.0, 0.35), 6.0),
                bevel_w=0)
    word = text(f"static_{prefix}_exit_word", "EXIT", TYPED, 0.07, col, M.principled("exit_letters", (0.01, 0.03, 0.015), 0.5))
    word.location = (0.0405, cy, dh + 0.215)
    word.rotation_euler = (math.radians(90), 0, math.radians(90))
    return parts + [sign, panel, word]


def shelves_(col):
    """archive shelves along the back wall, mostly dark, case boxes with typed labels"""
    label_mat = M.paper("box_label", (0.86, 0.85, 0.8))
    ink = M.principled("box_label_ink", (0.03, 0.03, 0.035), 0.6)
    levels = [0.47, 0.98, 1.49]
    n = 0
    for i, x in enumerate((0.72, 1.87, 3.02)):
        objs = append_model("steel_frame_shelves_01", col)
        place(objs, f"static_evid_shelves_{i}", (x, Y1 - 0.27, 0), col, origin=floor_origin(objs))
        for z in levels:
            for dx in (-0.27, 0.27):
                if rng.random() < 0.25:
                    continue
                objs = append_model("cardboard_box_01", col)
                root = place(objs, f"static_evid_box_{n}", (x + dx + rng.uniform(-0.03, 0.03), Y1 - 0.3, z), col,
                             rot=(0, 0, math.radians(90 + rng.uniform(-4, 4))), scale=0.88, origin=floor_origin(objs))
                rest_on(root, z)
                n += 1
                if n % 2:
                    continue
                # case number label on the front, facing the room (-y)
                lab = box(f"static_evid_box_label_{n}", (0.13, 0.001, 0.06), (x + dx, Y1 - 0.3 - 0.172, z + 0.17), col,
                          label_mat, bevel_w=0)
                t = text(f"static_evid_box_text_{n}", f"CASE {rng.randint(2100, 2310)}", TYPED, 0.022, col, ink, resolution=2)
                t.location = (x + dx, Y1 - 0.3 - 0.1732, z + 0.17)
                t.rotation_euler = (math.radians(90), 0, 0)


def cctv_(col, at=(X1 - 0.1, Y0 + 0.12, H - 0.33), yaw=135, prefix="evid"):
    """security camera up in a corner, its red LED blinks in the browser"""
    objs = append_model("security_camera_01", col, names=["security_camera_01"])
    for o in objs:
        for mod in list(o.modifiers):
            if mod.type == "ARMATURE":
                o.modifiers.remove(mod)
        o.parent = None
    root = place(objs, f"static_{prefix}_cctv", at, col, rot=(0, 0, math.radians(yaw)), origin=floor_origin(objs))
    # LED on the front of the camera, along its aim and up from the mount
    a = math.radians(yaw)
    led_at = (at[0] + 0.212 * math.cos(a), at[1] + 0.212 * math.sin(a), at[2] + 0.21)
    led = cylinder(f"fx_{prefix}_cctv_led", 0.004, 0.003, led_at, col, M.emission("cctv_led", (1.0, 0.04, 0.03), 18.0),
                   rot=(math.radians(90), 0, math.radians(yaw - 90)), verts=12, bevel_w=0)
    return root, led


# ---------------------------------------------------------------- the table

def table_(col, m):
    cx, cy = TABLE
    parts = [box("static_evid_table_top", (TABLE_W, TABLE_D, 0.035), (cx, cy, TOP - 0.0175), col, m["steel"], bevel_w=0.004)]
    lip = 0.018
    for name, size, loc in (("lip_f", (TABLE_W, 0.012, lip), (cx, cy - TABLE_D / 2 + 0.006, TOP + lip / 2)),
                            ("lip_b", (TABLE_W, 0.012, lip), (cx, cy + TABLE_D / 2 - 0.006, TOP + lip / 2)),
                            ("lip_l", (0.012, TABLE_D, lip), (cx - TABLE_W / 2 + 0.006, cy, TOP + lip / 2)),
                            ("lip_r", (0.012, TABLE_D, lip), (cx + TABLE_W / 2 - 0.006, cy, TOP + lip / 2))):
        parts.append(box(f"static_evid_table_{name}", size, loc, col, m["steel"], bevel_w=0.003))
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        x = cx + sx * (TABLE_W / 2 - 0.06)
        y = cy + sy * (TABLE_D / 2 - 0.06)
        parts.append(box(f"static_evid_table_leg_{i}", (0.04, 0.04, TOP - 0.035), (x, y, (TOP - 0.035) / 2), col, m["steel"],
                         bevel_w=0.003))
        parts.append(cylinder(f"static_evid_table_foot_{i}", 0.022, 0.012, (x, y, 0.006), col, m["cove"], verts=24))
    parts.append(box("static_evid_table_shelf", (TABLE_W - 0.1, TABLE_D - 0.1, 0.02), (cx, cy, 0.2), col, m["steel"], bevel_w=0.003))
    parts.append(box("static_evid_table_apron", (TABLE_W - 0.12, TABLE_D - 0.12, 0.08), (cx, cy, TOP - 0.075), col, m["steel"],
                     bevel_w=0.003))
    return parts


def lamp_(col):
    objs = append_model("hanging_industrial_lamp", col)
    place(objs, "static_evid_lamp", (TABLE.x, TABLE.y, H), col)
    for o in objs:
        o.visible_shadow = False  # its glass dome would swallow the bulb's light (cycles doesn't do caustics)
    bulb = lathe("fx_evid_lamp_bulb", [(0.0, 0.0), (0.03, 0.012), (0.034, 0.04), (0.016, 0.075), (0.014, 0.09)], col,
                 M.emission("evid_bulb", (1.0, 0.86, 0.68), 40.0), loc=(TABLE.x, TABLE.y, H - 1.32), segments=32)
    bulb.visible_shadow = False  # the lamp's spot sits inside it
    return bulb


def clipboard_(col, m):
    """evidence log on a clipboard at the left end of the table, one typed line per bag"""
    x, y = TABLE.x - TABLE_W / 2 + 0.17, TABLE.y + 0.18
    rot = math.radians(-8)
    objs = append_model("clipboard", col)
    root = place(objs, "static_evid_clipboard", (x, y, TOP), col, rot=(0, 0, rot), origin=floor_origin(objs))
    rest_on(root, TOP)
    z = TOP + 0.0075
    parts = [plane("static_evid_log_sheet", (0.21, 0.28), (0, -0.02, 0.0), col, m["paper"])]
    log = empty("static_evid_log", (x, y, z), col, rot=(0, 0, rot))
    _decal("log", 0, Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, "Z") @ Matrix.Translation((0, -0.02, 0.0004)),
           (0.21, 0.28), col)
    adopt(parts, log)
    return log


def ruler_(col, m):
    """L shaped forensic scale between the rows, grey with black/white cm blocks"""
    root = empty("static_evid_scale", (TABLE.x + 0.86, TABLE.y - 0.37, TOP), col, rot=(0, 0, math.radians(4)))
    grey, white = m["grey"], m["white"]
    parts = [box("static_evid_scale_a", (0.15, 0.025, 0.0015), (-0.075 + 0.0125, 0, 0.00075), col, grey, bevel_w=0),
             box("static_evid_scale_b", (0.025, 0.1, 0.0015), (0, 0.05 - 0.0125, 0.00075), col, grey, bevel_w=0)]
    for i in range(12):
        mat = m["black"] if i % 2 == 0 else white
        parts.append(box(f"static_evid_scale_tick_a{i}", (0.01, 0.008, 0.0003), (-0.005 - i * 0.01, -0.006, 0.0016), col, mat,
                         bevel_w=0))
    for i in range(8):
        mat = m["black"] if i % 2 == 0 else white
        parts.append(box(f"static_evid_scale_tick_b{i}", (0.008, 0.01, 0.0003), (0.006, 0.005 + i * 0.01, 0.0016), col, mat,
                         bevel_w=0))
    adopt(parts, root)
    return root


# ---------------------------------------------------------------- bags

def bag_spot(i, count):
    """two staggered rows along the table, front row gets the extra bag"""
    front = (count + 1) // 2
    row, k = (0, i) if i < front else (1, i - front)
    n = front if row == 0 else count - front
    pitch = 0.37
    x = TABLE.x + (k - (n - 1) / 2) * pitch
    y = TABLE.y - 0.17 if row == 0 else TABLE.y + 0.2
    return row, Vector((x + rng.uniform(-0.02, 0.02), y + rng.uniform(-0.015, 0.015))), math.radians(rng.uniform(-7, 7))


def _decal(kind, index, matrix, size, col):
    """where the browser lays the printed text (EvidenceRoom.tsx). the bake keeps paper blank since small
    text bakes blurry and costs tens of thousands of triangles. not parented because the bake joins
    the bag's hierarchy away
    """
    e = bpy.data.objects.new(f"evid_decal_{kind}_{index:02d}", None)
    e.matrix_world = matrix
    e["kind"] = kind
    e["index"] = index
    e["size"] = list(size)
    col.objects.link(e)
    return e


def _smooth(a, b, v):
    t = min(max((v - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def _sheet(name, size, centre, col, mat, lift, drape, segs=(20, 8)):
    """thin printed layer that follows the bag film (`lift` above it)"""
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=segs[0], y_segments=segs[1], size=0.5)
    for v in bm.verts:
        x, y = centre[0] + v.co.x * size[0], centre[1] + v.co.y * size[1]
        v.co = (x, y, drape(x, y) + lift)
    return mesh_object(name, bm, col, mat, smooth=True)


def bag_(col, m, i, tool):
    count = len(CONTENT["tools"])
    row, spot, rot = bag_spot(i, count)
    root = empty(f"static_evid_bag_{i:02d}", (spot.x, spot.y, TOP), col, rot=(0, 0, rot))
    # the bake joins the bag's parts, this marker survives for export.py (camera path, captions)
    where = empty(f"evid_spot_bag_{i:02d}", (spot.x, spot.y, TOP), col, rot=(0, 0, rot))
    where["tool"] = tool["name"]
    bx, by = BAG
    # contents sit towards the sealed end, away from the print panel
    holder = empty(f"static_evid_bag_{i:02d}_contents", (0, 0.045, 0), col)
    stuff, height = contents_(col, m, i, tool["name"])
    adopt(stuff, holder)
    bpy.context.view_layer.update()
    lo, hi = bounds([o for o in holder.children_recursive if o.type == "MESH"])
    lo.x, lo.y, hi.x, hi.y = max(lo.x, -bx / 2 + 0.02), max(lo.y, -by / 2 + 0.02), min(hi.x, bx / 2 - 0.02), min(hi.y, by / 2 - 0.02)
    seed = Vector((i * 7.3, 0, 0))
    pc = (0.0, -by / 2 + 0.075)

    def drape(x, y):
        """the film: tented over the contents, flat on the table elsewhere, sealed at the edges"""
        dx = max(lo.x - x, 0.0, x - hi.x)
        dy = max(lo.y - y, 0.0, y - hi.y)
        tent = (height + 0.0015) * (1 - _smooth(0.0, 0.045, math.hypot(dx, dy)))
        edge = _smooth(0.0, 0.02, min(x + bx / 2, bx / 2 - x, y + by / 2, by / 2 - y))
        # flat under the print panel so the printed text sits on it cleanly
        calm = 0.15 if abs(x) < 0.108 and abs(y - pc[1]) < 0.048 else 1.0
        wrinkle = 0.0012 * calm * noise.noise(Vector((x * 55, y * 55, 0)) + seed)
        return 0.0005 + (tent + 0.0022 + wrinkle) * edge

    # the bag, one clear sheet over everything (the bottom one is hidden by the table)
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=36, y_segments=44, size=0.5)
    for v in bm.verts:
        x, y = v.co.x * bx, v.co.y * by
        v.co = (x, y, drape(x, y))
    # static_* so the bake collects it with the table and marks it as glass (its material transmits)
    bag = mesh_object(f"static_evid_bag_film_{i:02d}", bm, col, m["bag"], smooth=True)
    bag.modifiers.new("thin", "SOLIDIFY").thickness = 0.0004
    bag.visible_shadow = False
    # printed panel (white, red header) near the open end, red seal strip at the other.
    # panel and header side by side, never stacked - paper under paper bakes black and the
    # denoiser smears that into the sheet on top
    panel = _sheet(f"static_evid_bag_panel_{i:02d}", (0.2, 0.0665), (0.0, -by / 2 + 0.06575), col, m["print"], 0.0005, drape,
                   (30, 12))
    head = _sheet(f"static_evid_bag_head_{i:02d}", (0.2, 0.018), (0.0, -by / 2 + 0.108), col, m["red"], 0.0005, drape, (30, 4))
    seal = _sheet(f"static_evid_bag_seal_{i:02d}", (bx - 0.012, 0.022), (0.0, by / 2 - 0.02), col, m["red"], 0.0005, drape,
                  (50, 4))
    # the browser draws the printing just above the highest point of the panel and header
    top = max(drape(pc[0] + u * 0.1, pc[1] + v * 0.0425) for u in (-1, -0.5, 0, 0.5, 1) for v in (-1, -0.5, 0, 0.5, 1))
    frame = Matrix.Translation((spot.x, spot.y, TOP)) @ Matrix.Rotation(rot, 4, "Z")
    _decal("panel", i, frame @ Matrix.Translation((pc[0], pc[1], top + 0.0012)), (0.2, 0.085), col)
    parts = [holder, bag, panel, head, seal]
    parts += marker_(col, m, i, Vector((-BAG[0] / 2 - 0.045, -BAG[1] / 2 + 0.04)))
    parts += tag_(col, m, i, tool, row, frame)
    adopt(parts, root)
    return root


def marker_(col, m, i, at):
    """yellow A-frame evidence marker with the item number on both sides"""
    w, h = 0.055, 0.05
    lean = math.radians(28)
    parts = []
    for side in (-1, 1):
        face = box(f"static_evid_marker_{i:02d}_{'ab'[side > 0]}", (w, 0.002, h), (at.x, at.y + side * math.sin(lean) * h / 2,
                   math.cos(lean) * h / 2), col, m["yellow"], rot=(side * lean, 0, 0), bevel_w=0.001)
        num = text(f"static_evid_marker_{i:02d}_num_{'ab'[side > 0]}", str(i + 1), TYPED, 0.032, col, m["black"], resolution=2)
        # text faces +Z with +Y up, turn it onto the face (normal n, up towards the apex)
        n = Vector((0, side * math.cos(lean), math.sin(lean)))
        up = Vector((0, -side * math.sin(lean), math.cos(lean)))
        right = up.cross(n)
        num.rotation_euler = Matrix((right, up, n)).transposed().to_euler()
        num.location = Vector((at.x, at.y + side * math.sin(lean) * h / 2, math.cos(lean) * h / 2)) + n * 0.0012
        parts += [face, num]
    return parts


def tag_(col, m, i, tool, row, frame):
    """manila tag tied to the bag corner, lying in front of the front row (behind the back row).
    tool typed, confidence handwritten
    """
    w, d = 0.105, 0.052
    side = -1 if row == 0 else 1
    cx = -0.03 + rng.uniform(-0.01, 0.01)
    cy = side * (BAG[1] / 2 + 0.042)
    tag_rot = math.radians(rng.uniform(-9, 9))
    holder = empty(f"static_evid_tag_{i:02d}", (cx, cy, 0.0006), col, rot=(0, 0, tag_rot))
    parts = [box(f"static_evid_tag_card_{i:02d}", (w, d, 0.0005), (0, 0, 0), col, m["manila"], bevel_w=0),
             cylinder(f"static_evid_tag_ring_{i:02d}", 0.0055, 0.0006, (-w / 2 + 0.009, 0, 0.0002), col, m["ring"], verts=20,
                      bevel_w=0)]
    adopt(parts, holder)
    # tool typed + confidence handwritten, drawn by the browser from content
    _decal("tag", i, frame @ Matrix.Translation((cx, cy, 0.0006)) @ Matrix.Rotation(tag_rot, 4, "Z")
           @ Matrix.Translation((0, 0, 0.0012)), (w, d), col)
    # string from the tag's eyelet to the closest corner grommet on the bag
    c, s_ = math.cos(tag_rot), math.sin(tag_rot)
    ex, ey = cx + c * (-w / 2 + 0.009), cy + s_ * (-w / 2 + 0.009)
    gx, gy = -BAG[0] / 2 + 0.014, side * (BAG[1] / 2 - 0.014)
    mid = ((ex + gx) / 2 - 0.012, (ey + gy) / 2)
    string = curve_tube(f"static_evid_tag_string_{i:02d}", [(gx, gy, 0.004), (mid[0], mid[1], 0.0009), (ex, ey, 0.0009)],
                        0.0006, col, m["string"])
    return [holder, string]


# ---------------------------------------------------------------- what's in each bag

def contents_(col, m, i, name):
    """something that stands for the skill. returns (parts, height) in bag local metres"""
    key = name.lower()
    methods = lambda col, m, i: printout_(col, m, i, title="OLS / GRANGER / CHOW")  # noqa: E731
    for pattern, fn in ((r"next", usb_), (r"three", lattice_), (r"gsap", watch_), (r"blender", suzanne_),
                        (r"esp32|arduino", devboard_), (r"ardupilot|mavlink", flight_controller_), (r"slam", lidar_),
                        (r"tensorrt|pytorch", compute_), (r"python|pandas", methods), (r"llm|inference", printout_),
                        (r"prompt", cards_), (r"figma", wireframe_), (r"fpga", fpga_)):
        if re.search(pattern, key):
            return fn(col, m, i)
    return printout_(col, m, i, title=name.upper())


def usb_(col, m, i):
    alu = M.brushed_metal("usb_alu", (0.55, 0.56, 0.6), 0.3)
    p = f"static_evid_c{i:02d}"
    parts = [box(f"{p}_body", (0.058, 0.019, 0.0085), (0.0, 0.02, 0.0043), col, alu, rot=(0, 0, 0.5), bevel_w=0.003),
             box(f"{p}_plug", (0.013, 0.012, 0.0045), (0.034 * math.cos(0.5), 0.02 + 0.034 * math.sin(0.5), 0.0043), col, M.chrome(),
                 rot=(0, 0, 0.5), bevel_w=0.0005),
             box(f"{p}_cap", (0.02, 0.021, 0.01), (-0.06, -0.04, 0.005), col, M.plastic("usb_cap", (0.02, 0.02, 0.025), 0.35),
                 rot=(0, 0, -0.9), bevel_w=0.003)]
    return parts, 0.011


def lattice_(col, m, i):
    """3D printed wireframe icosahedron, the first mesh anyone renders"""
    pla = M.plastic("pla_white", (0.78, 0.78, 0.76), 0.55)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.034)
    bm.faces.ensure_lookup_table()
    down = bm.faces[0].normal.rotation_difference(Vector((0, 0, -1))).to_matrix()  # rest on a face
    vs = [down @ v.co for v in bm.verts]
    es = [(down @ e.verts[0].co, down @ e.verts[1].co) for e in bm.edges]
    bm.free()
    low = min(v.z for v in vs)
    out = bmesh.new()
    for a, b in es:
        d = b - a
        geom = bmesh.ops.create_cone(out, cap_ends=True, segments=8, radius1=0.0016, radius2=0.0016, depth=d.length)
        q = d.to_track_quat("Z", "Y")
        bmesh.ops.rotate(out, verts=geom["verts"], cent=(0, 0, 0), matrix=q.to_matrix())
        bmesh.ops.translate(out, verts=geom["verts"], vec=(a + b) / 2 - Vector((0, 0, low)))
    for v in vs:
        geom = bmesh.ops.create_icosphere(out, subdivisions=1, radius=0.0028)
        bmesh.ops.translate(out, verts=geom["verts"], vec=v - Vector((0, 0, low)))
    obj = mesh_object(f"static_evid_c{i:02d}_lattice", out, col, pla, smooth=True)
    obj.rotation_euler.z = 0.6
    return [obj], 0.06


def watch_(col, m, i):
    objs = append_model("digital_wrist_watch", col)
    root = place(objs, f"static_evid_c{i:02d}_watch", (0, 0, 0), col, rot=(0, 0, math.radians(35)), origin=floor_origin(objs))
    return [root], 0.012


def flight_controller_(col, m, i):
    """flight controller in its aluminium case, a cable and a spare prop"""
    p = f"static_evid_c{i:02d}"
    case = M.brushed_metal("fc_case", (0.16, 0.17, 0.2), 0.35)
    parts = [box(f"{p}_case", (0.05, 0.05, 0.014), (-0.03, 0.035, 0.007), col, case, bevel_w=0.004),
             box(f"{p}_label", (0.03, 0.012, 0.0003), (-0.03, 0.035, 0.0142), col, M.paper("fc_label", (0.75, 0.75, 0.72), 0.5),
                 bevel_w=0)]
    for k in range(6):
        parts.append(box(f"{p}_port_{k}", (0.006, 0.004, 0.004), (-0.05 + k * 0.008, 0.0095, 0.006), col, M.plastic("jst", (0.9, 0.9, 0.86), 0.5),
                         bevel_w=0))
    parts.append(curve_tube(f"{p}_cable", [(-0.03, 0.009, 0.003), (-0.01, -0.02, 0.003), (0.03, -0.01, 0.003), (0.06, -0.05, 0.003)],
                            0.0018, col, M.rubber("fc_cable", (0.06, 0.02, 0.02))))
    prop = M.plastic("prop_spare", (0.02, 0.02, 0.022), 0.35)
    hub = cylinder(f"{p}_prop_hub", 0.007, 0.008, (0.035, 0.07, 0.004), col, prop, verts=24)
    for side in (-1, 1):
        blade = box(f"{p}_prop_{'ab'[side > 0]}", (0.06, 0.012, 0.0018), (0.035 + side * 0.034, 0.07, 0.0035), col, prop,
                    rot=(side * 0.18, 0, 0), bevel_w=0.0008)
        parts.append(blade)
    parts.append(hub)
    return parts, 0.015


def lidar_(col, m, i):
    """2D LiDAR puck: matte base, turret with a dark window band"""
    p = f"static_evid_c{i:02d}"
    body = M.plastic("lidar_body", (0.035, 0.035, 0.04), 0.4)
    window = M.principled("lidar_window", (0.01, 0.01, 0.012), 0.08, Coat_Weight=1.0, Coat_Roughness=0.03)
    parts = [box(f"{p}_base", (0.07, 0.07, 0.014), (0, 0, 0.007), col, body, bevel_w=0.005),
             cylinder(f"{p}_turret", 0.032, 0.022, (0, 0, 0.025), col, body, verts=48),
             cylinder(f"{p}_window", 0.0322, 0.012, (0, 0, 0.026), col, window, verts=48, bevel_w=0),
             cylinder(f"{p}_cap", 0.03, 0.005, (0, 0, 0.0385), col, body, verts=48),
             curve_tube(f"{p}_lead", [(0.034, 0.0, 0.004), (0.06, 0.03, 0.003), (0.08, 0.09, 0.003)], 0.0015, col,
                        M.rubber("lidar_lead", (0.02, 0.02, 0.02)))]
    return parts, 0.041


def compute_(col, m, i):
    objs = append_model("circuit_board", col)
    root = place(objs, f"static_evid_c{i:02d}_board", (0, 0, 0), col, rot=(0, 0, math.radians(8)), scale=0.4,
                 origin=floor_origin(objs))
    return [root], 0.032


def printout_(col, m, i, title="INFERENCE PROFILE"):
    """folded printout with an unlabelled curve on a grid (no made up numbers)"""
    p = f"static_evid_c{i:02d}"
    sheet = plane(f"{p}_sheet", (0.2, 0.15), (0, 0, 0.0012), col, m["paper"], rot=(0, 0, math.radians(-6)))
    fold = plane(f"{p}_fold", (0.2, 0.15), (0, 0, 0.0004), col, m["paper"], rot=(0, 0, math.radians(-5)))
    parts = [sheet, fold]
    ink = m["ink"]
    root = empty(f"{p}_print", (0, 0, 0.0016), col, rot=(0, 0, math.radians(-6)))
    lines = [box(f"{p}_axis_x", (0.15, 0.0008, 0.0002), (0.0, -0.045, 0), col, ink, bevel_w=0),
             box(f"{p}_axis_y", (0.0008, 0.09, 0.0002), (-0.075, 0.0, 0), col, ink, bevel_w=0)]
    pts = [(-0.075 + k * 0.015, -0.045 + 0.075 * (1 - math.exp(-k / 3.2)) + 0.004 * math.sin(k * 2.1), 0.0002) for k in range(11)]
    lines.append(curve_tube(f"{p}_curve", pts, 0.0006, col, m["red"]))
    t = text(f"{p}_title", title, TYPED, 0.0075, col, ink, align="LEFT", resolution=2)
    t.location = (-0.085, 0.06, 0)
    lines.append(t)
    adopt(lines, root)
    return parts + [root], 0.003


def cards_(col, m, i):
    """index cards, top one handwritten: how I talk to models"""
    p = f"static_evid_c{i:02d}"
    card = M.paper("index_card", (0.88, 0.86, 0.8), 0.75)
    parts = []
    for k in range(3):
        parts.append(box(f"{p}_card_{k}", (0.127, 0.076, 0.0003), (0.004 * k, -0.006 * k, 0.0003 + k * 0.00035), col, card,
                         rot=(0, 0, math.radians(-8 + k * 6)), bevel_w=0))
    root = empty(f"{p}_notes", (0.008, -0.012, 0.0013), col, rot=(0, 0, math.radians(4)))
    notes = []
    for k, (body, y) in enumerate((("role, then the task", 0.022), ("show, don't tell: 2 examples", 0.004),
                                   ("say what NOT to do", -0.014))):
        t = text(f"{p}_line_{k}", body, HAND, 0.0095, col, m["pencil"], align="LEFT", resolution=2)
        t.location = (-0.056, y, 0)
        notes.append(t)
    adopt(notes, root)
    return parts + [root], 0.004


def suzanne_(col, m, i):
    """blender's monkey 3D printed in orange PLA, the first mesh every blender user meets. propped up
    and tilted back towards the camera so the face reads in the table shots
    """
    bm = bmesh.new()
    bmesh.ops.create_monkey(bm)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True, smooth=1.0)
    s = 0.065 / 2.73  # the monkey is 2.73 units across the ears
    bmesh.ops.scale(bm, vec=(s, s, s), verts=bm.verts)
    # faces -Y (camera side of the table), lean the face up 35 degrees
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(-35), 3, "X"))
    low = min(v.co.z for v in bm.verts)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, -low))
    top = max(v.co.z for v in bm.verts)
    pla = M.plastic("pla_orange", (0.72, 0.2, 0.04), 0.5)
    obj = mesh_object(f"static_evid_c{i:02d}_suzanne", bm, col, pla, smooth=True)
    obj.rotation_euler.z = math.radians(-12)
    return [obj], top


def devboard_(col, m, i):
    """ESP32 dev board with jumper wires still on the pins"""
    p = f"static_evid_c{i:02d}"
    can = M.brushed_metal("esp_can", (0.62, 0.63, 0.65), 0.3)
    black = M.plastic("header_black", (0.02, 0.02, 0.02), 0.45)
    parts = [box(f"{p}_pcb", (0.052, 0.028, 0.0016), (0, 0, 0.0034), col, M.pcb(), bevel_w=0.0003),
             box(f"{p}_module", (0.018, 0.0255, 0.0008), (0.015, 0, 0.0046), col, M.pcb("module_pcb"), bevel_w=0.0002),
             box(f"{p}_can", (0.0125, 0.017, 0.0024), (0.012, 0, 0.0062), col, can, bevel_w=0.0003),
             box(f"{p}_usb", (0.006, 0.008, 0.003), (-0.025, 0, 0.0057), col, can, bevel_w=0.0004)]
    for side in (-1, 1):
        parts.append(box(f"{p}_header_{'ab'[side > 0]}", (0.048, 0.0025, 0.0025), (0, side * 0.0125, 0.0013), col, black,
                         bevel_w=0.0002))
    # dupont jumpers plugged in along one edge, trailing across the table
    for k, (color, end) in enumerate((((0.55, 0.04, 0.03), (0.05, 0.075)), ((0.6, 0.48, 0.03), (0.075, 0.04)),
                                      ((0.04, 0.32, 0.08), (0.07, -0.02)))):
        x = -0.012 + k * 0.0076
        lead = M.rubber(f"jumper_{k}", color)
        parts.append(box(f"{p}_plug_{k}", (0.0026, 0.0026, 0.014), (x, 0.0125, 0.0092), col, black, bevel_w=0.0003))
        parts.append(curve_tube(f"{p}_jumper_{k}", [(x, 0.0125, 0.016), (x + 0.004, 0.03, 0.012), (end[0] * 0.6, end[1], 0.004),
                                                     (end[0], end[1] + 0.012, 0.0012)], 0.0007, col, lead))
    return parts, 0.017


def wireframe_(col, m, i):
    """index cards with a pencil wireframe of a phone screen, how a UI starts"""
    p = f"static_evid_c{i:02d}"
    card = M.paper("index_card", (0.88, 0.86, 0.8), 0.75)
    parts = [box(f"{p}_card_{k}", (0.127, 0.076, 0.0003), (0.005 * k, -0.007 * k, 0.0003 + k * 0.00035), col, card,
                 rot=(0, 0, math.radians(-6 + k * 7)), bevel_w=0) for k in range(2)]
    pencil = m["pencil"]
    root = empty(f"{p}_wire", (0.005, -0.007, 0.00095), col, rot=(0, 0, math.radians(1)))
    marks = []

    def stroke(name, x0, y0, x1, y1, w=0.0005):
        length = math.hypot(x1 - x0, y1 - y0)
        marks.append(box(f"{p}_{name}", (length, w, 0.00008), ((x0 + x1) / 2, (y0 + y1) / 2, 0), col, pencil,
                         rot=(0, 0, math.atan2(y1 - y0, x1 - x0)), bevel_w=0))

    def frame(name, x0, y0, x1, y1, w=0.0005):
        stroke(f"{name}_t", x0, y1, x1, y1, w)
        stroke(f"{name}_b", x0, y0, x1, y0, w)
        stroke(f"{name}_l", x0, y0, x0, y1, w)
        stroke(f"{name}_r", x1, y0, x1, y1, w)

    for n, cx in enumerate((-0.03, 0.012)):
        x0, x1, y0, y1 = cx - 0.016, cx + 0.016, -0.03, 0.03
        frame(f"phone{n}", x0, y0, x1, y1, 0.0007)
        stroke(f"bar{n}", x0 + 0.003, y1 - 0.006, x1 - 0.003, y1 - 0.006, 0.003)  # header bar
        frame(f"img{n}", x0 + 0.004, y1 - 0.026, x1 - 0.004, y1 - 0.011)  # picture slot, crossed
        stroke(f"x{n}a", x0 + 0.004, y1 - 0.026, x1 - 0.004, y1 - 0.011)
        stroke(f"x{n}b", x0 + 0.004, y1 - 0.011, x1 - 0.004, y1 - 0.026)
        for r in range(3):
            stroke(f"txt{n}_{r}", x0 + 0.004, y1 - 0.032 - r * 0.005, x1 - (0.004 if r < 2 else 0.012), y1 - 0.032 - r * 0.005)
        frame(f"btn{n}", x0 + 0.008, y0 + 0.004, x1 - 0.008, y0 + 0.009)
    stroke("flow", -0.013, 0.0, 0.0045, 0.0, 0.0006)  # tap: screen one to screen two
    stroke("flow_h1", 0.0045, 0.0, 0.0015, 0.002, 0.0006)
    stroke("flow_h2", 0.0045, 0.0, 0.0015, -0.002, 0.0006)
    t = text(f"{p}_note", "tap -> next", HAND, 0.008, col, pencil, align="LEFT", resolution=2)
    t.location = (0.034, 0.012, 0)
    marks.append(t)
    adopt(marks, root)
    return parts + [root], 0.004


def fpga_(col, m, i):
    """FPGA dev board: big chip, slide switches, LEDs, 7 segment digits, headers"""
    p = f"static_evid_c{i:02d}"
    pcb = M.principled("fpga_pcb", (0.02, 0.05, 0.12), 0.35, Coat_Weight=0.8, Coat_Roughness=0.15)
    chip = M.principled("fpga_chip", (0.03, 0.03, 0.032), 0.45)
    parts = [box(f"{p}_pcb", (0.13, 0.1, 0.0016), (0, 0, 0.004), col, pcb, bevel_w=0.0006),
             box(f"{p}_chip", (0.026, 0.026, 0.0025), (-0.01, 0.012, 0.0061), col, chip, bevel_w=0.0008),
             box(f"{p}_usb", (0.012, 0.009, 0.006), (0.058, 0.03, 0.0078), col, M.chrome(), bevel_w=0.0005),
             box(f"{p}_seg", (0.03, 0.012, 0.004), (0.035, 0.015, 0.0068), col, M.plastic("seg_dark", (0.03, 0.03, 0.03), 0.3),
                 bevel_w=0.0005),
             box(f"{p}_header_a", (0.1, 0.005, 0.008), (0, 0.044, 0.0088), col, M.plastic("header", (0.02, 0.02, 0.02), 0.45),
                 bevel_w=0.0004),
             box(f"{p}_header_b", (0.1, 0.005, 0.008), (0, -0.044, 0.0088), col, M.plastic("header", (0.02, 0.02, 0.02), 0.45),
                 bevel_w=0.0004)]
    for k in range(8):
        x = -0.045 + k * 0.009
        parts.append(box(f"{p}_sw_{k}", (0.006, 0.01, 0.004), (x, -0.028, 0.0068), col, M.plastic("switch_body", (0.85, 0.85, 0.82), 0.5),
                         bevel_w=0.0004))
        parts.append(box(f"{p}_sw_knob_{k}", (0.0025, 0.003, 0.003), (x, -0.025 if k % 3 else -0.031, 0.0095), col,
                         M.plastic("switch_knob", (0.03, 0.03, 0.03), 0.4), bevel_w=0))
        parts.append(box(f"{p}_led_{k}", (0.002, 0.0012, 0.001), (x, -0.016, 0.0053), col, M.plastic("led_red", (0.5, 0.03, 0.02), 0.2),
                         bevel_w=0))
    for k in range(4):
        parts.append(cylinder(f"{p}_standoff_{k}", 0.0025, 0.004, ((-0.06, 0.06)[k % 2], (-0.045, 0.045)[k // 2], 0.002), col, M.chrome(),
                              verts=12, bevel_w=0))
    return parts, 0.013
