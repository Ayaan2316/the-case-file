"""Hero and desk props, procedural wherever poly haven has nothing that fits.

Every prop: origin at the bottom centre, front facing -Y (the visitor walks in from the door
at -Y). clickable/animated props are `dyn_*` roots so the browser can move them.
"""
import datetime
import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

import materials as M
from lib.common import (REPO, adopt, append_model, bevel, box, collection, curve_tube, cylinder,
                        empty, floor_origin, lathe, mesh_object, place, plane, rest_on, text, world_uvs)
from procedural.furniture import CONTENT, DESK

rng = random.Random(42)
TOP = DESK["top"]


def build(root):
    col = collection("office_props", root)
    mats = {
        "enamel": M.enamel("typewriter_enamel", (0.032, 0.031, 0.03), 0.22),
        "chrome": M.chrome(),
        "brass": M.brass(),
        "rubber": M.rubber(),
        "bakelite": M.bakelite(),
        "paper": M.paper(),
        "ink": M.principled("typed_ink", (0.02, 0.02, 0.025), 0.6),
        "red_ink": M.ink("stamp_ink_red", (0.40, 0.015, 0.02)),
        "manila": M.manila(),
        "steel": M.steel_tumbler(),
        "black": M.powder_coat(),
    }
    desk_pad(col)
    typewriter(col, mats, (2.02, 2.43, TOP), math.radians(14))
    rotary_phone(col, mats, (2.98, 2.56, TOP), math.radians(-22))
    bankers_lamp(col, mats, (1.78, 2.66, TOP), math.radians(8))
    case_folder(col, mats, (2.57, 2.27, TOP + 0.003), math.radians(-7), hero=True)
    for i in range(3):
        case_folder(col, mats, (2.36 + rng.uniform(-0.01, 0.01), 2.66, TOP + i * 0.004),
                    math.radians(4 + rng.uniform(-5, 5)), hero=False, idx=i)
    davara_tumbler(col, mats, (3.02, 2.16, TOP))
    esp32(col, mats, (2.86, 2.26, TOP), math.radians(30))
    soldering_station(col, mats, (3.08, 2.72, TOP), math.radians(-35))
    stamp_and_pad(col, mats, (2.78, 2.7, TOP))
    desk_calendar(col, mats, (3.1, 2.42, TOP), math.radians(-30))
    polyhaven_desk_items(col)
    drone_in_bag(col, mats, (0.32, 3.725, 1.32))
    radio(col, mats, (3.45, 3.80, 0.535), math.radians(-6))
    return col


# ---------------------------------------------------------------- desk pad

def desk_pad(col):
    leather = M.scanned("brown_leather", tile=0.5, val=0.35, sat=0.7, rough_mult=0.9, name="desk_pad_leather")
    pad = box("static_desk_pad", (0.64, 0.42, 0.003), (2.55, 2.3, TOP + 0.0015), col, leather, bevel_w=0.0012)
    world_uvs(pad, 0.5)


# ---------------------------------------------------------------- typewriter

def typewriter(col, m, loc, rot):
    root = empty("dyn_typewriter", loc, col, rot=(0, 0, rot))
    parts = []
    w = 0.31
    parts.append(box("dyn_typewriter_base", (w, 0.27, 0.045), (0, 0, 0.0285), col, m["enamel"], bevel_w=0.008))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(cylinder(f"dyn_typewriter_foot_{sx}{sy}", 0.012, 0.006, (sx * 0.13, sy * 0.11, 0.003), col,
                                  m["rubber"], verts=16))
    # rear tower that holds the segment and carriage
    parts.append(box("dyn_typewriter_tower", (w - 0.01, 0.11, 0.075), (0, 0.075, 0.085), col, m["enamel"], bevel_w=0.012))
    # sloped keyboard deck
    deck = box("dyn_typewriter_deck", (w - 0.02, 0.15, 0.012), (0, -0.055, 0.058), col, m["enamel"], bevel_w=0.004)
    deck.rotation_euler.x = math.radians(-14)
    parts.append(deck)
    # ribbon spool covers
    for sx in (-1, 1):
        parts.append(cylinder(f"dyn_typewriter_spool_{sx}", 0.032, 0.008, (sx * 0.095, 0.055, 0.126), col, m["enamel"],
                              verts=48, bevel_w=0.003))
        parts.append(cylinder(f"dyn_typewriter_spoolcap_{sx}", 0.012, 0.004, (sx * 0.095, 0.055, 0.132), col, m["chrome"],
                              verts=32))
    # typebar basket, a fan of thin bars you can see through the front opening
    for i in range(31):
        a = math.radians(-70 + i * 140 / 30)
        p0 = Vector((math.sin(a) * 0.075, 0.035 - math.cos(a) * 0.02, 0.07))
        p1 = Vector((math.sin(a) * 0.02, 0.06, 0.112))
        parts.append(curve_tube(f"dyn_typewriter_typebar_{i:02d}", [tuple(p0), tuple(p0.lerp(p1, 0.5) + Vector((0, 0, 0.006))),
                                                                     tuple(p1)], 0.0011, col, m["chrome"], resolution=4))
    # keys: four staggered rows plus a space bar
    key_cap = M.enamel("key_cap", (0.028, 0.027, 0.026), 0.2)
    legend = M.principled("key_legend", (0.75, 0.72, 0.62), 0.4)
    rows = [10, 11, 10, 9]
    for r, count in enumerate(rows):
        y = -0.115 + r * 0.025
        z = 0.068 + r * 0.0065
        x0 = -(count - 1) / 2 * 0.0235 + (r % 2) * 0.006
        for k in range(count):
            x = x0 + k * 0.0235
            parts.append(cylinder(f"dyn_typewriter_stem_{r}_{k}", 0.0016, 0.022, (x, y + 0.004, z - 0.006), col, m["chrome"],
                                  verts=8, bevel_w=0, rot=(math.radians(-20), 0, 0)))
            parts.append(cylinder(f"dyn_typewriter_key_{r}_{k}", 0.0085, 0.004, (x, y, z + 0.006), col, key_cap, verts=32,
                                  bevel_w=0.0012))
            parts.append(lathe(f"dyn_typewriter_keyring_{r}_{k}", [(0.0082, 0.0), (0.0094, 0.0), (0.0094, 0.0052),
                                                                    (0.0084, 0.0052)], col, m["chrome"], loc=(x, y, z + 0.0035),
                               segments=32))
            parts.append(cylinder(f"dyn_typewriter_legend_{r}_{k}", 0.0035, 0.0003, (x, y, z + 0.0082), col, legend, verts=16,
                                  bevel_w=0))
    parts.append(box("dyn_typewriter_spacebar", (0.15, 0.011, 0.006), (0, -0.142, 0.06), col, m["chrome"], bevel_w=0.002))
    # carriage: platen, knobs, rail, paper bail, return lever
    pz, py = 0.142, 0.1
    parts.append(cylinder("dyn_typewriter_platen", 0.019, 0.33, (0, py, pz), col, m["rubber"], rot=(0, math.radians(90), 0),
                          verts=48))
    for sx in (-1, 1):
        parts.append(lathe(f"dyn_typewriter_knob_{sx}", [(0.0, 0.0), (0.016, 0.0), (0.018, 0.004), (0.018, 0.016),
                                                          (0.014, 0.02), (0.0, 0.02)], col, m["bakelite"],
                           loc=(sx * 0.165, py, pz), rot=(0, math.radians(90 * sx), 0), segments=40))
    parts.append(box("dyn_typewriter_rail", (0.36, 0.012, 0.012), (0, py + 0.032, pz - 0.012), col, m["chrome"], bevel_w=0.002))
    parts.append(cylinder("dyn_typewriter_bail", 0.0022, 0.3, (0, py - 0.016, pz + 0.018), col, m["chrome"],
                          rot=(0, math.radians(90), 0), verts=12))
    for sx in (-0.07, 0.07):
        parts.append(cylinder(f"dyn_typewriter_bailroll_{sx}", 0.005, 0.012, (sx, py - 0.016, pz + 0.018), col, m["rubber"],
                              rot=(0, math.radians(90), 0), verts=16))
    parts.append(curve_tube("dyn_typewriter_return_lever", [(-0.168, py - 0.01, pz + 0.01), (-0.19, py - 0.05, pz + 0.03),
                                                            (-0.2, py - 0.09, pz + 0.035), (-0.195, py - 0.11, pz + 0.03)],
                            0.0035, col, m["chrome"]))
    # paper rolled into the platen with the headline typed on it
    sheet = _paper_sheet("dyn_typewriter_paper", 0.216, 0.2, col, m["paper"])
    sheet.location = (0, py - 0.004, pz + 0.006)
    sheet.rotation_euler = (math.radians(-12), 0, 0)
    parts.append(sheet)
    headline = CONTENT["hero"]["headline"].upper()
    t = text("dyn_typewriter_headline", headline, "SpecialElite-Regular.ttf", 0.0105, col, m["ink"], align="CENTER")
    # sits on the sheet (sheet local frame), a typed line just above the platen
    zl = 0.055
    t.location = (0, 0.02 * (zl / 0.2) ** 2 - 0.0004, zl)
    t.rotation_euler = (math.radians(90), 0, 0)
    t.parent = sheet
    adopt(parts, root)
    return root


def _paper_sheet(name, w, h, col, mat, curl=0.02):
    """sheet standing up out of the platen with a slight backward curl"""
    bm = bmesh.new()
    nx, nz = 12, 16
    grid = []
    for j in range(nz + 1):
        z = h * j / nz
        y = curl * (z / h) ** 2
        grid.append([bm.verts.new((-w / 2 + w * i / nx, y, z)) for i in range(nx + 1)])
    for j in range(nz):
        for i in range(nx):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    o = mesh_object(name, bm, col, mat, smooth=True)
    o.modifiers.new("thick", "SOLIDIFY").thickness = 0.0002
    return o


# ---------------------------------------------------------------- rotary phone

def rotary_phone(col, m, loc, rot):
    root = empty("dyn_telephone", loc, col, rot=(0, 0, rot))
    parts = []
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 0.2
        v.co.y *= 0.22
        v.co.z = (v.co.z + 0.5) * 0.095
        if v.co.z > 0.05:
            # top narrows, front face slopes back ~50 deg from vertical to hold the dial
            v.co.x *= 0.82
            v.co.y = -0.035 if v.co.y < 0 else 0.098
    base = mesh_object("dyn_telephone_base", bm, col, m["bakelite"])
    bv = base.modifiers.new("round", "BEVEL")
    bv.width = 0.03
    bv.segments = 6
    base.modifiers.new("sub", "SUBSURF").levels = 2
    for p in base.data.polygons:
        p.use_smooth = True
    parts.append(base)
    # dial on the sloped front
    dial_root = empty("dyn_telephone_dial", (0, -0.075, 0.052), col, rot=(math.radians(52), 0, 0))
    plate = cylinder("dyn_telephone_dial_plate", 0.047, 0.004, (0, 0, 0), col, m["chrome"], verts=64)
    card = cylinder("dyn_telephone_dial_card", 0.018, 0.0012, (0, 0, 0.0035), col, M.paper("dial_card", (0.85, 0.82, 0.74)),
                    verts=48, bevel_w=0)
    wheel = cylinder("dyn_telephone_fingerwheel", 0.046, 0.003, (0, 0, 0.0045), col, m["bakelite"], verts=96, bevel_w=0.0008)
    cutters = []
    for i in range(10):
        a = math.radians(60 + i * 28)
        c = cylinder(f"cutter_{i}", 0.0072, 0.02, (math.cos(a) * 0.034, math.sin(a) * 0.034, 0.0045), col, None, verts=24,
                     bevel_w=0)
        cutters.append(c)
    for c in cutters:
        b = wheel.modifiers.new(f"hole_{c.name}", "BOOLEAN")
        b.object = c
        b.operation = "DIFFERENCE"
        b.solver = "EXACT"
    stop = box("dyn_telephone_fingerstop", (0.004, 0.016, 0.006), (0.04, -0.03, 0.008), col, m["chrome"], bevel_w=0.001)
    adopt([plate, card, wheel, stop], dial_root)
    for c in cutters:
        c.parent = dial_root
        c.hide_render = True
        c.hide_viewport = True
    parts.append(dial_root)
    # cradle horns
    for sx in (-1, 1):
        parts.append(lathe(f"dyn_telephone_horn_{sx}", [(0.0, 0.0), (0.013, 0.0), (0.012, 0.02), (0.008, 0.03), (0.0, 0.031)],
                           col, m["bakelite"], loc=(sx * 0.072, 0.03, 0.088)))
        parts.append(box(f"dyn_telephone_plunger_{sx}", (0.012, 0.008, 0.012), (sx * 0.045, 0.03, 0.094), col, m["chrome"],
                         bevel_w=0.002))
    # handset resting across the horns
    hs = empty("dyn_telephone_handset", (0, 0.03, 0.128), col)
    handle = curve_tube("dyn_telephone_handset_handle", [(-0.085, 0, -0.008), (-0.04, 0, 0.006), (0.04, 0, 0.006),
                                                         (0.085, 0, -0.008)], 0.0135, col, m["bakelite"])
    ear = lathe("dyn_telephone_earpiece", [(0.0, 0.0), (0.03, 0.0), (0.032, 0.012), (0.022, 0.03), (0.012, 0.034), (0.0, 0.034)],
                col, m["bakelite"], loc=(-0.098, 0, -0.03), rot=(0, math.radians(14), 0))
    mouth = lathe("dyn_telephone_mouthpiece", [(0.0, 0.0), (0.03, 0.0), (0.032, 0.012), (0.022, 0.03), (0.012, 0.034),
                                               (0.0, 0.034)], col, m["bakelite"], loc=(0.098, 0, -0.03), rot=(0, math.radians(-14), 0))
    adopt([handle, ear, mouth], hs)
    parts.append(hs)
    # coiled cord from the mouthpiece end down the side of the base
    start = Vector((0.1, 0.03, 0.09))
    end = Vector((0.11, 0.06, 0.02))
    mid = Vector((0.16, 0.0, 0.0))
    pts = []
    n = 260
    for i in range(n):
        t = i / (n - 1)
        p = (1 - t) ** 2 * start + 2 * (1 - t) * t * (mid + Vector((0.05, -0.04, -0.01))) + t * t * end
        tangent = (2 * (1 - t) * (mid - start) + 2 * t * (end - mid)).normalized()
        a = Vector((0, 0, 1)).cross(tangent).normalized()
        b = tangent.cross(a)
        ang = t * 38 * math.tau
        pts.append(tuple(p + (a * math.cos(ang) + b * math.sin(ang)) * 0.0055))
    parts.append(curve_tube("dyn_telephone_cord", pts, 0.0016, col, m["bakelite"], resolution=2))
    adopt(parts, root)
    return root


# ---------------------------------------------------------------- banker's lamp

def bankers_lamp(col, m, loc, rot):
    root = empty("dyn_bankers_lamp", loc, col, rot=(0, 0, rot))
    parts = [lathe("dyn_lamp_base", [(0.0, 0.0), (0.078, 0.0), (0.078, 0.006), (0.07, 0.012), (0.05, 0.02), (0.022, 0.026),
                                      (0.012, 0.03), (0.0, 0.03)], col, m["brass"])]
    parts[0].scale.y = 0.72
    parts.append(cylinder("dyn_lamp_stem", 0.0065, 0.29, (0, 0.03, 0.17), col, m["brass"], verts=24))
    parts.append(curve_tube("dyn_lamp_arm", [(0, 0.03, 0.31), (0, 0.025, 0.345), (0, -0.0, 0.36), (0, -0.035, 0.355)],
                            0.0055, col, m["brass"]))
    shade = _half_tube("dyn_lamp_shade", 0.26, 0.068, col)
    shade.location = (0, -0.035, 0.36)
    shade.rotation_euler = (math.radians(14), 0, 0)
    shade.data.materials.append(M.green_glass_shade())
    shade.data.materials.append(M.paper("opal_glass", (0.85, 0.84, 0.78), 0.3))
    sol = shade.modifiers.new("thick", "SOLIDIFY")
    sol.thickness = 0.003
    sol.material_offset = 1
    parts.append(shade)
    for sx in (-1, 1):
        parts.append(box(f"dyn_lamp_shade_bracket_{sx}", (0.004, 0.02, 0.008), (sx * 0.06, -0.035, 0.356), col, m["brass"],
                         bevel_w=0.001))
    parts.append(curve_tube("dyn_lamp_chain", [(0.05, -0.06, 0.33), (0.051, -0.061, 0.27), (0.052, -0.062, 0.22)], 0.0012, col,
                            m["brass"], resolution=4))
    parts.append(lathe("dyn_lamp_chain_bead", [(0.0, 0.0), (0.004, 0.003), (0.004, 0.009), (0.0, 0.012)], col, m["brass"],
                       loc=(0.052, -0.062, 0.208)))
    parts.append(lathe("dyn_lamp_bulb", [(0.0, 0.0), (0.012, 0.005), (0.018, 0.025), (0.015, 0.04), (0.008, 0.05), (0.0, 0.05)],
                       col, M.glass("bulb_glass", 0.05), loc=(0.0, -0.04, 0.33), rot=(0, math.radians(90), 0)))
    adopt(parts, root)
    return root


def _half_tube(name, length, radius, col, segs=40):
    bm = bmesh.new()
    rows = []
    for i in (0, 1):
        x = -length / 2 + length * i
        rows.append([bm.verts.new((x, math.cos(a) * radius, math.sin(a) * radius * 0.92))
                     for a in [math.pi * (0.0 + k / segs) for k in range(segs + 1)]])
    for k in range(segs):
        bm.faces.new((rows[0][k], rows[1][k], rows[1][k + 1], rows[0][k + 1]))
    for i, row in enumerate(rows):
        f = bm.faces.new(row if i else list(reversed(row)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = mesh_object(name, bm, col, smooth=True)
    # the arc covers the upper half so the open side already faces down onto the bulb
    for p in o.data.polygons:
        p.use_smooth = abs(p.normal.x) < 0.9
    return o


# ---------------------------------------------------------------- radio

def radio(col, m, loc, rot):
    wood = M.scanned("black_oak_veneer", tile=0.4, val=1.9, sat=1.5, hue=0.53, coat=0.7, rough_mult=0.7, name="radio_walnut")
    cloth = M.scanned("hessian_230", tile=0.12, val=0.55, sat=0.7, name="speaker_cloth")
    root = empty("dyn_radio", loc, col, rot=(0, 0, rot))
    w, d, h = 0.36, 0.19, 0.24
    # tombstone cabinet: rectangle with an arched top, extruded front to back
    bm = bmesh.new()
    prof = [(-w / 2, 0.0), (w / 2, 0.0), (w / 2, h - w / 2 * 0.55)]
    for k in range(1, 24):
        a = k / 24 * math.pi
        prof.append((math.cos(a) * w / 2, h - w / 2 * 0.55 + math.sin(a) * w / 2 * 0.55))
    prof.append((-w / 2, h - w / 2 * 0.55))
    vs = [bm.verts.new((x, -d / 2, z)) for x, z in prof]
    face = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    for v in [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]:
        v.co.y += d
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    cab = mesh_object("dyn_radio_cabinet", bm, col, wood)
    bevel(cab, 0.008, 4)
    world_uvs(cab, 0.4)
    parts = [cab]
    # grille: cloth in an arch with three wooden ribs
    g = plane("dyn_radio_grille", (0.22, 0.12), (0, -d / 2 - 0.0015, 0.165), col, cloth, rot=(math.radians(90), 0, 0))
    world_uvs(g, 0.12)
    parts.append(g)
    for i in (-1, 0, 1):
        parts.append(box(f"dyn_radio_rib_{i}", (0.012, 0.006, 0.13), (i * 0.05, -d / 2 - 0.004, 0.165), col, wood, bevel_w=0.002))
    # dial window: cream scale, red needle, glass
    parts.append(box("dyn_radio_dial_bezel", (0.2, 0.006, 0.05), (0, -d / 2 - 0.003, 0.06), col, m["brass"], bevel_w=0.003))
    parts.append(box("dyn_radio_dial_scale", (0.185, 0.002, 0.038), (0, -d / 2 - 0.006, 0.06), col,
                     M.paper("dial_scale", (0.78, 0.68, 0.48), 0.5), bevel_w=0))
    for i in range(25):
        x = -0.085 + i * 0.17 / 24
        parts.append(box(f"dyn_radio_tick_{i}", (0.0008, 0.0006, 0.012 if i % 4 == 0 else 0.007),
                         (x, -d / 2 - 0.0072, 0.067), col, m["ink"], bevel_w=0))
    parts.append(box("dyn_radio_needle", (0.0012, 0.0008, 0.034), (-0.03, -d / 2 - 0.0078, 0.06), col,
                     M.principled("needle_red", (0.5, 0.02, 0.02), 0.4), bevel_w=0))
    parts.append(box("dyn_radio_dial_glass", (0.19, 0.002, 0.042), (0, -d / 2 - 0.0085, 0.06), col, M.glass("dial_glass", 0.02),
                     bevel_w=0.0005))
    for i, x in enumerate((-0.135, 0.135)):
        parts.append(lathe(f"dyn_radio_knob_{i}", [(0.0, 0.0), (0.017, 0.0), (0.017, 0.012), (0.013, 0.018), (0.0, 0.019)],
                           col, m["bakelite"], loc=(x, -d / 2, 0.06), rot=(math.radians(90), 0, 0)))
    adopt(parts, root)
    return root


# ---------------------------------------------------------------- filter coffee

def davara_tumbler(col, m, loc):
    root = empty("dyn_davara_tumbler", loc, col)
    davara = lathe("dyn_davara", [(0.0, 0.0), (0.036, 0.0), (0.04, 0.003), (0.05, 0.022), (0.058, 0.036), (0.062, 0.04),
                                  (0.06, 0.042), (0.055, 0.037), (0.046, 0.022), (0.034, 0.005), (0.0, 0.005)], col, m["steel"])
    tumbler = lathe("dyn_tumbler", [(0.0, 0.006), (0.026, 0.006), (0.028, 0.01), (0.033, 0.085), (0.036, 0.092),
                                    (0.034, 0.094), (0.031, 0.088), (0.026, 0.012), (0.0, 0.012)], col, m["steel"],
                    loc=(0, 0, 0.0))
    coffee = M.principled("filter_coffee", (0.16, 0.085, 0.04), 0.12, Subsurface_Weight=0.2)
    foam = M.principled("coffee_froth", (0.45, 0.30, 0.17), 0.6)
    liquid = cylinder("dyn_tumbler_coffee", 0.0294, 0.0012, (0, 0, 0.0742), col, foam, verts=48, bevel_w=0)
    body = lathe("dyn_tumbler_coffee_body", [(0.0, 0.013), (0.0258, 0.013), (0.0296, 0.0738), (0.0, 0.0738)], col, coffee)
    adopt([davara, tumbler, liquid, body], root)
    return root


# ---------------------------------------------------------------- case folder

def case_folder(col, m, loc, rot, hero=True, idx=0):
    name = "dyn_case_folder" if hero else f"static_case_file_{idx}"
    root = empty(name, loc, col, rot=(0, 0, rot))
    w, h = 0.31, 0.235
    parts = []
    back = box(f"{name}_back", (w, h, 0.0006), (0, 0, 0.0003), col, m["manila"], bevel_w=0)
    tab = box(f"{name}_tab", (0.1, 0.018, 0.0006), (-0.08 + idx * 0.05, h / 2 + 0.009, 0.0003), col, m["manila"], bevel_w=0)
    for i in range(4):
        parts.append(box(f"{name}_sheet_{i}", (w - 0.012, h - 0.008, 0.0004),
                         (rng.uniform(-0.004, 0.006), rng.uniform(-0.004, 0.004), 0.0009 + i * 0.0004), col, m["paper"],
                         rot=(0, 0, math.radians(rng.uniform(-1.2, 1.2))), bevel_w=0))
    front = box(f"{name}_front", (w - 0.006, h - 0.004, 0.0006), (-0.003, -0.002, 0.0034), col, m["manila"], bevel_w=0)
    parts += [back, tab, front]
    if hero:
        # polaroid of the subject sticking out on the right
        photo = os.path.join(REPO, "public", CONTENT["subject"]["photo"].lstrip("/"))
        pol = empty("dyn_case_folder_polaroid", (w / 2 - 0.004, 0.012, 0.0026), col, rot=(0, 0, math.radians(-14)))
        fr = box("dyn_case_folder_polaroid_frame", (0.088, 0.107, 0.0007), (0, 0, 0), col,
                 M.paper("polaroid_frame", (0.86, 0.85, 0.80), 0.6), bevel_w=0)
        pic = plane("dyn_case_folder_polaroid_photo", (0.079, 0.079), (0, 0.009, 0.0004), col,
                    M.image_paper("photo_subject", photo) if os.path.exists(photo) else m["paper"])
        _crop_square(pic, photo)
        adopt([fr, pic], pol)
        parts.append(pol)
        # typed label sticker
        parts.append(box(f"{name}_label", (0.17, 0.05, 0.0002), (-0.045, 0.055, 0.0038), col, M.paper("label_white", (0.84, 0.82, 0.76)),
                         bevel_w=0))
        lines = [f"CASE FILE No. {CONTENT['caseNumber']}", f"SUBJECT: {CONTENT['subject']['name'].upper()}", "STATUS: UNKNOWN"]
        for i, line in enumerate(lines):
            t = text(f"{name}_label_{i}", line, "SpecialElite-Regular.ttf", 0.0088, col, m["ink"], align="LEFT")
            t.location = (-0.125, 0.07 - i * 0.0135, 0.0040)
            parts.append(t)
        stamp = text(f"{name}_classified", "CLASSIFIED", "SpecialElite-Regular.ttf", 0.03, col, m["red_ink"])
        stamp.location = (-0.01, -0.055, 0.0039)
        stamp.rotation_euler.z = math.radians(9)
        parts.append(stamp)
        ring = lathe(f"{name}_coffee_ring", [(0.033, 0.0), (0.037, 0.0)], col,
                     M.ink("coffee_stain", (0.25, 0.12, 0.05)), loc=(0.085, -0.07, 0.0039), segments=64)
        parts.append(ring)
        clip = curve_tube(f"{name}_paperclip", [(-0.13, h / 2 + 0.006, 0.0042), (-0.13, h / 2 - 0.035, 0.0042),
                                                 (-0.123, h / 2 - 0.04, 0.0042), (-0.116, h / 2 - 0.035, 0.0042),
                                                 (-0.116, h / 2 + 0.002, 0.0042), (-0.121, h / 2 + 0.007, 0.0042),
                                                 (-0.125, h / 2 + 0.002, 0.0042), (-0.125, h / 2 - 0.027, 0.0042)],
                          0.0005, col, m["chrome"], resolution=6)
        parts.append(clip)
    adopt(parts, root)
    return root


def _crop_square(obj, path):
    if not os.path.exists(path):
        return
    img = bpy.data.images.load(path, check_existing=True)
    w, h = img.size
    aspect = w / h if h else 1
    uv = obj.data.uv_layers.active or obj.data.uv_layers.new()
    for loop in obj.data.loops:
        u, v = uv.data[loop.index].uv
        if aspect > 1:
            u = 0.5 + (u - 0.5) / aspect
        else:
            v = 0.5 + (v - 0.5) * aspect + 0.08  # portraits: favour the face
        uv.data[loop.index].uv = (u, v)


# ---------------------------------------------------------------- the suspect's habits

def esp32(col, m, loc, rot):
    root = empty("dyn_esp32", loc, col, rot=(0, 0, rot))
    gold = M.polished_metal("pin_gold", (0.95, 0.72, 0.35), 0.25)
    header_black = M.plastic("header_plastic", (0.01, 0.01, 0.01), 0.5)
    can = M.brushed_metal("shield_can", (0.7, 0.7, 0.72), 0.3, 0.3)
    parts = [box("dyn_esp32_pcb", (0.052, 0.028, 0.0016), (0, 0, 0.0108), col, M.pcb(), bevel_w=0.0003)]
    parts.append(box("dyn_esp32_module", (0.018, 0.0255, 0.0008), (0.015, 0, 0.012), col, M.pcb("module_pcb"), bevel_w=0.0002))
    parts.append(box("dyn_esp32_can", (0.0125, 0.017, 0.0024), (0.012, 0, 0.0136), col, can, bevel_w=0.0003))
    parts.append(box("dyn_esp32_usb", (0.006, 0.008, 0.003), (-0.025, 0, 0.0131), col, can, bevel_w=0.0004))
    for side in (-1, 1):
        parts.append(box(f"dyn_esp32_header_{side}", (0.048, 0.0025, 0.0025), (0, side * 0.0125, 0.0085), col, header_black,
                         bevel_w=0.0002))
        for i in range(19):
            parts.append(box(f"dyn_esp32_pin_{side}_{i}", (0.0006, 0.0006, 0.0072), (-0.0229 + i * 0.00254, side * 0.0125, 0.0042),
                             col, gold, bevel_w=0))
    parts.append(box("dyn_esp32_led", (0.0016, 0.0008, 0.0006), (-0.016, 0.006, 0.0118), col,
                     M.principled("led_red_off", (0.35, 0.02, 0.02), 0.2), bevel_w=0))
    # a few jumper wires trailing off it
    for i, c in enumerate(((0.5, 0.02, 0.02), (0.02, 0.08, 0.4), (0.6, 0.45, 0.05))):
        x = -0.02 + i * 0.008
        parts.append(curve_tube(f"dyn_esp32_jumper_{i}", [(x, 0.0125, 0.008), (x - 0.01, 0.04, 0.02), (x - 0.03, 0.07, 0.003),
                                                          (x - 0.06, 0.09, 0.0012)], 0.0009, col,
                                M.plastic(f"jumper_{i}", c, 0.45), resolution=6))
    adopt(parts, root)
    return root


def soldering_station(col, m, loc, rot):
    root = empty("dyn_soldering_station", loc, col, rot=(0, 0, rot))
    cast = M.powder_coat("stand_cast", (0.03, 0.03, 0.032), 0.55)
    sponge = M.principled("tip_sponge", (0.55, 0.40, 0.08), 0.95)
    parts = [box("dyn_solder_base", (0.13, 0.085, 0.018), (0, 0, 0.009), col, cast, bevel_w=0.004)]
    parts.append(box("dyn_solder_sponge", (0.05, 0.05, 0.012), (-0.035, 0, 0.022), col, sponge, bevel_w=0.003))
    # spiral holder, angled up and back
    pts = []
    for i in range(140):
        t = i / 139
        a = t * 9 * math.tau
        r = 0.011 + 0.008 * t
        p = Vector((math.cos(a) * r, math.sin(a) * r, t * 0.075))
        p.rotate(Matrix.Rotation(math.radians(-52), 3, "Y"))
        pts.append(tuple(p + Vector((0.03, 0, 0.02))))
    parts.append(curve_tube("dyn_solder_spiral", pts, 0.0011, col, m["chrome"], resolution=2))
    # iron lies along the spiral, tip resting at the bottom of the coil
    iron = empty("dyn_soldering_iron", (-0.0767, 0.0, 0.1037), col, rot=(0, math.radians(-52), 0))
    handle = lathe("dyn_iron_handle", [(0.0, 0.0), (0.009, 0.0), (0.011, 0.02), (0.0115, 0.09), (0.009, 0.11), (0.005, 0.12)],
                   col, M.rubber("iron_grip", (0.02, 0.05, 0.18)), loc=(0, 0, -0.06))
    barrel = cylinder("dyn_iron_barrel", 0.0042, 0.07, (0, 0, -0.095), col, m["chrome"], verts=16)
    tip = lathe("dyn_iron_tip", [(0.0, 0.0), (0.003, 0.0), (0.0015, 0.018), (0.0, 0.022)], col,
                M.polished_metal("tip_metal", (0.35, 0.33, 0.3), 0.3), loc=(0, 0, -0.152), rot=(math.pi, 0, 0))
    adopt([handle, barrel, tip], iron)
    parts.append(iron)
    adopt(parts, root)
    bpy.context.view_layer.update()
    start = root.matrix_world @ Vector((-0.124, 0, 0.141))
    curve_tube("dyn_iron_cable", [tuple(start), (3.14, 2.8, TOP + 0.03), (3.17, 2.76, TOP + 0.006), (3.195, 2.68, TOP + 0.003),
                                  (3.215, 2.62, TOP - 0.03), (3.23, 2.55, 0.3)], 0.0028, col, M.rubber("cable"))
    return root


def stamp_and_pad(col, m, loc):
    root = empty("dyn_rubber_stamp_set", loc, col, rot=(0, 0, math.radians(18)))
    wood = M.scanned("black_oak_veneer", tile=0.2, val=2.2, sat=1.4, hue=0.53, coat=0.5, name="stamp_handle_wood")
    tin = M.polished_metal("ink_tin", (0.22, 0.22, 0.24), 0.3)
    parts = [box("dyn_ink_pad_tin", (0.1, 0.065, 0.012), (0, 0, 0.006), col, tin, bevel_w=0.003),
             box("dyn_ink_pad", (0.088, 0.053, 0.002), (0, 0, 0.0115), col, M.principled("pad_ink", (0.18, 0.01, 0.01), 0.85),
                 bevel_w=0.001)]
    stamp = empty("dyn_rubber_stamp", (0.1, 0.01, 0), col)
    adopt([box("dyn_stamp_block", (0.06, 0.04, 0.012), (0, 0, 0.009), col, wood, bevel_w=0.002),
           box("dyn_stamp_rubber", (0.058, 0.038, 0.003), (0, 0, 0.0015), col, M.rubber("stamp_rubber", (0.2, 0.04, 0.03))),
           lathe("dyn_stamp_handle", [(0.0, 0.0), (0.009, 0.0), (0.007, 0.03), (0.011, 0.045), (0.012, 0.058), (0.0, 0.065)],
                 col, wood, loc=(0, 0, 0.015))], stamp)
    parts.append(stamp)
    adopt(parts, root)
    return root


def desk_calendar(col, m, loc, rot):
    root = empty("dyn_desk_calendar", loc, col, rot=(0, 0, rot))
    today = datetime.date.today()
    card_m = M.paper("calendar_card", (0.84, 0.82, 0.76), 0.6)
    red = M.principled("calendar_red", (0.42, 0.02, 0.03), 0.5)
    parts = []
    for side in (-1, 1):
        f = box(f"dyn_calendar_leaf_{side}", (0.09, 0.0015, 0.1), (0, side * 0.018, 0.048), col, card_m, bevel_w=0.0004)
        f.rotation_euler.x = math.radians(14 * side)  # A-frame, both leaves lean in at the top
        parts.append(f)
    parts.append(box("dyn_calendar_spine", (0.094, 0.006, 0.006), (0, 0, 0.097), col, M.powder_coat(), bevel_w=0.001))
    for body, size, z, mat in ((today.strftime("%b").upper(), 0.014, 0.08, red), (str(today.day), 0.038, 0.045, m["ink"]),
                               (today.strftime("%A").upper(), 0.008, 0.017, m["ink"])):
        t = text(f"dyn_calendar_{body}", body, "SpecialElite-Regular.ttf", size, col, mat)
        t.location = (0, -0.0205 + 0.249 * (z - 0.048), z)
        t.rotation_euler = (math.radians(76), 0, 0)
        parts.append(t)
    adopt(parts, root)
    return root


def polyhaven_desk_items(col):
    objs = append_model("magnifying_glass_01", col)
    rest_on(place(objs, "dyn_magnifying_glass", (2.78, 2.08, TOP), col, rot=(math.radians(90), 0, math.radians(-62))), TOP + 0.003)
    objs = append_model("stationery_supplies", col, names=["stationery_supplies_pen_fancy"])
    lo = floor_origin(objs)
    rest_on(place(objs, "dyn_fountain_pen", (2.36, 2.16, TOP), col, rot=(0, 0, math.radians(-20)), origin=lo), TOP + 0.003)
    objs = append_model("pocket_watch", col)
    rest_on(place(objs, "static_pocket_watch", (1.8, 2.16, TOP), col, rot=(math.radians(-90), 0, math.radians(30))), TOP)
    objs = append_model("round_spectacles", col)
    rest_on(place(objs, "static_spectacles", (1.95, 2.13, TOP), col, rot=(0, 0, math.radians(160))), TOP)


# ---------------------------------------------------------------- drone in an evidence bag

def drone_in_bag(col, m, loc):
    root = empty("dyn_drone_evidence", loc, col, rot=(0, 0, math.radians(-12)))
    carbon = M.principled("carbon_fibre", (0.03, 0.03, 0.032), 0.32, Coat_Weight=0.5, Coat_Roughness=0.2)
    parts = [box("dyn_drone_plate", (0.09, 0.11, 0.004), (0, 0, 0.012), col, carbon, bevel_w=0.001),
             box("dyn_drone_stack", (0.05, 0.06, 0.022), (0, 0, 0.026), col, M.pcb("flight_stack"), bevel_w=0.002),
             cylinder("dyn_drone_lidar", 0.022, 0.018, (0, 0, 0.046), col, M.plastic("lidar_body", (0.03, 0.03, 0.035), 0.3),
                      verts=40)]
    for i in range(4):
        a = math.radians(45 + i * 90)
        d = Vector((math.cos(a), math.sin(a), 0))
        arm = box(f"dyn_drone_arm_{i}", (0.12, 0.016, 0.004), tuple(d * 0.07 + Vector((0, 0, 0.012))), col, carbon, bevel_w=0.001)
        arm.rotation_euler.z = a
        mpos = d * 0.13 + Vector((0, 0, 0.022))
        parts += [arm, cylinder(f"dyn_drone_motor_{i}", 0.011, 0.016, tuple(mpos), col, M.brushed_metal("motor_bell", (0.2, 0.2, 0.22)),
                                verts=24)]
        prop = box(f"dyn_drone_prop_{i}", (0.12, 0.012, 0.0015), tuple(mpos + Vector((0, 0, 0.01))), col,
                   M.plastic("prop_black", (0.02, 0.02, 0.02), 0.35), bevel_w=0.0005)
        prop.rotation_euler.z = a + math.radians(30 + 40 * i)
        parts.append(prop)
    # the bag: puffed up wrinkled clear sleeve around the drone
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(0.36, 0.34, 0.07), verts=bm.verts)
    bmesh.ops.translate(bm, vec=(0, 0, 0.035), verts=bm.verts)
    bag = mesh_object("dyn_evidence_bag", bm, col, M.plastic_bag(), smooth=True)
    bag.modifiers.new("sub", "SUBSURF").levels = 3
    tex = bpy.data.textures.new("bag_wrinkles", "CLOUDS")
    tex.noise_scale = 0.05
    disp = bag.modifiers.new("wrinkles", "DISPLACE")
    disp.texture = tex
    disp.strength = 0.006
    bag.modifiers.new("thin", "SOLIDIFY").thickness = 0.0006
    bag.visible_shadow = False
    parts.append(bag)
    # red evidence strip and a paper tag
    parts.append(box("dyn_evidence_bag_strip", (0.34, 0.035, 0.0004), (0, 0.14, 0.071), col,
                     M.principled("evidence_strip", (0.45, 0.02, 0.03), 0.5), bevel_w=0))
    tag = box("dyn_evidence_tag", (0.07, 0.04, 0.0005), (0.12, -0.19, 0.003), col, m["manila"], bevel_w=0)
    tag.rotation_euler.z = math.radians(22)
    parts.append(tag)
    t = text("dyn_evidence_tag_text", "EXHIBIT A", "SpecialElite-Regular.ttf", 0.009, col, m["ink"])
    t.location = (0.12, -0.19, 0.0034)
    t.rotation_euler.z = math.radians(22)
    parts.append(t)
    adopt(parts, root)
    return root
