"""Office room shell, modern noir: 5 x 4m, 3.2m ceiling.

Layout (blender Z-up, metres): x 0-5 left to right, y 0-4 front (door) to back, z up.
- front wall y=0: door at x 0.45-1.35 (corridor beyond, y<0)
- left wall x=0: evidence board, wall clock, filing cabinet in the back left corner
- back wall y=4: charcoal relief feature wall lit by a ceiling cove light, floating shelves
- right wall x=5: floor to ceiling steel window, venetian blinds, the street outside
"""
import math

import bmesh
import bpy
from mathutils import Vector

import materials as M
from lib.common import (bevel, box, collection, cylinder, empty, link, look_at, mesh_object, plane,
                        world_uvs, kelvin)

W, D, H = 5.0, 4.0, 3.2
T = 0.14  # wall thickness
HW = H + 0.32  # walls go past the ceiling so the cove slot is closed in
DOOR = (0.45, 1.35, 2.1)  # x0, x1, height
WIN = (0.7, 3.3, 2.98)  # y0, y1, top
COVE_Y = 3.8


def build(root):
    col = collection("office_shell", root)
    m = {
        "floor": M.scanned("laminate_floor_02", tile=2.0, val=0.3, sat=1.05, hue=0.49,
                           rough_mult=0.9, normal=0.6, macro=0.2, name="office_floor", dust=0.15),
        "plaster": M.scanned("plastered_wall_04", tile=2.5, val=0.42, sat=0.35, hue=0.5,
                             normal=0.8, macro=0.15, name="office_plaster"),
        "feature": M.scanned("plastered_stone_wall", tile=0.9, val=0.15, sat=0.08, normal=1.1,
                             disp=0.016, macro=0.2, name="office_feature_wall"),
        "ceiling": M.scanned("dark_wooden_planks", tile=2.2, val=0.8, sat=0.85, rotate=90,
                             macro=0.2, name="office_ceiling"),
        "black": M.powder_coat(),
        "rug": M.scanned("poly_wool_herringbone", tile=0.6, val=0.42, sat=0.3, normal=1.2,
                         disp=0.004, macro=0.12, name="office_rug"),
        "oak": M.scanned("black_oak_veneer", tile=1.2, val=0.9, coat=0.35, rough_mult=0.8,
                         name="black_oak", dust=0.25),
    }

    _floor(col, m)
    _walls(col, m)
    _feature_wall(col, m)
    _ceiling(col, m)
    _window(col, m)
    blinds(col, m)
    _shelves(col, m)
    _tracks(col, m)
    _rug(col, m)
    return col


def _floor(col, m):
    fl = plane("static_office_floor", (W, D), (W / 2, D / 2, 0), col, m["floor"], subdiv=8)
    world_uvs(fl, 2.0)
    # black 8cm skirting on every wall except across the door and window
    runs = [
        ((0, 0.03), (DOOR[0], 0.03)), ((DOOR[1], 0.03), (W, 0.03)),
        ((0.03, 0), (0.03, D)), ((0, D - 0.03), (W, D - 0.03)),
        ((W - 0.03, 0), (W - 0.03, WIN[0])), ((W - 0.03, WIN[1]), (W - 0.03, D)),
    ]
    for i, (a, b) in enumerate(runs):
        a, b = Vector((*a, 0)), Vector((*b, 0))
        size = (max(abs(b.x - a.x), 0.016), max(abs(b.y - a.y), 0.016), 0.08)
        box(f"static_skirting_{i}", size, ((a.x + b.x) / 2, (a.y + b.y) / 2, 0.04), col, m["black"],
            bevel_w=0.002)


def _walls(col, m):
    p = m["plaster"]
    pieces = [
        # front wall (y=0) around the door
        ("front_l", (DOOR[0], T, HW), (DOOR[0] / 2, -T / 2, HW / 2)),
        ("front_r", (W - DOOR[1] + T, T, HW), ((W + DOOR[1] + T) / 2, -T / 2, HW / 2)),
        ("front_top", (DOOR[1] - DOOR[0], T, HW - DOOR[2]), ((DOOR[0] + DOOR[1]) / 2, -T / 2, (HW + DOOR[2]) / 2)),
        # left wall
        ("left", (T, D + 2 * T + 0.03, HW), (-T / 2, (D + 0.03) / 2, HW / 2)),
        # right wall around the window
        ("right_front", (T, WIN[0] + T, HW), (W + T / 2, (WIN[0] - T) / 2, HW / 2)),
        ("right_back", (T, D + T + 0.03 - WIN[1], HW), (W + T / 2, (D + T + 0.03 + WIN[1]) / 2, HW / 2)),
        ("right_top", (T, WIN[1] - WIN[0], HW - WIN[2]), (W + T / 2, (WIN[0] + WIN[1]) / 2, (HW + WIN[2]) / 2)),
        # back wall structure (relief skin sits in front of it)
        ("back", (W + 2 * T, T, HW), (W / 2, D + T / 2 + 0.03, HW / 2)),
        # roof and slab close the box so no world light leaks through the seams
        ("roof", (W + 2 * T, D + 2 * T + 0.03, 0.12), (W / 2, (D + 0.03) / 2, HW + 0.06)),
        ("slab", (W + 2 * T, D + 2 * T + 0.03, 0.2), (W / 2, (D + 0.03) / 2, -0.1)),
    ]
    for name, size, loc in pieces:
        o = box(f"static_wall_{name}", size, loc, col, p, bevel_w=0)
        world_uvs(o, 2.5)


def _feature_wall(col, m):
    """charcoal relief wall, a dense grid displaced by the plastered stone height map"""
    o = plane("static_feature_wall", (W, H), (W / 2, D - 0.005, H / 2), col, m["feature"],
              rot=(math.radians(90), 0, 0), subdiv=360)
    o.data.polygons.foreach_set("use_smooth", [True] * len(o.data.polygons))
    # after the X rotation the plane faces -Y into the room, displacement pushes along that
    world_uvs(o, 0.9)


def _ceiling(col, m):
    c = plane("static_ceiling", (W, COVE_Y), (W / 2, COVE_Y / 2, H), col, m["ceiling"],
              rot=(math.radians(180), 0, 0), subdiv=4)
    world_uvs(c, 2.2)
    # cove: recessed black slot along the feature wall, the grazing light lives inside
    slot_d = D - COVE_Y
    box("static_cove_top", (W, slot_d, 0.02), (W / 2, COVE_Y + slot_d / 2, H + 0.16), col, m["black"], bevel_w=0)
    box("static_cove_lip", (W, 0.02, 0.17), (W / 2, COVE_Y, H + 0.075), col, m["black"], bevel_w=0.002)
    led = M.led_strip(30.0, 2700)
    box("fx_cove_led", (W - 0.1, 0.03, 0.006), (W / 2, COVE_Y + 0.05, H + 0.145), col, led, bevel_w=0)


def _window(col, m):
    """floor to ceiling black steel window, three panes and a transom"""
    blk = m["black"]
    x = W + 0.02
    y0, y1, top = WIN
    span = y1 - y0
    fw = 0.06
    box("static_window_sill", (0.22, span, 0.04), (W + 0.02, (y0 + y1) / 2, 0.02), col, blk, bevel_w=0.003)
    box("static_window_head", (0.12, span, fw), (x, (y0 + y1) / 2, top - fw / 2), col, blk)
    box("static_window_jamb_f", (0.12, fw, top), (x, y0 + fw / 2, top / 2), col, blk)
    box("static_window_jamb_b", (0.12, fw, top), (x, y1 - fw / 2, top / 2), col, blk)
    for i in (1, 2):
        y = y0 + span * i / 3
        box(f"static_window_mullion_{i}", (0.1, 0.045, top), (x, y, top / 2), col, blk)
    box("static_window_transom", (0.1, span, 0.045), (x, (y0 + y1) / 2, 2.35), col, blk)
    box("static_window_bottom", (0.1, span, 0.05), (x, (y0 + y1) / 2, 0.065), col, blk)
    glass = M.glass("window_glass", rough=0.02)
    g = box("fx_window_glass", (0.008, span - 0.04, top - 0.08), (x + 0.02, (y0 + y1) / 2, top / 2),
            col, glass, bevel_w=0)
    g.visible_shadow = False  # refractive glass would block the moonlight otherwise (no caustics)
    return g


def blinds(col, m, bent=17):
    """dark aluminium venetian blinds, half open, one slat bent"""
    alu = M.powder_coat("blind_slats", (0.035, 0.034, 0.032), 0.35)
    y0, y1, top = WIN
    width = y1 - y0 - 0.12
    yc = (y0 + y1) / 2
    x = W - 0.07
    bottom = 0.95
    pitch = 0.046
    n = int((top - 0.12 - bottom) / pitch)
    slat_mesh = _slat_mesh(width)
    kinked = _slat_mesh(width, kink_at=0.18, kink=0.016)
    slat_mesh.materials.append(alu)
    kinked.materials.append(alu)
    root = empty("static_blinds", (x, yc, 0), col)
    tilt = math.radians(-28)  # inner edge down so moonlight from above slips between the slats
    for i in range(n):
        z = top - 0.14 - i * pitch
        o = bpy.data.objects.new(f"static_blind_slat_{i:02d}", kinked if i == bent else slat_mesh)
        col.objects.link(o)
        o.parent = root
        o.location = (0, 0, z)
        o.rotation_euler = (0, tilt, 0)
        mod = o.modifiers.new("thick", "SOLIDIFY")
        mod.thickness = 0.0006
    # head rail, bottom rail, ladder cords
    box("static_blind_headrail", (0.06, width + 0.02, 0.05), (x, yc, top - 0.06), col, alu, bevel_w=0.004)
    box("static_blind_bottomrail", (0.055, width, 0.018), (x, yc, bottom - 0.03), col, alu, bevel_w=0.003)
    cord = M.principled("blind_cord", (0.06, 0.055, 0.05), 0.8)
    for yy in (-width * 0.38, 0.0, width * 0.38):
        for dx in (-0.024, 0.024):
            cylinder(f"static_blind_ladder_{yy:.2f}_{dx}", 0.0009, top - bottom, (x + dx, yc + yy, (top + bottom) / 2 - 0.05),
                     col, cord, verts=6, bevel_w=0)
    cylinder("static_blind_wand", 0.005, 0.9, (x - 0.04, y0 + 0.12, top - 0.55), col, alu, verts=12)
    return root


def _slat_mesh(width, kink_at=None, kink=0.0, segs=48):
    """one crowned 50mm slat, long along Y. kink presses a dent at kink_at (metres from centre) -
    the slat someone bent to peek through
    """
    prof = [(-0.025, 0.0), (-0.0125, 0.0018), (0.0, 0.0024), (0.0125, 0.0018), (0.025, 0.0)]
    bm = bmesh.new()
    rows = []
    for j in range(segs + 1):
        y = -width / 2 + width * j / segs
        dent = 0.0
        if kink_at is not None:
            d = abs(y - kink_at) / 0.09
            dent = -kink * max(0.0, 1 - d * d)
        rows.append([bm.verts.new((px * (1 - 0.6 * abs(dent) / max(kink, 1e-6)) if kink else px, y, pz + dent * (1 + px / 0.025)))
                     for px, pz in prof])
    for j in range(segs):
        for i in range(len(prof) - 1):
            bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
    me = bpy.data.meshes.new("blind_slat_kinked" if kink else "blind_slat")
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return me


def _shelves(col, m):
    """three black floating shelves with warm LED strips under them (reference 01/02)"""
    led = M.led_strip(18.0, 2700)
    x0, x1 = 2.95, 4.85
    for i, z in enumerate((1.32, 1.74, 2.16)):
        box(f"static_shelf_{i}", (x1 - x0, 0.3, 0.045), ((x0 + x1) / 2, D - 0.155, z), col, m["oak"], bevel_w=0.003)
        box(f"fx_shelf_led_{i}", (x1 - x0 - 0.06, 0.012, 0.004), ((x0 + x1) / 2, D - 0.04, z - 0.025), col, led, bevel_w=0)


def _tracks(col, m):
    """two black ceiling tracks with spot heads. returns head positions for lighting.py"""
    blk = m["black"]
    for i, y in enumerate((1.25, 2.85)):
        box(f"static_track_{i}", (3.6, 0.034, 0.034), (W / 2, y, H - 0.017), col, blk, bevel_w=0.004)


SPOTS = {
    # name: (head position, aim target)
    # head sits left of the fan so the beam clears the blades (fan shadows move in the browser)
    "desk": ((1.6, 1.25, 3.08), (2.3, 2.38, 0.78)),
    "board": ((1.6, 2.85, 3.08), (1.6, 3.98, 1.55)),
    "shelves": ((3.8, 2.85, 3.08), (3.9, 3.95, 1.6)),
    "door": ((1.0, 1.25, 3.08), (1.0, 0.1, 1.2)),
    "chair": ((3.9, 1.25, 3.08), (4.3, 1.1, 0.6)),
}


def spot_light_pos(name):
    """where the actual light goes - just in front of the lens, never inside the housing
    (a closed cylinder around the light would block it completely)
    """
    pos, target = SPOTS[name]
    return tuple(Vector(pos) + (Vector(target) - Vector(pos)).normalized() * 0.115)


def spot_heads(col):
    blk = bpy.data.materials.get("black_powder_coat") or M.powder_coat()
    lens = M.emission("spot_lens", kelvin(3000), 6.0)
    for name, (pos, target) in SPOTS.items():
        d = (Vector(target) - Vector(pos)).normalized()
        head = cylinder(f"static_spot_{name}", 0.032, 0.13, pos, col, blk, verts=32)
        look_at(head, target)
        head.location = Vector(pos) + d * 0.04
        disc = cylinder(f"fx_spot_{name}_lens", 0.025, 0.002, tuple(Vector(pos) + d * 0.106), col, lens, verts=32, bevel_w=0)
        look_at(disc, target)
        cylinder(f"static_spot_{name}_stem", 0.006, 0.08, (pos[0], pos[1], pos[2] + 0.06), col, blk, verts=12)


def _rug(col, m):
    r = plane("static_rug", (2.9, 2.1), (2.4, 2.35, 0.004), col, m["rug"], subdiv=4)
    world_uvs(r, 0.6)
    sol = r.modifiers.new("thick", "SOLIDIFY")
    sol.thickness = 0.008
    sol.offset = 1
    bevel(r, 0.003, 2)
