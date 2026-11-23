"""Outside the office window: rain on the glass, the building across the street with its kannada
neon sign, lit by a sodium street lamp. the HDRI city shows above and around it.
"""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

import materials as M
from lib.common import box, collection, kelvin, mesh_object, plane, text, to_mesh, world_uvs
from procedural import office_shell as shell

rng = random.Random(1947)
STREET_X = 17.0  # facade across the street, ~12m from the window


def build(root):
    col = collection("office_exterior", root)
    rain_on_glass(col)
    facade(col)
    neon_sign(col)
    return col


def rain_on_glass(col, drops=1600, trails=110):
    """static droplets and running trails on the outside of the glass (the browser has its own shader
    version, this is the look-dev reference)
    """
    water = M.glass("rain_water", rough=0.0, ior=1.33)
    y0, y1, top = shell.WIN
    gx = shell.W + 0.02 + 0.02 + 0.004  # outer face of the glass
    # one template sphere copied into a single mesh in bulk (bmesh ops per drop scale badly)
    tmpl = bmesh.new()
    bmesh.ops.create_icosphere(tmpl, subdivisions=2, radius=1.0)
    t_verts = [v.co.copy() for v in tmpl.verts]
    t_faces = [[v.index for v in f.verts] for f in tmpl.faces]
    tmpl.free()
    verts, faces = [], []

    def drop(y, z, r, stretch=1.0):
        base = len(verts)
        cx = gx + r * 0.25
        verts.extend((cx + v.x * r * 0.45, y + v.y * r, z + v.z * r * stretch) for v in t_verts)
        faces.extend([i + base for i in f] for f in t_faces)

    for _ in range(drops):
        r = rng.choice((0.0012, 0.0016, 0.002, 0.0028, 0.0038, 0.005)) * rng.uniform(0.8, 1.2)
        drop(rng.uniform(y0 + 0.05, y1 - 0.05), rng.uniform(0.08, top - 0.08), r)
    for _ in range(trails):
        y = rng.uniform(y0 + 0.05, y1 - 0.05)
        z = rng.uniform(0.2, top - 0.2)
        length = rng.uniform(0.04, 0.22)
        for k in range(int(length / 0.004)):
            drop(y + math.sin(k * 0.3) * 0.0015, z - k * 0.004, 0.0016 * rng.uniform(0.8, 1.1), 2.2)
        drop(y, z + 0.004, 0.0042, 1.3)
    me = bpy.data.meshes.new("fx_rain_on_glass")
    me.from_pydata(verts, [], faces)
    me.shade_smooth()
    o = bpy.data.objects.new("fx_rain_on_glass", me)
    col.objects.link(o)
    me.materials.append(water)
    o.visible_shadow = False
    return o


def facade(col):
    wall = M.scanned("damaged_plaster", tile=3.0, val=0.18, sat=0.5, hue=0.52, macro=0.3, name="facade_plaster")
    f = box("fx_facade", (0.3, 16.0, 11.0), (STREET_X + 0.15, 2.0, 1.0), col, wall, bevel_w=0)
    world_uvs(f, 3.0)
    # a few lit and dark windows on the building across the street
    warm = M.emission("window_glow_warm", kelvin(2900), 0.55)
    tv = M.emission("window_glow_tv", (0.45, 0.6, 1.0), 0.3)
    dark = M.principled("window_dark", (0.004, 0.004, 0.005), 0.08)
    for row, z in enumerate((-1.6, 4.2)):
        for i, y in enumerate((-4.5, -1.5, 5.5, 8.5)):
            mat = rng.choice((warm, dark, dark, tv)) if (row, i) != (1, 2) else warm
            box(f"fx_facade_window_{row}_{i}", (0.05, 1.2, 1.4), (STREET_X - 0.02, y, z), col, mat, bevel_w=0)
    # sodium street lamp below, washes the facade orange
    lamp = bpy.data.lights.new("bake_street_lamp", "POINT")
    lamp.energy = 260
    lamp.use_temperature = True
    lamp.temperature = 2000
    lamp.shadow_soft_size = 0.2
    lo = bpy.data.objects.new("bake_street_lamp", lamp)
    lo.location = (STREET_X - 2.5, 7.5, -2.2)
    lo.visible_camera = False
    col.objects.link(lo)


def neon_sign(col):
    """ಕಾಫಿ / FILTER COFFEE in glass tubing on a black backplate (letter 0 stutters in the browser)"""
    red = M.neon("neon_red", (1.0, 0.16, 0.05), 32)
    amber = M.neon("neon_amber", (1.0, 0.55, 0.16), 20)
    plate = M.powder_coat("sign_backplate", (0.01, 0.01, 0.012), 0.5)
    y, z = 1.6, 1.9
    box("fx_neon_backplate", (0.08, 2.8, 1.5), (STREET_X - 0.08, y, z), col, plate, bevel_w=0.01)
    for name, body, size, zz, mat, font in (
        ("fx_neon_kannada", "ಕಾಫಿ", 0.85, z + 0.18, red, "NotoSansKannada.ttf"),
        ("fx_neon_english", "FILTER COFFEE", 0.24, z - 0.5, amber, "NotoSansKannada.ttf"),
    ):
        t = text(name, body, font, size, col, mat, bevel_depth=0.009 if size > 0.5 else 0.006, fill="NONE")
        t.data.resolution_u = 6
        t.data.bevel_resolution = 3
        t.location = (STREET_X - 0.14, y, zz)
        # face the office window (-X): text plane XZ, reading towards -Y from the window
        t.rotation_euler = (math.radians(90), 0, math.radians(-90))
