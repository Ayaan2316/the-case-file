"""Shared helpers for the blender scripts: paths, scene/GPU setup, geometry, UVs, imports.

Conventions: metres, Z-up in blender (gltf export flips to Y-up), object names start with
`static_` (baked), `dyn_` (animated/clickable in the browser) or `fx_` (effects).
"""
import math
import os
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ASSETS = os.path.join(REPO, "assets-src")
PH = os.path.join(ASSETS, "polyhaven")
FONTS = os.path.join(ASSETS, "fonts")
SCENES = os.path.join(REPO, "blender", "scenes")
SHOTS = os.path.join(REPO, "screenshots", "blender")

rng = random.Random(2316)


# ---------------------------------------------------------------- scene / render

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    return scene


def enable_gpu(scene):
    """cycles on the RTX via OptiX (CUDA fallback). won't silently fall back to CPU"""
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        prefs.refresh_devices()
        gpus = [d for d in prefs.devices if d.type == kind]
        if gpus:
            for d in prefs.devices:
                d.use = d.type == kind
            scene.render.engine = "CYCLES"
            scene.cycles.device = "GPU"
            print(f"[gpu] Cycles on {kind}: {', '.join(d.name for d in gpus)}")
            return kind
    raise SystemExit("[gpu] No OptiX/CUDA device visible to Cycles. Stopping (spec rule 10).")


def collection(name, parent=None):
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    parent = parent or bpy.context.scene.collection
    if col.name not in parent.children:
        parent.children.link(col)
    return col


def link(obj, col):
    for c in obj.users_collection:
        c.objects.unlink(obj)
    col.objects.link(obj)
    return obj


def kelvin(t):
    """rough blackbody RGB (linear) for a colour temperature in kelvin"""
    t = t / 100.0
    if t <= 66:
        r = 255
        g = 99.4708025861 * math.log(t) - 161.1195681661
        b = 0 if t <= 19 else 138.5177312231 * math.log(t - 10) - 305.0447927307
    else:
        r = 329.698727446 * ((t - 60) ** -0.1332047592)
        g = 288.1221695283 * ((t - 60) ** -0.0755148492)
        b = 255
    srgb = [min(max(c, 0), 255) / 255 for c in (r, g, b)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


# ---------------------------------------------------------------- mesh building

def mesh_object(name, bm, col, mat=None, smooth=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    col.objects.link(obj)
    if mat:
        obj.data.materials.append(mat)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return obj


def bevel(obj, width=0.003, segments=3, angle=35):
    """bevel every hard edge, perfectly sharp CG edges are the biggest giveaway"""
    mod = obj.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(angle)
    mod.harden_normals = True
    mod.miter_outer = "MITER_ARC"
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def box(name, size, loc, col, mat=None, rot=(0, 0, 0), bevel_w=0.003, segments=3):
    """axis aligned box of `size` (x, y, z) centred at `loc`"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    obj = mesh_object(name, bm, col, mat)
    obj.location = loc
    obj.rotation_euler = rot
    if bevel_w:
        bevel(obj, bevel_w, segments)
    return obj


def cylinder(name, radius, depth, loc, col, mat=None, rot=(0, 0, 0), verts=48, bevel_w=0.002, cap=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, segments=verts, radius1=radius, radius2=radius, depth=depth)
    obj = mesh_object(name, bm, col, mat, smooth=True)
    obj.location = loc
    obj.rotation_euler = rot
    if bevel_w:
        bevel(obj, bevel_w, 2)
    return obj


def lathe(name, profile, col, mat=None, loc=(0, 0, 0), segments=64, rot=(0, 0, 0)):
    """revolve a 2D profile [(r, z), ...] around Z. profile goes bottom to top"""
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0, z)) for r, z in profile]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau,
                   steps=segments, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = mesh_object(name, bm, col, mat, smooth=True)
    obj.location = loc
    obj.rotation_euler = rot
    return obj


def plane(name, size, loc, col, mat=None, rot=(0, 0, 0), subdiv=0):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=max(1, subdiv), y_segments=max(1, subdiv), size=0.5)
    bmesh.ops.scale(bm, vec=(size[0], size[1], 1), verts=bm.verts)
    obj = mesh_object(name, bm, col, mat)
    obj.location = loc
    obj.rotation_euler = rot
    return obj


def curve_tube(name, points, radius, col, mat=None, resolution=12, cyclic=False):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 4
    cu.resolution_u = resolution
    sp = cu.splines.new("NURBS" if len(points) > 3 else "POLY")
    sp.points.add(len(points) - 1)
    for p, co in zip(sp.points, points):
        p.co = (*co, 1)
    sp.use_endpoint_u = True
    sp.order_u = min(4, len(points))
    sp.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, cu)
    col.objects.link(obj)
    if mat:
        obj.data.materials.append(mat)
    return obj


def text(name, body, font_file, size, col, mat=None, extrude=0.0, align="CENTER", bevel_depth=0.0,
         fill="BOTH", spacing=1.0, resolution=3):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.font = bpy.data.fonts.load(os.path.join(FONTS, font_file), check_existing=True)
    cu.size = size
    cu.extrude = extrude
    cu.bevel_depth = bevel_depth
    cu.align_x = align
    cu.align_y = "CENTER"
    cu.fill_mode = fill
    cu.space_character = spacing
    # small typed labels at full curve resolution end up ~100k triangles each
    cu.resolution_u = resolution
    obj = bpy.data.objects.new(name, cu)
    col.objects.link(obj)
    if mat:
        obj.data.materials.append(mat)
    return obj


def to_mesh(obj):
    """convert a curve/text object to a mesh in place (keeps name, materials, transform)"""
    deps = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(deps))
    new = bpy.data.objects.new(obj.name, me)
    new.matrix_world = obj.matrix_world
    for c in obj.users_collection:
        c.objects.link(new)
    bpy.data.objects.remove(obj)
    return new


def parent(children, root):
    for c in children:
        mw = c.matrix_world.copy()
        c.parent = root
        c.matrix_parent_inverse = root.matrix_world.inverted()
        c.matrix_world = mw
    return root


def adopt(children, root):
    """parent freshly built parts whose transforms are already local to root"""
    for c in children:
        c.parent = root
    return root


def empty(name, loc, col, rot=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    e.rotation_euler = rot
    e.empty_display_size = 0.1
    col.objects.link(e)
    return e


# ---------------------------------------------------------------- UVs in real world metres

def world_uvs(obj, tile=1.0, layer="UVMap"):
    """box projected UVs in metres / tile so texel density is the same everywhere.
    each face is projected along its dominant normal axis
    """
    bpy.context.view_layer.update()
    me = obj.data
    if layer not in me.uv_layers:
        me.uv_layers.new(name=layer)
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv[layer]
    mw = obj.matrix_world
    rot = mw.to_3x3()
    for f in bm.faces:
        n = (rot @ f.normal).normalized()
        ax = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            w = mw @ loop.vert.co
            if ax == 0:
                u, v = (w.y if n.x < 0 else -w.y), w.z
            elif ax == 1:
                u, v = (-w.x if n.y < 0 else w.x), w.z
            else:
                u, v = w.x, w.y
            loop[uv].uv = (u / tile, v / tile)
    bm.to_mesh(me)
    bm.free()
    return obj


# ---------------------------------------------------------------- poly haven imports

def append_model(asset_id, col, names=None, exclude=("LOD1", "LOD2", "hlp_", "wdg_", "cur_")):
    """append a downloaded poly haven model. returns the new objects (unparented roots get parented
    to a `dyn_<id>` empty at the origin)
    """
    path = os.path.join(PH, "models", asset_id, f"{asset_id}_2k.blend")
    with bpy.data.libraries.load(path, link=False) as (src, dst):
        wanted = names or [n for n in src.objects if not any(x in n for x in exclude)]
        dst.objects = wanted
    objs = [o for o in dst.objects if o is not None]
    for o in objs:
        col.objects.link(o)
    return objs


def place(objs, name, loc, col, rot=(0, 0, 0), scale=1.0, origin=None):
    """group appended objects under an empty, optionally re-centring them on `origin` first"""
    root = empty(name, (0, 0, 0), col)
    roots = [o for o in objs if o.parent is None or o.parent not in objs]
    if origin is not None:
        for o in roots:
            o.location -= Vector(origin)
    parent(roots, root)
    root.location = loc
    root.rotation_euler = rot
    root.scale = (scale, scale, scale)
    return root


def bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    bpy.context.view_layer.update()
    for o in objs:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
    return lo, hi


def floor_origin(objs):
    """origin at the bottom centre of the combined bounds (for placing stuff on surfaces)"""
    lo, hi = bounds(objs)
    return Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))


def rest_on(root, z):
    """move a placed group so its lowest point is exactly at height z"""
    bpy.context.view_layer.update()
    kids = [o for o in root.children_recursive if o.type == "MESH"]
    lo, _ = bounds(kids)
    root.location.z += z - lo.z
    return root


def look_at(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def apply_matrix(obj, m: Matrix):
    obj.data.transform(m)
