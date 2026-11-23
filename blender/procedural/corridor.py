"""Scene A - the corridor of an old Bengaluru office building, ending at my door.

Corridor x 0-1.8, y -8 to -0.14 (the corridor face of the office front wall), 3.0m ceiling.
oil painted dado under a wooden chair rail, dirty whitewash above, terrazzo floor.
"""
import math
import random

import bpy
from mathutils import Vector

import materials as M
from lib.common import (adopt, append_model, box, collection, cylinder, empty, floor_origin, lathe, place,
                        plane, rest_on, text, world_uvs)
from procedural import office_shell as shell

X0, X1 = 0.0, 1.8
Y0, Y1 = -8.0, -shell.T
H = 3.0
T = 0.14
DADO = 1.1
rng = random.Random(1983)


def build(root):
    col = collection("corridor_build", root)
    m = {
        "floor": M.scanned("terrazzo_tiles", tile=1.4, val=0.55, sat=0.7, rough_mult=0.75, macro=0.3,
                           name="corridor_terrazzo", dust=0.35),
        "dado": M.scanned("peeling_painted_wall", tile=1.6, val=0.42, sat=0.9, hue=0.5, tint=(0.55, 0.75, 0.68),
                          macro=0.25, name="corridor_dado", disp=0.004),
        "plaster": M.scanned("damaged_plaster", tile=2.0, val=0.75, sat=0.35, macro=0.3, name="corridor_plaster"),
        "rail": M.scanned("black_oak_veneer", tile=0.6, val=1.7, sat=1.5, hue=0.53, coat=0.4, name="chair_rail"),
        "skirting": M.powder_coat("corridor_skirting", (0.03, 0.035, 0.032), 0.5),
    }
    shell_(col, m)
    door = office_door(col)
    bulbs = hanging_bulbs(col)
    dressing(col, m)
    return {"bulbs": bulbs, "door": door}


def _walls_finish(col, m, name, size, loc, axis):
    """wall face split into dado (oil paint) and plaster, with chair rail and skirting"""
    sx, sy, sz = size
    x, y, z = loc
    lower = box(f"static_corr_{name}_dado", (sx, sy, DADO), (x, y, DADO / 2), col, m["dado"], bevel_w=0)
    upper = box(f"static_corr_{name}_plaster", (sx, sy, sz - DADO), (x, y, DADO + (sz - DADO) / 2), col, m["plaster"],
                bevel_w=0)
    world_uvs(lower, 1.6)
    world_uvs(upper, 2.0)
    pad = 0.025
    if axis == "y":
        rail = box(f"static_corr_{name}_rail", (sx, sy + pad * 2, 0.05), (x, y, DADO), col, m["rail"], bevel_w=0.006)
        skirt = box(f"static_corr_{name}_skirt", (sx, sy + pad, 0.12), (x, y, 0.06), col, m["skirting"], bevel_w=0.003)
    else:
        rail = box(f"static_corr_{name}_rail", (sx + pad * 2, sy, 0.05), (x, y, DADO), col, m["rail"], bevel_w=0.006)
        skirt = box(f"static_corr_{name}_skirt", (sx + pad, sy, 0.12), (x, y, 0.06), col, m["skirting"], bevel_w=0.003)
    world_uvs(rail, 0.6)


def shell_(col, m):
    L = Y1 - Y0
    fl = plane("static_corr_floor", (X1 - X0, L), ((X0 + X1) / 2, (Y0 + Y1) / 2, 0), col, m["floor"], subdiv=6)
    world_uvs(fl, 1.4)
    box("static_corr_slab", (X1 - X0 + 2 * T, L + 2 * T, 0.2), ((X0 + X1) / 2, (Y0 + Y1) / 2, -0.1), col, m["skirting"], bevel_w=0)
    ceil = box("static_corr_ceiling", (X1 - X0 + 2 * T, L + 2 * T, 0.12), ((X0 + X1) / 2, (Y0 + Y1) / 2, H + 0.06), col,
               m["plaster"], bevel_w=0)
    world_uvs(ceil, 2.0)
    _walls_finish(col, m, "left", (T, L, H), (X0 - T / 2, (Y0 + Y1) / 2, 0), "x")
    _walls_finish(col, m, "right", (T, L, H), (X1 + T / 2, (Y0 + Y1) / 2, 0), "x")
    _walls_finish(col, m, "far", (X1 - X0 + 2 * T, T, H), ((X0 + X1) / 2, Y0 - T / 2, 0), "y")
    # end wall around my door (corridor face of the office wall)
    d0, d1, dh = shell.DOOR
    skin_y = Y1 - 0.006
    for name, x0, x1 in (("end_l", X0, d0 - 0.08), ("end_r", d1 + 0.08, X1)):
        _walls_finish(col, m, name, (x1 - x0, 0.012, H), ((x0 + x1) / 2, skin_y, 0), "y")
    above = box("static_corr_end_top", (d1 - d0 + 0.16, 0.012, H - dh - 0.08), ((d0 + d1) / 2, skin_y, (H + dh + 0.08) / 2), col,
                m["plaster"], bevel_w=0)
    world_uvs(above, 2.0)


def office_door(col):
    """frosted glass door with reverse painted gold leaf lettering and brass fittings"""
    wood = M.scanned("plank_flooring_04", tile=1.2, val=0.55, sat=0.8, coat=0.5, rough_mult=0.8, name="door_varnished_wood",
                     dust=0.2)
    trim = M.scanned("plank_flooring_04", tile=1.2, val=0.45, sat=0.8, coat=0.4, name="door_trim_wood")
    brass = M.brass()
    frosted = M.frosted_glass()
    gold = M.gold_leaf()
    shade = M.principled("lettering_shade", (0.01, 0.009, 0.008), 0.35)
    d0, d1, dh = shell.DOOR
    yf = Y1 - 0.012  # corridor face of the architrave
    # architrave
    for name, size, loc in (("l", (0.08, 0.025, dh + 0.08), (d0 - 0.04, yf, (dh + 0.08) / 2)),
                            ("r", (0.08, 0.025, dh + 0.08), (d1 + 0.04, yf, (dh + 0.08) / 2)),
                            ("t", (d1 - d0 + 0.16, 0.025, 0.08), ((d0 + d1) / 2, yf, dh + 0.04))):
        world_uvs(box(f"static_door_architrave_{name}", size, loc, col, trim, bevel_w=0.006), 1.2)
    # door leaf (hinged on the left, opens into the office), built around the hinge empty
    leaf = empty("dyn_office_door", (d0 + 0.01, -0.085, 0), col)
    w = d1 - d0 - 0.02
    stile = 0.13
    gz0, gz1 = 1.1, 1.94
    parts = [
        box("dyn_door_lower", (w, 0.045, gz0 - 0.012), (w / 2, 0, 0.012 + (gz0 - 0.012) / 2), col, wood, bevel_w=0.004),
        box("dyn_door_stile_l", (stile, 0.045, gz1 - gz0), (stile / 2, 0, (gz0 + gz1) / 2), col, wood, bevel_w=0.004),
        box("dyn_door_stile_r", (stile, 0.045, gz1 - gz0), (w - stile / 2, 0, (gz0 + gz1) / 2), col, wood, bevel_w=0.004),
        box("dyn_door_top_rail", (w, 0.045, dh - 0.004 - gz1), (w / 2, 0, (gz1 + dh - 0.004) / 2), col, wood, bevel_w=0.004),
    ]
    # raised panels on the lower half, corridor side
    for i, (z0, z1) in enumerate(((0.28, 0.66), (0.72, 1.02))):
        parts.append(box(f"dyn_door_panel_{i}", (w - 0.24, 0.012, z1 - z0), (w / 2, -0.026, (z0 + z1) / 2), col, wood,
                         bevel_w=0.005))
    glass = box("dyn_door_glass", (w - 2 * stile + 0.02, 0.006, gz1 - gz0 + 0.02), (w / 2, 0.0, (gz0 + gz1) / 2), col, frosted,
                bevel_w=0)
    glass.visible_shadow = False
    parts.append(glass)
    # glazing beads
    for name, size, loc in (("b", (w - 2 * stile, 0.012, 0.018), (w / 2, -0.012, gz0 + 0.009)),
                            ("t", (w - 2 * stile, 0.012, 0.018), (w / 2, -0.012, gz1 - 0.009)),
                            ("l", (0.018, 0.012, gz1 - gz0), (stile + 0.009, -0.012, (gz0 + gz1) / 2)),
                            ("r", (0.018, 0.012, gz1 - gz0), (w - stile - 0.009, -0.012, (gz0 + gz1) / 2))):
        parts.append(box(f"dyn_door_bead_{name}", size, loc, col, trim, bevel_w=0.003))
    # gold leaf painted on the office side of the glass, read from the corridor
    cx = w / 2
    for i, (body, size, z) in enumerate((("AYAAN BAGAWAN", 0.06, gz0 + 0.56),
                                         ("ENGINEERING & INVESTIGATIONS", 0.031, gz0 + 0.465))):
        g = _lettering(col, f"dyn_door_lettering_{i}", body, size, gold, offset=0.0)
        g.location = (cx, 0.0034, z)
        s = _lettering(col, f"dyn_door_lettering_shade_{i}", body, size, shade, offset=size * 0.012)
        s.location = (cx + size * 0.015, 0.0038, z - size * 0.015)
        parts += [g, s]
    rule = box("dyn_door_lettering_rule", (0.36, 0.0004, 0.0016), (cx, 0.0034, gz0 + 0.51), col, gold, bevel_w=0)
    parts.append(rule)
    # brass on the corridor side: knob + rose, keyhole plate, kick plate
    kx = w - 0.07
    parts.append(lathe("dyn_door_rose", [(0.0, 0.0), (0.032, 0.0), (0.03, 0.004), (0.012, 0.012), (0.0, 0.012)], col, brass,
                       loc=(kx, -0.0225, 0.98), rot=(math.radians(90), 0, 0)))
    parts.append(lathe("dyn_door_knob", [(0.0, 0.0), (0.009, 0.0), (0.008, 0.035), (0.024, 0.045), (0.029, 0.062), (0.025, 0.075),
                                         (0.0, 0.08)], col, brass, loc=(kx, -0.0225, 0.98), rot=(math.radians(90), 0, 0)))
    parts.append(box("dyn_door_escutcheon", (0.026, 0.004, 0.06), (kx, -0.0245, 0.88), col, brass, bevel_w=0.003))
    parts.append(box("dyn_door_keyhole", (0.006, 0.002, 0.018), (kx, -0.0268, 0.88), col,
                     M.principled("keyhole_dark", (0.0, 0.0, 0.0), 0.9), bevel_w=0.001))
    parts.append(box("dyn_door_kickplate", (w - 0.04, 0.0025, 0.22), (w / 2, -0.024, 0.13), col, brass, bevel_w=0.002))
    for z in (0.3, 1.8):
        parts.append(cylinder(f"dyn_door_hinge_{z}", 0.007, 0.1, (-0.002, -0.022, z), col, brass, verts=16))
    adopt(parts, leaf)
    # room number plate next to the door
    plate = box("static_door_number_plate", (0.13, 0.006, 0.07), (d1 + 0.2, Y1 - 0.0155, 1.62), col, brass, bevel_w=0.004)
    num = text("static_door_number", "2316", "PlayfairDisplay.ttf", 0.045, col, M.principled("engraving", (0.02, 0.015, 0.01), 0.5),
               extrude=0.0003)
    num.location = (d1 + 0.2, Y1 - 0.019, 1.618)
    num.rotation_euler = (math.radians(90), 0, 0)
    return leaf


def _lettering(col, name, body, size, mat, offset):
    t = text(name, body, "PlayfairDisplay.ttf", size, col, mat, extrude=0.0, spacing=1.08)
    t.data.offset = offset
    t.rotation_euler = (math.radians(90), 0, 0)
    return t


def hanging_bulbs(col):
    """bare bulbs hanging from pull chain sockets. returns light positions for lighting.py"""
    cord = M.rubber("bulb_cord", (0.03, 0.025, 0.02))
    filament = M.emission("filament_glow", (1.0, 0.62, 0.3), 60)
    positions = []
    for i, y in enumerate((-2.0, -5.6)):
        drop = 0.42
        cylinder(f"static_corr_cord_{i}", 0.003, drop, (0.9, y, H - drop / 2), col, cord, verts=8, bevel_w=0)
        socket = append_model("pull_chain_light_socket", col)
        place(socket, f"static_corr_socket_{i}", (0.9, y, H - drop), col)
        bulb = append_model("lightbulb_01", col)
        root = place(bulb, f"dyn_corr_bulb_{i}", (0.9, y, H - drop - 0.165), col, rot=(math.pi, 0, 0))
        center = Vector((0.9, y, H - drop - 0.165 - 0.05))
        lathe(f"fx_corr_filament_{i}", [(0.0, 0.0), (0.004, 0.002), (0.004, 0.01), (0.0, 0.012)], col, filament,
              loc=tuple(center - Vector((0, 0, 0.006))))
        positions.append(tuple(center))
    return positions


def dressing(col, m):
    d0, d1, dh = shell.DOOR
    objs = append_model("fire_alarm", col)
    place(objs, "static_corr_fire_alarm", (X1 - 0.02, -1.35, 1.45), col, rot=(0, 0, math.radians(-90)))
    notice_board(col, (X0 + 0.008, -3.6, 1.55))
    fuse_box(col, (X1 - 0.062, -4.6, 1.9))
    side_door(col, -6.0)
    night_window(col, -4.9)
    for i, (y, z, r) in enumerate(((-6.9, 0.0, 8), (-7.1, 0.342, -12))):
        objs = append_model("cardboard_box_01", col)
        place(objs, f"static_corr_box_{i}", (X0 + 0.32, y, z), col, rot=(0, 0, math.radians(r)), origin=floor_origin(objs))
    # haze, corridor is dustier than the office
    bpy.ops.mesh.primitive_cube_add(size=1, location=((X0 + X1) / 2, (Y0 + Y1) / 2, H / 2))
    haze = bpy.context.active_object
    haze.name = "fx_corridor_haze"
    haze.scale = (X1 - X0 - 0.02, Y1 - Y0 - 0.02, H - 0.02)
    haze.data.materials.append(M.volume_haze(0.022, (0.85, 0.82, 0.78)))
    for c in list(haze.users_collection):
        c.objects.unlink(haze)
    col.objects.link(haze)
    haze.visible_shadow = False


def notice_board(col, loc):
    cork = M.cork()
    frame = M.scanned("black_oak_veneer", tile=0.5, val=1.6, sat=1.4, hue=0.53, name="notice_frame_wood")
    ink = M.principled("typed_ink", (0.02, 0.02, 0.025), 0.6)
    root = empty("static_corr_notice_board", loc, col, rot=(0, 0, math.radians(90)))
    parts = [box("static_notice_cork", (0.9, 0.015, 0.6), (0, -0.008, 0), col, cork, bevel_w=0.002)]
    for name, size, l in (("t", (0.94, 0.03, 0.02), (0, -0.012, 0.31)), ("b", (0.94, 0.03, 0.02), (0, -0.012, -0.31)),
                          ("l", (0.02, 0.03, 0.6), (-0.46, -0.012, 0)), ("r", (0.02, 0.03, 0.6), (0.46, -0.012, 0))):
        parts.append(box(f"static_notice_frame_{name}", size, l, col, frame, bevel_w=0.003))
    notices = [("ಸೂಚನೆ", "NotoSansKannada.ttf", (0.21, 0.28), (-0.28, 0.09), 0.045),
               ("LIFT UNDER REPAIR", "SpecialElite-Regular.ttf", (0.24, 0.17), (0.02, 0.15), 0.017),
               ("KEEP CORRIDOR CLEAN", "SpecialElite-Regular.ttf", (0.2, 0.26), (0.28, -0.08), 0.0135),
               ("ROOM 2316 →", "SpecialElite-Regular.ttf", (0.17, 0.11), (-0.05, -0.17), 0.019)]
    tones = [(0.80, 0.76, 0.64), (0.78, 0.72, 0.52), (0.82, 0.80, 0.72), (0.74, 0.70, 0.60)]
    for i, (body, font, size, (x, z), ts) in enumerate(notices):
        r = math.radians(rng.uniform(-4, 4))
        sheet = box(f"static_notice_{i}", (size[0], 0.0006, size[1]), (x, -0.017, z), col,
                    M.paper(f"notice_paper_{i}", tones[i], 0.85), rot=(0, r, 0), bevel_w=0)
        t = text(f"static_notice_{i}_text", body, font, ts, col, ink)
        t.location = (x, -0.0177, z + size[1] * 0.25)
        t.rotation_euler = (math.radians(90), r, 0)
        pin = cylinder(f"static_notice_pin_{i}", 0.005, 0.006, (x, -0.02, z + size[1] / 2 - 0.015), col,
                       M.principled(f"pin_{i}", rng.choice(((0.4, 0.02, 0.02), (0.02, 0.1, 0.4), (0.5, 0.4, 0.02))), 0.3),
                       rot=(math.radians(90), 0, 0), verts=16)
        parts += [sheet, t, pin]
    adopt(parts, root)


def fuse_box(col, loc):
    grey = M.powder_coat("fuse_box_paint", (0.16, 0.17, 0.165), 0.5)
    conduit = M.powder_coat("conduit", (0.2, 0.2, 0.19), 0.45)
    x, y, z = loc
    box("static_corr_fusebox", (0.12, 0.42, 0.55), (x, y, z), col, grey, bevel_w=0.006)
    box("static_corr_fusebox_door_seam", (0.004, 0.004, 0.5), (x - 0.062, y, z), col, M.principled("seam", (0.0, 0.0, 0.0), 0.9),
        bevel_w=0)
    box("static_corr_fusebox_label", (0.002, 0.12, 0.05), (x - 0.061, y, z + 0.17), col, M.principled("danger_label", (0.5, 0.35, 0.02), 0.5),
        bevel_w=0)
    for dy in (-0.12, 0.0, 0.12):
        cylinder(f"static_corr_conduit_{dy}", 0.012, H - (z + 0.275), (x + 0.02, y + dy, (H + z + 0.275) / 2), col, conduit, verts=16)


def night_window(col, y):
    """old window on the left wall, rainy night outside, the only cool light in the corridor"""
    wood = M.scanned("plank_flooring_04", tile=1.2, val=0.35, sat=0.6, coat=0.3, name="window_frame_wood")
    sky = M.emission("corridor_night_sky", (0.18, 0.26, 0.42), 0.12)
    x = X0 + 0.004
    z0, z1, w = 1.45, 2.55, 0.8
    box("fx_corr_window_sky", (0.004, w, z1 - z0), (x, y, (z0 + z1) / 2), col, sky, bevel_w=0)
    for name, size, l in (("l", (0.05, 0.06, z1 - z0 + 0.12), (x + 0.02, y - w / 2 - 0.03, (z0 + z1) / 2)),
                          ("r", (0.05, 0.06, z1 - z0 + 0.12), (x + 0.02, y + w / 2 + 0.03, (z0 + z1) / 2)),
                          ("t", (0.05, w + 0.12, 0.06), (x + 0.02, y, z1 + 0.03)),
                          ("sill", (0.1, w + 0.18, 0.04), (x + 0.04, y, z0 - 0.03)),
                          ("mv", (0.03, 0.03, z1 - z0), (x + 0.012, y, (z0 + z1) / 2)),
                          ("mh", (0.03, w, 0.03), (x + 0.012, y, (z0 + z1) / 2 + 0.12))):
        world_uvs(box(f"static_corr_window_{name}", size, l, col, wood, bevel_w=0.004), 1.2)
    g = box("fx_corr_window_glass", (0.004, w, z1 - z0), (x + 0.02, y, (z0 + z1) / 2), col, M.glass("corr_window_glass", 0.03),
            bevel_w=0)
    g.visible_shadow = False
    data = bpy.data.lights.new("bake_corridor_moon", "AREA")
    data.shape = "RECTANGLE"
    data.size, data.size_y = w, z1 - z0
    data.energy = 9
    data.use_temperature = True
    data.temperature = 7500
    light = bpy.data.objects.new("bake_corridor_moon", data)
    light.location = (x + 0.03, y, (z0 + z1) / 2)
    light.rotation_euler = (0, math.radians(-90), 0)  # emit +X, into the corridor
    light.visible_camera = False
    light.visible_transmission = False
    light.visible_glossy = False
    col.objects.link(light)


def side_door(col, y):
    wood = M.scanned("plank_flooring_04", tile=1.2, val=0.4, sat=0.7, coat=0.3, name="side_door_wood")
    brass = M.brass()
    x = X1 - 0.02
    box("static_corr_sidedoor", (0.04, 0.85, 2.05), (x, y, 1.025), col, wood, bevel_w=0.004)
    for name, size, l in (("l", (0.03, 0.07, 2.12), (x - 0.01, y - 0.46, 1.06)), ("r", (0.03, 0.07, 2.12), (x - 0.01, y + 0.46, 1.06)),
                          ("t", (0.03, 0.99, 0.07), (x - 0.01, y, 2.12))):
        world_uvs(box(f"static_corr_sidedoor_frame_{name}", size, l, col, wood, bevel_w=0.004), 1.2)
    lathe("static_corr_sidedoor_knob", [(0.0, 0.0), (0.008, 0.0), (0.024, 0.04), (0.026, 0.055), (0.0, 0.06)], col, brass,
          loc=(x - 0.02, y - 0.33, 0.98), rot=(0, math.radians(-90), 0))
