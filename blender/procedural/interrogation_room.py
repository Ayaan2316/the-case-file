"""Scenes F and G - the interrogation room and the verdict.

A bare room far from the others (x 0-4.0, y 40-43.6, 3.0m ceiling, the camera cuts here from the
evidence room): peeling paint, a painted steel table and two chairs under one swinging lamp (a
real time light in the browser so the bake skips it), a one-way mirror on the right wall, a CCTV
camera in the corner, a reel-to-reel recorder, the typed transcript (blank paper here, the
browser prints it) and the case file waiting for the stamp.
"""
import math

import bpy
from mathutils import Matrix, Vector

import materials as M
from lib.common import adopt, box, collection, curve_tube, cylinder, empty, lathe, plane, world_uvs
from procedural import evidence_room as ev

X0, X1 = 0.0, 4.0
Y0, Y1 = 40.0, 43.6
H = 3.0
T = 0.14
TABLE = Vector((2.0, 41.8))
TABLE_W, TABLE_D = 1.2, 0.76
TOP = 0.76
CORD = 1.05  # hook to the top of the shade
DOOR = (40.4, 41.3, 2.05)
MIRROR = (41.0, 42.9, 0.95, 2.0)  # right wall (x = X1): y from, y to, z from, z to


def _marker(name, matrix, size, col):
    """a pose for the browser (export.py -> scene.json `interrogation`), where it prints or reflects"""
    e = bpy.data.objects.new(name, None)
    e.matrix_world = matrix
    e["size"] = list(size)
    col.objects.link(e)
    return e


def build(root):
    col = collection("interro_build", root)
    m = {
        "floor": M.scanned("concrete_floor_painted", tile=2.0, val=0.72, sat=0.35, rough_mult=0.9, macro=0.3,
                           name="interro_floor", dust=0.25),
        "wall": M.scanned("peeling_painted_wall", tile=1.8, val=0.9, sat=0.55, hue=0.5, tint=(0.6, 0.66, 0.6),
                          macro=0.3, name="interro_wall", disp=0.003),
        "ceiling": M.scanned("damaged_plaster", tile=2.4, val=0.42, sat=0.3, name="interro_ceiling"),
        "cove": M.rubber("interro_cove", (0.03, 0.03, 0.028)),
        "door": M.powder_coat("interro_door", (0.12, 0.13, 0.12), 0.5),
        "frame": M.powder_coat("interro_door_frame", (0.04, 0.042, 0.04), 0.45),
        "chrome": M.chrome(),
        # painted steel, constant roughness (see evidence_room, block compressed ORM)
        "table": M.principled("interro_table", (0.2, 0.22, 0.2), 0.45, 0.0, Coat_Weight=0.25, Coat_Roughness=0.3),
        "tube": M.polished_metal("interro_chair_tube", (0.55, 0.56, 0.57), 0.25, 0.03),
        "seat": M.principled("interro_chair_seat", (0.05, 0.05, 0.05), 0.55),
        "paper": M.paper("interro_paper", (0.85, 0.83, 0.77)),
        "manila": M.manila(),
        "ink": M.principled("interro_ink", (0.02, 0.02, 0.025), 0.6),
        "red": M.ink("interro_stamp_ink", (0.42, 0.02, 0.03)),
        "wood": M.scanned("black_oak_veneer", tile=0.4, val=1.4, sat=1.2, coat=0.3, name="stamp_wood"),
        "rubber": M.rubber("stamp_rubber", (0.04, 0.02, 0.02)),
        "alu": M.brushed_metal("recorder_alu", (0.62, 0.62, 0.6), 0.3),
        "leatherette": M.principled("recorder_case", (0.05, 0.035, 0.028), 0.6),
        "reel": M.plastic("reel_plastic", (0.08, 0.08, 0.09), 0.3),
        "tape": M.principled("recorder_tape", (0.09, 0.05, 0.03), 0.35),
        "knob": M.plastic("recorder_knob", (0.02, 0.02, 0.02), 0.35),
        "enamel": M.enamel("interro_shade", (0.04, 0.06, 0.05), 0.3),
    }
    shell_(col, m)
    ev.door_(col, m, DOOR, "interro")
    ev.cctv_(col, (0.1, Y1 - 0.12, H - 0.33), -45, "interro")
    mirror_(col, m)
    table_(col, m)
    chair_(col, m, "suspect", (TABLE.x, TABLE.y + 0.62), 180 + 4)
    chair_(col, m, "detective", (TABLE.x + 0.06, TABLE.y - 0.72), -8)
    lamp_(col, m)
    recorder_(col, m)
    transcript_(col, m)
    case_file_(col, m)
    ashtray_(col, m)
    return {}


# ---------------------------------------------------------------- room

def shell_(col, m):
    W, D = X1 - X0, Y1 - Y0
    cx, cy = (X0 + X1) / 2, (Y0 + Y1) / 2
    world_uvs(plane("static_interro_floor", (W, D), (cx, cy, 0), col, m["floor"], subdiv=6), 2.0)
    # slab top sits half a mm under the floor. when they were coplanar cycles' camera rays hit either
    # one and the stills showed the black slab instead of the floor
    box("static_interro_slab", (W + 2 * T, D + 2 * T, 0.2), (cx, cy, -0.1005), col, m["cove"], bevel_w=0)
    world_uvs(box("static_interro_ceiling", (W + 2 * T, D + 2 * T, 0.14), (cx, cy, H + 0.07), col, m["ceiling"], bevel_w=0), 2.4)
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
        world_uvs(box(f"static_interro_wall_{name}", size, loc, col, m["wall"], bevel_w=0), 1.8)
    for name, size, loc in (("left_a", (0.012, d0 - Y0, 0.1), (X0 + 0.006, (Y0 + d0) / 2, 0.05)),
                            ("left_b", (0.012, Y1 - d1, 0.1), (X0 + 0.006, (d1 + Y1) / 2, 0.05)),
                            ("right", (0.012, D, 0.1), (X1 - 0.006, cy, 0.05)),
                            ("front", (W, 0.012, 0.1), (cx, Y0 + 0.006, 0.05)),
                            ("back", (W, 0.012, 0.1), (cx, Y1 - 0.006, 0.05))):
        box(f"static_interro_cove_{name}", size, loc, col, m["cove"], bevel_w=0.002)


def mirror_(col, m):
    """one-way mirror, a steel frame on the right wall. the glass is a live reflection in the browser
    (Interrogation.tsx) placed at this marker
    """
    y0, y1, z0, z1 = MIRROR
    frame = m["frame"]
    depth, bar = 0.05, 0.06
    x = X1 - depth / 2
    parts = [box("static_interro_mirror_top", (depth, y1 - y0 + 2 * bar, bar), (x, (y0 + y1) / 2, z1 + bar / 2), col, frame),
             box("static_interro_mirror_bottom", (depth + 0.04, y1 - y0 + 2 * bar, bar), (x - 0.02, (y0 + y1) / 2, z0 - bar / 2), col,
                 frame),
             box("static_interro_mirror_left", (depth, bar, z1 - z0), (x, y0 - bar / 2, (z0 + z1) / 2), col, frame),
             box("static_interro_mirror_right", (depth, bar, z1 - z0), (x, y1 + bar / 2, (z0 + z1) / 2), col, frame),
             # dark backing so cycles sees dim glass, the browser puts its reflector just in front
             box("static_interro_mirror_back", (0.01, y1 - y0, z1 - z0), (X1 - 0.012, (y0 + y1) / 2, (z0 + z1) / 2), col,
                 M.principled("mirror_glass_dark", (0.22, 0.23, 0.24), 0.03, 1.0), bevel_w=0)]
    # local Z (glass normal) faces into the room (-x), local Y up
    _marker("interro_mirror", Matrix.Translation((X1 - 0.018, (y0 + y1) / 2, (z0 + z1) / 2))
            @ Matrix.Rotation(math.radians(-90), 4, "Z") @ Matrix.Rotation(math.radians(90), 4, "X"), (y1 - y0, z1 - z0), col)
    return parts


# ---------------------------------------------------------------- furniture

def table_(col, m):
    cx, cy = TABLE
    parts = [box("static_interro_table_top", (TABLE_W, TABLE_D, 0.03), (cx, cy, TOP - 0.015), col, m["table"], bevel_w=0.004),
             box("static_interro_table_apron", (TABLE_W - 0.08, TABLE_D - 0.08, 0.07), (cx, cy, TOP - 0.065), col, m["table"],
                 bevel_w=0.003)]
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        x, y = cx + sx * (TABLE_W / 2 - 0.05), cy + sy * (TABLE_D / 2 - 0.05)
        parts.append(box(f"static_interro_table_leg_{i}", (0.035, 0.035, TOP - 0.03), (x, y, (TOP - 0.03) / 2), col, m["table"],
                         bevel_w=0.003))
    # ring bolted on top for the suspect's cuffs
    ring = curve_tube("static_interro_table_ring", [(cx + 0.38 + 0.03 * math.cos(a), cy + 0.25 + 0.03 * math.sin(a), TOP + 0.004)
                                                    for a in [k * math.tau / 12 for k in range(12)]], 0.004, col, m["chrome"],
                      cyclic=True)
    return parts + [ring]


def chair_(col, m, who, at, yaw):
    """tubular steel chair: seat, back, four legs"""
    root = empty(f"static_interro_chair_{who}", (at[0], at[1], 0), col, rot=(0, 0, math.radians(yaw)))
    seat_h, w, d = 0.46, 0.42, 0.42
    parts = [box(f"static_interro_chair_{who}_seat", (w, d, 0.03), (0, 0, seat_h), col, m["seat"], bevel_w=0.008),
             box(f"static_interro_chair_{who}_back", (w, 0.025, 0.26), (0, -d / 2 + 0.01, seat_h + 0.32), col, m["seat"],
                 rot=(math.radians(-8), 0, 0), bevel_w=0.008)]
    for i, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        x, y = sx * (w / 2 - 0.02), sy * (d / 2 - 0.02)
        top = seat_h + (0.45 if sy < 0 else 0)
        parts.append(curve_tube(f"static_interro_chair_{who}_leg_{i}", [(x, y, 0.0), (x, y, top)], 0.011, col, m["tube"]))
        parts.append(cylinder(f"static_interro_chair_{who}_foot_{i}", 0.014, 0.012, (x, y, 0.006), col, m["cove"], verts=16))
    adopt(parts, root)
    return root


def lamp_(col, m):
    """hanging lamp: cord, enamel cone, bulb. one piece (`dyn_`) on the ceiling hook, which is its pivot -
    the browser swings it and hangs its real time spot from it
    """
    hook = Vector((TABLE.x, TABLE.y, H))
    root = empty("dyn_interro_lamp", hook, col)
    shade_top = -CORD
    parts = [cylinder("dyn_interro_lamp_rose", 0.045, 0.02, (0, 0, -0.01), col, m["enamel"], verts=32),
             curve_tube("dyn_interro_lamp_cord", [(0, 0, -0.02), (0, 0, shade_top)], 0.0035, col, m["knob"]),
             cylinder("dyn_interro_lamp_socket", 0.022, 0.06, (0, 0, shade_top - 0.03), col, m["enamel"], verts=24)]
    shade = lathe("dyn_interro_lamp_shade", [(0.025, shade_top - 0.02), (0.05, shade_top - 0.06), (0.14, shade_top - 0.16),
                                             (0.2, shade_top - 0.22), (0.205, shade_top - 0.225)], col, m["enamel"], segments=64)
    shade.modifiers.new("thick", "SOLIDIFY").thickness = 0.002
    parts.append(shade)
    adopt(parts, root)
    # inside of the shade + bulb glow (emissive, they follow the lamp in the browser). sits inside the
    # shade's thickness (solidify grows inward by 2mm) so it never pokes through
    inner = lathe("fx_interro_lamp_inner", [(0.019, shade_top - 0.024), (0.043, shade_top - 0.064), (0.133, shade_top - 0.164),
                                            (0.192, shade_top - 0.221)], col, M.emission("lamp_inner", (1.0, 0.86, 0.66), 1.2),
                  loc=hook, segments=64)
    bulb = lathe("fx_interro_lamp_bulb", [(0.0, 0.0), (0.028, -0.012), (0.032, -0.045), (0.014, -0.08), (0.0, -0.085)], col,
                 M.emission("interro_bulb", (1.0, 0.85, 0.64), 30.0), loc=hook + Vector((0, 0, shade_top - 0.06)), segments=32)
    for o in (inner, bulb):
        o.visible_shadow = False
        o["case_follow"] = "dyn_interro_lamp"
    for o in parts:
        o.visible_shadow = o.name.endswith("shade")
    return root


# ---------------------------------------------------------------- on the table

def recorder_(col, m):
    """reel-to-reel recorder: two reels (`dyn_`, they spin), tape over the heads, knobs"""
    at = Vector((TABLE.x - 0.3, TABLE.y + 0.12, TOP))
    root = empty("static_interro_recorder", at, col, rot=(0, 0, math.radians(-6)))
    w, d, h = 0.4, 0.32, 0.11
    parts = [box("static_interro_recorder_case", (w, d, h), (0, 0, h / 2), col, m["leatherette"], bevel_w=0.008),
             box("static_interro_recorder_plate", (w - 0.02, d - 0.02, 0.004), (0, 0, h + 0.001), col, m["alu"], bevel_w=0.002),
             box("static_interro_recorder_heads", (0.09, 0.035, 0.03), (0, -0.09, h + 0.017), col, m["alu"], bevel_w=0.004)]
    for k, x in enumerate((-0.12, -0.04, 0.04, 0.12)):
        parts.append(cylinder(f"static_interro_recorder_knob_{k}", 0.012, 0.014, (x, -0.13, h + 0.009), col, m["knob"], verts=24))
    for k, x in enumerate((0.07, 0.13)):
        parts.append(box(f"static_interro_recorder_vu_{k}", (0.04, 0.003, 0.022), (x, -0.155, h - 0.025), col,
                         M.principled("vu_face", (0.75, 0.62, 0.38), 0.3), bevel_w=0))
    reels = []
    for side, x in (("l", -0.1), ("r", 0.1)):
        reel = empty(f"dyn_interro_reel_{side}", at + Vector((x * math.cos(math.radians(-6)), x * math.sin(math.radians(-6)), h + 0.006)),
                     col)
        flange = M.plastic("reel_flange", (0.12, 0.12, 0.13), 0.25)
        rp = [cylinder(f"dyn_interro_reel_{side}_hub", 0.016, 0.016, (0, 0, 0.008), col, m["alu"], verts=24),
              cylinder(f"dyn_interro_reel_{side}_tape", 0.045 if side == "l" else 0.032, 0.006, (0, 0, 0.006), col, m["tape"], verts=48,
                       bevel_w=0),
              cylinder(f"dyn_interro_reel_{side}_flange_a", 0.07, 0.0015, (0, 0, 0.002), col, flange, verts=64, bevel_w=0),
              cylinder(f"dyn_interro_reel_{side}_flange_b", 0.07, 0.0015, (0, 0, 0.0115), col, flange, verts=64, bevel_w=0)]
        for k in range(3):
            a = k * math.tau / 3
            rp.append(box(f"dyn_interro_reel_{side}_spoke_{k}", (0.05, 0.012, 0.002), (0.035 * math.cos(a), 0.035 * math.sin(a), 0.0125),
                          col, m["alu"], rot=(0, 0, a), bevel_w=0))
        adopt(rp, reel)
        reels.append(reel)
    # tape path: left reel -> heads -> right reel
    parts.append(curve_tube("static_interro_recorder_tapepath", [(-0.14, -0.02, h + 0.012), (-0.05, -0.088, h + 0.012),
                                                                 (0.05, -0.088, h + 0.012), (0.13, -0.025, h + 0.012)],
                            0.0012, col, m["tape"]))
    adopt(parts, root)
    return root, reels


def transcript_(col, m):
    """typed transcript in front of the detective's chair, blank here, the browser types it"""
    at = Vector((TABLE.x + 0.18, TABLE.y - 0.14, TOP + 0.0006))
    rot = math.radians(7)
    plane("static_interro_transcript", (0.21, 0.297), at, col, m["paper"], rot=(0, 0, rot))
    _marker("interro_decal_transcript", Matrix.Translation(at + Vector((0, 0, 0.0009))) @ Matrix.Rotation(rot, 4, "Z"), (0.21, 0.297),
            col)


def case_file_(col, m):
    """case file, closed, waiting for the verdict, with the stamp and pad next to it"""
    at = Vector((TABLE.x + 0.34, TABLE.y + 0.14, TOP))
    rot = math.radians(-10)
    root = empty("static_interro_casefile", at, col, rot=(0, 0, rot))
    parts = [box("static_interro_casefile_back", (0.24, 0.31, 0.0015), (0, 0, 0.00075), col, m["manila"], bevel_w=0),
             box("static_interro_casefile_pages", (0.23, 0.3, 0.006), (0.002, -0.002, 0.0045), col, m["paper"], bevel_w=0.0008),
             box("static_interro_casefile_cover", (0.24, 0.31, 0.0015), (0, 0, 0.0083), col, m["manila"], bevel_w=0),
             box("static_interro_casefile_tab", (0.08, 0.02, 0.0015), (0.06, 0.163, 0.0083), col, m["manila"], bevel_w=0)]
    adopt(parts, root)
    # verdict lands here, the stamp's target and the browser's GUILTY print
    _marker("interro_decal_verdict", Matrix.Translation(at + Vector((0, 0, 0.0095))) @ Matrix.Rotation(rot, 4, "Z"), (0.24, 0.31), col)
    pad_at = at + Vector((0.2, -0.17, 0))
    pad = box("static_interro_inkpad", (0.1, 0.065, 0.012), (pad_at.x, pad_at.y, TOP + 0.006), col, m["knob"], bevel_w=0.003)
    felt = box("static_interro_inkpad_felt", (0.086, 0.052, 0.002), (pad_at.x, pad_at.y, TOP + 0.0125), col, m["red"], bevel_w=0)
    stamp = empty("dyn_interro_stamp", (pad_at.x, pad_at.y, TOP + 0.0135), col, rot=(0, 0, math.radians(12)))
    sp = [box("dyn_interro_stamp_rubber", (0.078, 0.042, 0.006), (0, 0, 0.003), col, m["rubber"], bevel_w=0.001),
          box("dyn_interro_stamp_mount", (0.082, 0.046, 0.014), (0, 0, 0.013), col, m["wood"], bevel_w=0.002),
          lathe("dyn_interro_stamp_handle", [(0.012, 0.02), (0.01, 0.05), (0.018, 0.075), (0.02, 0.088), (0.0, 0.098)], col, m["wood"],
                segments=32)]
    adopt(sp, stamp)
    return root, pad, felt, stamp


def ashtray_(col, m):
    at = Vector((TABLE.x - 0.42, TABLE.y - 0.22, TOP))
    tray = lathe("static_interro_ashtray", [(0.0, 0.0), (0.055, 0.0), (0.06, 0.018), (0.048, 0.02), (0.042, 0.006), (0.0, 0.006)], col,
                 M.polished_metal("ashtray", (0.4, 0.4, 0.4), 0.3, 0.05), loc=at, segments=48)
    butt = cylinder("static_interro_cigarette", 0.0035, 0.04, at + Vector((0.02, 0.0, 0.009)), col, M.paper("cig_paper", (0.85, 0.83, 0.78)),
                    rot=(0, math.radians(84), math.radians(30)), verts=12, bevel_w=0)
    return tray, butt
