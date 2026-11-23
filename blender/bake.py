"""Bakes the look-dev scene into groups the browser can use.

Usage: pnpm blender bake.py [-- --quick] [--only office_shell,office_props]
Reads blender/scenes/case_file.blend, writes blender/scenes/case_file_baked.blend and all the
baked images into blender/bakes/. export.py turns the result into GLBs.

Groups
- tiling ("shell"): big surfaces keep tiling textures. each material gets re-baked as one tile
  (albedo / normal / ORM) so the gltf exporter can carry it, and the group gets one lightmap
- atlas: everything else that's opaque shares one UV atlas per group with baked albedo, normal,
  ORM (R=AO, G=roughness, B=metallic) and a lightmap on the same UV
- glass / emissive / fx: split out, simple factor materials, no lightmap

Speed: cycles re-syncs the scene for every object it bakes (~4s each), so each group gets flattened
to world space, every face tagged with a bucket id, joined into ONE mesh, baked once per pass and
then split back into buckets - one static mesh per group plus every moving `dyn_*` piece, each
put back on its original pivot.
"""
import json
import math
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix  # noqa: E402

from lib import common  # noqa: E402

BAKES = os.path.join(common.REPO, "blender", "bakes")
ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
QUICK = "--quick" in ARGV
ONLY = ARGV[ARGV.index("--only") + 1].split(",") if "--only" in ARGV else None
RGBM_RANGE = 16.0
RGBM_FLOOR = 16 / 255  # everything below 1.0 shares one multiplier, see to_rgbm
BUCKET = "case_bucket"
TEXEL = "case_texel"
PREUV = "case_preuv"  # faces with their own UV layout (scans, typed text), no smart project
# texel density weight by root name, hero surfaces get a bigger share of their group's
# lightmap / atlas (everything gets renormalised when the islands are packed)
TEXEL_WEIGHT = {r"^static_feature_wall$": 1.6, r"^static_desk_chair$": 1.8, r"^static_desk_top$": 1.5,
                r"^static_string_": 3.0, r"^static_pin_": 2.0, r"^static_evidence_board": 1.3,
                r"^dyn_typewriter": 1.8, r"^dyn_telephone": 1.6, r"^dyn_radio": 1.4, r"^dyn_case_folder": 1.3,
                r"^static_books_": 0.6,
                # evidence room: the overhead camera reads the bag labels, tags and log
                r"^static_evid_bag_": 2.6, r"^static_evid_log$": 2.4, r"^static_evid_(shelves|box)_": 0.45,
                # the steel top mirrors the lamp and its lightmap gates that highlight around every bag's shadow,
                # so coarse texels show up as blocks in the reflection
                r"^static_evid_table_top$": 3.0,
                r"^static_interro_(recorder|casefile|transcript)": 1.8, r"^dyn_interro_(reel|stamp)": 1.6,
                r"^static_interro_(cctv|door|exit)": 0.6,
                r"^static_evid_(cctv|door|exit)": 0.6}
# room volumes the camera can ever be in (blender metres, wall thickness included). faces whose
# front opens outside all of them (outer walls, roof, slab) get no lightmap space
ROOMS = [((-0.14, -0.14, -0.01), (5.14, 4.14, 3.37)),  # office, up to the cove slot
         ((-0.14, -8.14, -0.01), (1.94, 0.0, 3.05)),  # corridor
         ((-0.14, 29.86, -0.01), (4.34, 33.74, 3.1)),  # evidence room
         ((-0.14, 39.86, -0.01), (4.14, 43.74, 3.0))]  # interrogation room
# displaced heightfield surfaces get a flat lightmap projection: material -> world axes (u, v)
PLANAR = {"office_feature_wall": (0, 2)}
# scans that are way denser than the browser needs, decimate ratio by root name
DECIMATE = {r"^static_books_": 0.15, r"^static_floor_plant$": 0.2, r"^static_corr_box_": 0.3,
            r"^static_pocket_watch$": 0.3, r"^static_spectacles$": 0.4, r"^static_corr_socket_": 0.3,
            r"^dyn_ceiling_fan$": 0.5, r"^static_credenza$": 0.35, r"^static_desk_chair$": 0.7, r"^static_reading_chair$": 0.4,
            r"^static_shelf_(multimeter|succulent|frame|binder)$": 0.4, r"^dyn_wall_clock$": 0.5,
            r"^static_evid_box_\d+$": 0.25, r"^static_evid_shelves_": 0.5, r"^static_evid_cctv$": 0.4,
            r"^static_evid_lamp$": 0.5}

GROUPS = {
    # the dim lower half of the relief wall is where bake noise shows, so double samples there
    "office_shell": dict(kind="tiling", cols=["office_shell"], lm=2048, samples=2048,
                         exclude=r"^(static_blind|fx_|static_spot_)"),
    "office_blinds": dict(kind="tiling", cols=["office_shell"], match=r"^static_blind", lm=512),
    # across the street, outside every room on purpose so no unseen face culling
    "office_exterior": dict(kind="tiling", cols=["office_exterior"], match=r"^fx_(facade$|neon_backplate)", lm=1024,
                            cull=False),
    "office_furniture": dict(kind="atlas", cols=["office_furniture", "office_shell"], atlas=2048, lm=1024,
                             exclude=r"^(static_wall|static_ceiling|static_cove|static_skirting|static_window|static_shelf_\d|static_feature|static_rug|static_office_floor|static_track|static_blind|fx_)"),
    "office_props": dict(kind="atlas", cols=["office_props"], atlas=2048, lm=1024),
    "corridor_shell": dict(kind="tiling", cols=["corridor_build"], lm=1024,
                           match=r"^static_corr_(floor|slab|ceiling|left|right|far|end)"),
    "corridor_dressing": dict(kind="atlas", cols=["corridor_build"], atlas=1024, lm=1024,
                              exclude=r"^(static_corr_(floor|slab|ceiling|left|right|far|end)|fx_)"),
    "evidence_shell": dict(kind="tiling", cols=["evidence_build"], lm=1024,
                           match=r"^static_evid_(floor|slab|ceiling|wall_|cove_)"),
    "interro_shell": dict(kind="tiling", cols=["interro_build"], lm=1024,
                          match=r"^static_interro_(floor|slab|ceiling|wall_|cove_)"),
    "interro_props": dict(kind="atlas", cols=["interro_build"], atlas=2048, lm=1024,
                          exclude=r"^(static_interro_(floor|slab|ceiling|wall_|cove_)|fx_)"),
    "evidence_props": dict(kind="atlas", cols=["evidence_build"], atlas=2048, lm=2048,
                           exclude=r"^(static_evid_(floor|slab|ceiling|wall_|cove_)|fx_)"),
}

# static roots with parts the browser replaces. baked (so the contact shadows land on the cork)
# but exported as their own mesh, which EvidenceBoard.tsx hides
STATIC_SPLITS = {"static_evidence_board": [("dyn_board_pieces", r"^(dyn_polaroid_|static_pin_|static_string_)")]}

# animated props split into separately moving meshes: root -> [(bucket name, regex on part name)].
# parts that match nothing stay in the root's main mesh, bucket "drop" deletes the part
SPLITS = {
    "dyn_typewriter": [("drop", r"headline"), ("dyn_typewriter_paper", r"_paper$"),
                       ("dyn_typewriter_carriage", r"platen|knob|_rail$|bail|return_lever"),
                       ("dyn_typewriter_key_{0}_{1}", r"_(?:stem|key|keyring|legend)_(\d+)_(\d+)$"),
                       ("dyn_typewriter_spacebar", r"spacebar")],
    "dyn_telephone": [("dyn_telephone_handset", r"handset|earpiece|mouthpiece"),
                      ("dyn_telephone_dial", r"dial|fingerwheel|fingerstop")],
    "dyn_bankers_lamp": [("dyn_bankers_lamp_shade", r"shade$")],
    "dyn_radio": [("dyn_radio_needle", r"needle"), ("dyn_radio_dial", r"dial_scale|_tick_")],
    "dyn_case_folder": [("dyn_case_folder_polaroid", r"polaroid"),
                        ("dyn_case_folder_front", r"_front$|_label|_classified|coffee_ring|paperclip")],
    "dyn_esp32": [("dyn_esp32_led", r"_led$")],
    "dyn_rubber_stamp_set": [("dyn_rubber_stamp", r"stamp_(block|rubber|handle)")],
    "dyn_desk_calendar": [("drop", r"dyn_calendar_(?!leaf|spine)"), ("dyn_desk_calendar_face", r"leaf_-1$")],
    "dyn_ceiling_fan": [("dyn_ceiling_fan_blades", r"blades")],
    # gold leaf + its shade get their own pieces so the browser can draw them crisp just in front of
    # the frosted glass (behind it the glass blur would smear them)
    "dyn_office_door": [("dyn_office_door_lettering_shade", r"lettering_shade"),
                        ("dyn_office_door_lettering", r"lettering")],
    "dyn_wall_clock": [("dyn_wall_clock_hour", r"hours_hand"), ("dyn_wall_clock_minute", r"minute_hand"),
                       ("dyn_wall_clock_second", r"second_hand")],
}


def log(msg):
    print(f"[bake] {msg}", flush=True)


# ---------------------------------------------------------------- preparation

def prepare(scene):
    """real meshes with modifiers applied, single user data, drop look-dev only stuff"""
    # lights the browser runs live (swinging lamp) stay out of the lightmaps
    for o in bpy.data.objects:
        if o.type == "LIGHT" and o.get("case_realtime"):
            o.hide_render = True
    for o in list(bpy.data.objects):
        if o.name.startswith(("fx_haze", "fx_corridor_haze", "fx_rain_on_glass")):
            bpy.data.objects.remove(o)
    targets = [o for o in scene.objects if o.type in {"MESH", "CURVE", "FONT"}]
    for o in targets:
        o.hide_set(False)
        o.hide_viewport = False
    with bpy.context.temp_override(selected_editable_objects=targets, selected_objects=targets, active_object=targets[0]):
        bpy.ops.object.make_single_user(object=True, obdata=True, material=False)
    wall = bpy.data.objects.get("static_feature_wall")
    if wall:
        mat = wall.active_material
        disp = next((n for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and "disp" in n.image.name), None)
        tex = bpy.data.textures.new("feature_disp", "IMAGE")
        tex.image = disp.image
        mod = wall.modifiers.new("disp", "DISPLACE")
        mod.texture = tex
        mod.texture_coords = "UV"
        mod.uv_layer = "UVMap"
        mod.strength = 0.016
        mod.mid_level = 0.5
        wall.modifiers.new("decimate", "DECIMATE").ratio = 0.18
    for o in targets:
        top = _top(o).name
        ratio = next((r for pat, r in DECIMATE.items() if re.search(pat, top)), None)
        if ratio and o.type == "MESH":
            o.modifiers.new("decimate", "DECIMATE").ratio = ratio
    for m in bpy.data.materials:
        if getattr(m, "displacement_method", None) == "BOTH":
            m.displacement_method = "BUMP"
    for o in targets:
        if o.type == "FONT":
            o["case_text"] = 1  # survives the conversion below, flatten_and_join lays it out flat
    with bpy.context.temp_override(selected_editable_objects=targets, selected_objects=targets, active_object=targets[0]):
        bpy.ops.object.convert(target="MESH")
    for o in list(bpy.data.objects):
        if o.name.startswith("cutter_") or (o.type == "MESH" and len(o.data.polygons) == 0):
            bpy.data.objects.remove(o)
    log(f"prepared {len(targets)} objects")


def _top(o):
    while o.parent is not None:
        o = o.parent
    return o


def collect(group, taken):
    cfg = GROUPS[group]
    pat = re.compile(cfg["match"]) if "match" in cfg else None
    exc = re.compile(cfg["exclude"]) if "exclude" in cfg else None
    objs = []
    for cname in cfg["cols"]:
        col = bpy.data.collections.get(cname)
        if not col:
            continue
        for o in col.all_objects:
            # an earlier group's baked result (e.g. static_office_shell) is in the same collection under
            # a new name, never bake it twice
            if o.type != "MESH" or o.name in taken or "case_group" in o:
                continue
            top = _top(o)
            if (pat and not pat.search(top.name)) or (exc and exc.search(top.name)):
                continue
            objs.append(o)
            taken.add(o.name)
    return objs


GLASS = {"window_glass", "frosted_glass", "rain_water", "evidence_bag", "bulb_glass", "dial_glass",
         "corr_window_glass", "bankers_green_glass", "opal_glass", "window_dark"}


def is_transparent(mat):
    if mat is None:
        return False
    # picture frame panes ("*_glass") were getting baked opaque over their artwork
    if mat.name.split(".")[0] in GLASS or mat.name.split(".")[0].lower().endswith("_glass"):
        return True
    if not mat.use_nodes:
        return False
    for n in mat.node_tree.nodes:
        # glass BSDF panes baked opaque would cover what's behind them. (not transparent BSDF - scans
        # use that for alpha cutouts, e.g. potted_plant_02's leaves)
        if n.type in {"BSDF_GLASS", "BSDF_REFRACTION"}:
            return True
        if n.type == "BSDF_PRINCIPLED":
            t, a = n.inputs["Transmission Weight"], n.inputs["Alpha"]
            if not t.is_linked and t.default_value > 0.5:
                return True
            if not a.is_linked and a.default_value < 0.9:
                return True
            if a.is_linked and "alpha" in getattr(getattr(a.links[0].from_node, "image", None), "name", "").lower():
                return True
    return False


def is_emissive(mat):
    if mat is None or not mat.use_nodes:
        return False
    for n in mat.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            s, c = n.inputs["Emission Strength"], n.inputs["Emission Color"].default_value
            if not s.is_linked and s.default_value > 0.5 and max(c[:3]) > 0.05:
                return True
    return False


def split_special(objs):
    """peel glass and emissive faces off into their own objects (no atlas, no lightmap)"""
    keep, special = [], []
    for o in objs:
        flags = [is_transparent(s.material) or is_emissive(s.material) for s in o.material_slots]
        if not any(flags):
            keep.append(o)
        elif all(flags):
            special.append(o)
        else:
            bpy.ops.object.select_all(action="DESELECT")
            o.select_set(True)
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.mode_set(mode="EDIT")
            bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.mesh.separate(type="MATERIAL")
            bpy.ops.object.mode_set(mode="OBJECT")
            for part in bpy.context.selected_objects:
                m = part.material_slots[0].material if part.material_slots else None
                (special if (is_transparent(m) or is_emissive(m)) else keep).append(part)
    return keep, special


# ---------------------------------------------------------------- buckets

def root_name(o):
    return _top(o).name.removeprefix("__root_")


def bucket_of(o, group):
    top = root_name(o)
    if not top.startswith("dyn_"):
        for out, pat in STATIC_SPLITS.get(top, []):
            if re.search(pat, o.name):
                return out
        return f"static_{group}"
    for out, pat in SPLITS.get(top, []):
        m = re.search(pat, o.name)
        if m:
            return out.format(*m.groups()) if m.groups() else out
    return top


def pivot_of(o):
    """moving pieces rotate/move around their nearest empty parent (door hinge, fan centre, clock axis,
    handset centre). statics stay in world space
    """
    if not root_name(o).startswith("dyn_"):
        return Matrix.Identity(4)
    p = o.parent
    while p is not None and p.type != "EMPTY":
        p = p.parent
    return (p or o).matrix_world.copy()


def _is_scan(o):
    """poly haven models come with clean UVs. smart projecting a decimated scan shatters it into
    thousands of crumbs that each cost packing margin
    """
    if not o.data.uv_layers:
        return False
    for slot in o.material_slots:
        m = slot.material
        for n in (m.node_tree.nodes if m and m.use_nodes else []):
            if n.type == "TEX_IMAGE" and n.image and "/models/" in n.image.filepath.replace("\\", "/"):
                return True
    return False


def _flat_text(me):
    """typed labels: keep the glyph fronts (the 0.2mm extrusion isn't visible) and lay them out flat
    in the text's own plane, one island per glyph
    """
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z < 0.5], context="FACES")
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for loop in f.loops:
            loop[uv].uv = (loop.vert.co.x, loop.vert.co.y)
    bm.to_mesh(me)
    bm.free()


def flatten_and_join(group, objs, uv_names):
    """world space, tagged with bucket ids, one shared UV layout, joined into one mesh"""
    buckets, pivots, of, weight = [], {}, {}, {}
    for o in objs:
        names = (o.name, _top(o).name)  # own name first, the yarn hangs under the board's root
        weight[o.name] = next((w for n in names for pat, w in TEXEL_WEIGHT.items() if re.search(pat, n)), 1.0)
        b = bucket_of(o, group)
        if b == "drop":
            continue
        of[o.name] = b
        if b not in buckets:
            buckets.append(b)
            pivots[b] = pivot_of(o)
    dropped = [o for o in objs if o.name not in of]
    objs = [o for o in objs if o.name in of]
    for o in dropped:
        bpy.data.objects.remove(o)
    # free up the bucket names, the original root empties are called e.g. "dyn_typewriter"
    for e in bpy.data.objects:
        if e.type == "EMPTY" and e.name in buckets:
            e.name = f"__root_{e.name}"
    for o in objs:
        b = buckets.index(of[o.name])
        mw = o.matrix_world.copy()
        o.parent = None
        # instanced meshes (the blind slats share one) would get every user's transform stacked
        if o.data.users > 1:
            o.data = o.data.copy()
        if o.get("case_text"):
            _flat_text(o.data)
        pre = 1 if o.get("case_text") or _is_scan(o) else 0
        o.data.transform(mw)
        o.matrix_world = Matrix.Identity(4)
        me = o.data
        attr = me.attributes.get(BUCKET) or me.attributes.new(BUCKET, "INT", "FACE")
        attr.data.foreach_set("value", [b] * len(me.polygons))
        tex = me.attributes.get(TEXEL) or me.attributes.new(TEXEL, "FLOAT", "FACE")
        tex.data.foreach_set("value", [weight[o.name]] * len(me.polygons))
        pa = me.attributes.get(PREUV) or me.attributes.new(PREUV, "INT", "FACE")
        pa.data.foreach_set("value", [pre] * len(me.polygons))
        uvs = me.uv_layers
        if not len(uvs):
            common.world_uvs(o, 1.0)
        uvs[0].name = "UVMap"
        uvs[0].active_render = True
        for layer in [l for l in uvs if l.name != "UVMap"]:
            uvs.remove(layer)
        for name in uv_names:
            if name not in uvs:
                uvs.new(name=name)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = f"__bake_{group}"
    return joined, buckets, pivots


def split_buckets(joined, buckets, pivots, group):
    """split the baked mesh back into its buckets and restore each moving piece's pivot"""
    made = []
    for b_index in range(len(buckets) - 1, 0, -1):
        bpy.ops.object.select_all(action="DESELECT")
        joined.select_set(True)
        bpy.context.view_layer.objects.active = joined
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.context.tool_settings.mesh_select_mode = (False, False, True)
        bm = bmesh.from_edit_mesh(joined.data)
        layer = bm.faces.layers.int.get(BUCKET)
        for f in bm.faces:
            f.select_set(False)
        any_sel = False
        for f in bm.faces:
            if f[layer] == b_index:
                f.select_set(True)
                any_sel = True
        bm.select_flush_mode()
        bmesh.update_edit_mesh(joined.data)
        if any_sel:
            bpy.ops.mesh.separate(type="SELECTED")
        bpy.ops.object.mode_set(mode="OBJECT")
        if any_sel:
            part = [o for o in bpy.context.selected_objects if o is not joined][0]
            made.append((buckets[b_index], part))
    made.append((buckets[0], joined))
    out = []
    for name, o in made:
        o.name = name
        o.data.name = name
        pv = pivots[name]
        o.data.transform(pv.inverted())
        o.matrix_world = pv
        o["case_group"] = group
        for a in (BUCKET, TEXEL, PREUV):
            if a in o.data.attributes:
                o.data.attributes.remove(o.data.attributes[a])
        out.append(o)
    return out


# ---------------------------------------------------------------- images and passes

def new_image(name, size, float_buffer=False, non_color=False):
    img = bpy.data.images.get(name)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=float_buffer)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


def target_image(objs, img):
    for o in objs:
        for slot in o.material_slots:
            m = slot.material
            if not m or not m.use_nodes:
                continue
            node = m.node_tree.nodes.get("__bake_target") or m.node_tree.nodes.new("ShaderNodeTexImage")
            node.name = "__bake_target"
            node.image = img
            m.node_tree.nodes.active = node


def bake(objs, kind, img, uv, samples, pass_filter=None, margin=8, **kw):
    bpy.context.scene.cycles.samples = samples
    target_image(objs, img)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    t0 = time.time()
    args = dict(type=kind, margin=margin, use_clear=True, target="IMAGE_TEXTURES", uv_layer=uv, **kw)
    if pass_filter:
        args["pass_filter"] = pass_filter
    bpy.ops.object.bake(**args)
    log(f"  {kind:9} {img.name} {img.size[0]}px in {time.time() - t0:.1f}s")
    return img


def as_emission(objs, socket_name):
    """temporarily route a principled input to an emission shader so EMIT bakes it exactly"""
    saved, seen = [], set()
    for o in objs:
        for slot in o.material_slots:
            m = slot.material
            if not m or not m.use_nodes or m.name in seen:
                continue
            seen.add(m.name)
            nt = m.node_tree
            out = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output), None)
            if not out:
                continue
            bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
            em = nt.nodes.get("__emit") or nt.nodes.new("ShaderNodeEmission")
            em.name = "__emit"
            em.inputs["Strength"].default_value = 1.0
            for l in list(em.inputs["Color"].links):
                nt.links.remove(l)
            if bsdf is None:
                em.inputs["Color"].default_value = (0.5, 0.5, 0.5, 1) if socket_name == "Base Color" else (0, 0, 0, 1)
            else:
                src = bsdf.inputs[socket_name]
                if src.is_linked:
                    nt.links.new(src.links[0].from_socket, em.inputs["Color"])
                else:
                    v = src.default_value
                    em.inputs["Color"].default_value = tuple(v) if hasattr(v, "__len__") else (v, v, v, 1)
            prev = out.inputs["Surface"].links[0].from_socket if out.inputs["Surface"].is_linked else None
            saved.append((nt, out, prev))
            nt.links.new(em.outputs[0], out.inputs["Surface"])
    return saved


def restore(saved):
    for nt, out, prev in saved:
        if prev is not None:
            nt.links.new(prev, out.inputs["Surface"])


def save(img, name, fmt="PNG"):
    os.makedirs(BAKES, exist_ok=True)
    path = os.path.join(BAKES, f"{name}.{'exr' if fmt == 'OPEN_EXR' else 'png'}")
    img.filepath_raw = path
    img.file_format = fmt
    img.save()
    return path


def to_rgbm(img, name):
    """linear HDR lightmap -> RGBM png: rgb/M (sqrt encoded for precision in the darks) with M in alpha,
    range RGBM_RANGE. decoded in lib/materials.ts
    """
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[..., :3] / RGBM_RANGE
    # M never goes below RGBM_FLOOR. with M at 1-2/255 in dark areas, a half step block compression
    # error in alpha swung brightness by +-50% (blotchy camo pattern in the browser)
    m = np.clip(np.max(px, axis=2, keepdims=True), RGBM_FLOOR, 1.0)
    m = np.ceil(m * 255.0) / 255.0
    rgb = np.clip(px / m, 0, 1)
    out = np.concatenate([np.sqrt(rgb), m], axis=2)
    png = bpy.data.images.new(f"{name}_rgbm", w, h, alpha=True)
    png.colorspace_settings.name = "Non-Color"
    png.alpha_mode = "CHANNEL_PACKED"
    png.pixels[:] = out.ravel()
    return save(png, f"{name}_lm")


def unwrap(obj, layer, margin, cull=True):
    obj.data.uv_layers.active = obj.data.uv_layers[layer]
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bm = bmesh.from_edit_mesh(obj.data)
    pre = bm.faces.layers.int.get(PREUV)
    for f in bm.faces:
        f.select = not (pre and f[pre])
    todo = sum(f.select for f in bm.faces)
    bmesh.update_edit_mesh(obj.data)
    if todo:  # only faces without a usable layout of their own
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, area_weight=0.0,
                                 correct_aspect=True, scale_to_bounds=False)
    broken = _select_slivers(obj, layer)
    if broken:  # decimation tore some scan UVs into slivers, unwrap just those again
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, area_weight=0.0,
                                 correct_aspect=True, scale_to_bounds=False)
    log(f"  uv: smart-projected {todo}/{len(bm.faces)} faces (+{broken} torn scan faces), the rest keep their own layout")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()  # scans and text come in their own units
    flatten_islands(obj, layer)
    weight_islands(obj, layer, cull)
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)  # selected faces only
    bpy.ops.object.mode_set(mode="OBJECT")


def _select_slivers(obj, layer):
    """select only the faces of islands with area under 0.5% of their longest side squared - torn
    near-zero slivers whose huge bounding box the packer would otherwise reserve
    """
    from bpy_extras import bmesh_utils

    bm = bmesh.from_edit_mesh(obj.data)
    uv = bm.loops.layers.uv[layer]
    for f in bm.faces:
        f.select = False
    n = 0
    for island in bmesh_utils.bmesh_linked_uv_islands(bm, uv):
        us = [loop[uv].uv for f in island for loop in f.loops]
        side = max(max(u.x for u in us) - min(u.x for u in us), max(u.y for u in us) - min(u.y for u in us))
        if side > 1e-4 and sum(_uv_area(f, uv) for f in island) < 0.005 * side * side:
            for f in island:
                f.select = True
            n += len(island)
    bmesh.update_edit_mesh(obj.data)
    return n


def _uv_area(face, uv):
    pts = [l[uv].uv for l in face.loops]
    return abs(sum(a.x * b.y - b.x * a.y for a, b in zip(pts, pts[1:] + pts[:1]))) / 2


def flatten_islands(obj, layer):
    """displaced surfaces (relief wall) fall apart into hundreds of tiny smart project islands and every
    island edge shows up as a lightmap seam in the browser. project them flat instead: one island,
    same texel density as everything else
    """
    bm = bmesh.from_edit_mesh(obj.data)
    uv = bm.loops.layers.uv[layer]
    slots = {i: s.material.name for i, s in enumerate(obj.material_slots) if s.material}
    for mat, (a, b) in PLANAR.items():
        faces = [f for f in bm.faces if slots.get(f.material_index) == mat]
        area = sum(f.calc_area() for f in faces)
        if not area:
            continue
        k = math.sqrt(sum(_uv_area(f, uv) for f in faces) / area)
        for f in faces:
            for l in f.loops:
                l[uv].uv = (l.vert.co[a] * k, l.vert.co[b] * k)
        log(f"  uv: {mat} projected flat ({len(faces)} faces)")
    bmesh.update_edit_mesh(obj.data)


def _seen_from_a_room(face):
    p = face.calc_center_median() + face.normal * 0.03
    return any(all(lo[i] <= p[i] <= hi[i] for i in range(3)) for lo, hi in ROOMS)


def weight_islands(obj, layer, cull=True):
    """scale UV islands before packing, hero surfaces go up (TEXEL_WEIGHT). faces nobody can see (front
    opens outside every room) and degenerate ones collapse to a point and skip packing, so they cost
    no texels or margin
    """
    from bpy_extras import bmesh_utils

    bm = bmesh.from_edit_mesh(obj.data)
    uv = bm.loops.layers.uv[layer]
    tex = bm.faces.layers.float.get(TEXEL)
    # degenerate faces (zero area decimation leftovers) go too, their UVs can be a line across the
    # whole map that shrinks everything else
    hidden = [f for f in bm.faces if f.calc_area() < 1e-11 or (cull and not _seen_from_a_room(f))]
    for f in hidden:
        f.select = False
        for loop in f.loops:
            loop[uv].uv = (0.0, 0.0)
    islands = 0
    for island in bmesh_utils.bmesh_linked_uv_islands(bm, uv):
        if not any(f.select for f in island):
            continue
        islands += 1
        s = max(f[tex] for f in island) if tex else 1.0
        if s == 1.0:
            continue
        loops = [loop for f in island for loop in f.loops]
        cx = sum(loop[uv].uv.x for loop in loops) / len(loops)
        cy = sum(loop[uv].uv.y for loop in loops) / len(loops)
        for loop in loops:
            loop[uv].uv = (cx + (loop[uv].uv.x - cx) * s, cy + (loop[uv].uv.y - cy) * s)
    bmesh.update_edit_mesh(obj.data)
    log(f"  uv: {islands} islands to pack, {len(hidden)}/{len(bm.faces)} faces unseen or degenerate")


def denoise(img, normal):
    """OIDN (same denoiser cycles renders use) through the compositor's Denoise node, bakes don't have
    their own denoise pass. world space normals guide it so relief and edges stay sharp, the albedo
    guide is flat white because a lightmap is only lighting
    """
    w, h = img.size
    sc, r = bpy.context.scene, bpy.context.scene.render
    keep = (r.engine, r.resolution_x, r.resolution_y, r.resolution_percentage, r.filepath,
            r.image_settings.file_format, r.image_settings.color_depth, sc.compositing_node_group, sc.camera)
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    guides = {}
    for name, data in (("albedo", np.ones((h, w, 4), np.float32)),
                       ("normal", np.array(normal.pixels[:], dtype=np.float32).reshape(h, w, 4) * 2 - 1)):
        g = bpy.data.images.new(f"__{name}_guide", w, h, alpha=True, float_buffer=True)
        g.colorspace_settings.name = "Non-Color"
        g.pixels[:] = data.ravel()
        guides[name] = g
    tree = bpy.data.node_groups.new("__denoise", "CompositorNodeTree")
    tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    den = tree.nodes.new("CompositorNodeDenoise")
    den.inputs["Prefilter"].default_value = "Accurate"
    den.inputs["Quality"].default_value = "High"
    for socket, image in (("Image", img), ("Albedo", guides["albedo"]), ("Normal", guides["normal"])):
        node = tree.nodes.new("CompositorNodeImage")
        node.image = image
        tree.links.new(node.outputs["Image"], den.inputs[socket])
    tree.links.new(den.outputs["Image"], tree.nodes.new("NodeGroupOutput").inputs[0])
    sc.compositing_node_group = tree
    sc.camera = sc.camera or next(o for o in bpy.data.objects if o.type == "CAMERA")
    r.engine = "BLENDER_WORKBENCH"  # scene render gets thrown away, only the compositor output matters
    r.resolution_x, r.resolution_y, r.resolution_percentage = w, h, 100
    r.image_settings.file_format, r.image_settings.color_depth = "OPEN_EXR", "32"
    r.filepath = os.path.join(BAKES, "__denoised.exr")
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    out = bpy.data.images.load(r.filepath)
    den_px = np.array(out.pixels[:], dtype=np.float32).reshape(h, w, 4)
    valid = px[..., :3].sum(axis=2, keepdims=True) > 0
    px[..., :3] = np.where(valid, np.maximum(den_px[..., :3], 0), 0)
    img.pixels[:] = px.ravel()
    (r.engine, r.resolution_x, r.resolution_y, r.resolution_percentage, r.filepath,
     r.image_settings.file_format, r.image_settings.color_depth, sc.compositing_node_group, sc.camera) = keep
    for i in (out, *guides.values()):
        bpy.data.images.remove(i)
    bpy.data.node_groups.remove(tree)
    os.remove(os.path.join(BAKES, "__denoised.exr"))
    log(f"  OIDN      {img.name} in {time.time() - t0:.1f}s")


# ---------------------------------------------------------------- group bakes

def _metal_off(objs):
    """metallic -> 0 for the lightmap pass. metal has no diffuse lobe so cycles' DIFFUSE bake gives black,
    and the browser (shine.ts) reads a black lightmap as "no light here" and drops the highlights
    (the steel table stayed black). returns an undo function
    """
    undo = []
    for o in objs:
        for slot in o.material_slots:
            mat = slot.material
            for n in (mat.node_tree.nodes if mat and mat.use_nodes else []):
                if n.type != "BSDF_PRINCIPLED":
                    continue
                sock = n.inputs["Metallic"]
                links = [(l.from_socket, l.to_socket) for l in sock.links]
                for l in list(sock.links):
                    mat.node_tree.links.remove(l)
                undo.append((mat, sock, sock.default_value, links))
                sock.default_value = 0.0

    def restore():
        for mat, sock, value, links in undo:
            sock.default_value = value
            for a, b in links:
                mat.node_tree.links.new(a, b)
    return restore


def bake_lightmap(group, joined, layer, size):
    samples = 128 if QUICK else GROUPS[group].get("samples", 1024)
    lm = new_image(f"{group}_lm_hdr", size, float_buffer=True, non_color=True)
    restore = _metal_off([joined])
    bake([joined], "DIFFUSE", lm, layer, samples, pass_filter={"DIRECT", "INDIRECT"}, margin=6)
    restore()
    nrm = new_image(f"{group}_lm_normal", size, float_buffer=True, non_color=True)
    bake([joined], "NORMAL", nrm, layer, 4, margin=6, normal_space="OBJECT")  # joined mesh, object = world
    denoise(lm, nrm)
    bpy.data.images.remove(nrm)
    save(lm, f"{group}_lm", "OPEN_EXR")
    to_rgbm(lm, group)


def bake_tiling(group, objs, report):
    cfg = GROUPS[group]
    joined, buckets, pivots = flatten_and_join(group, objs, ["lightmap"])
    unwrap(joined, "lightmap", 0.003, cfg.get("cull", True))
    bake_lightmap(group, joined, "lightmap", cfg["lm"] // (2 if QUICK else 1))
    tiles = {}
    for slot in joined.material_slots:
        if slot.material and slot.material.name not in tiles:
            tiles[slot.material.name] = tile_material(slot.material)
        if slot.material:
            slot.material = tiles[slot.material.name]
    made = split_buckets(joined, buckets, pivots, group)
    report[group] = dict(kind="tiling", lightmap=f"{group}_lm", rgbmRange=RGBM_RANGE,
                         objects=sorted(o.name for o in made), materials=sorted({m.name for m in tiles.values()}))


def tile_material(mat):
    """bake one UV tile of a tiling material into albedo / normal / ORM images and return a plain image
    material the gltf exporter understands. world space variation and dust get added back by the
    browser shader
    """
    if mat.get("case_tiled"):
        return mat
    has_image = any(n.type == "TEX_IMAGE" and n.name != "__bake_target" for n in mat.node_tree.nodes)
    if not has_image:
        mat["case_tiled"] = True
        return mat
    size = 512 if QUICK else 1024
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, -50))
    p = bpy.context.active_object
    p.name = f"__tile_{mat.name}"
    p.data.materials.append(mat)
    albedo = new_image(f"tile_{mat.name}_albedo", size)
    normal = new_image(f"tile_{mat.name}_normal", size, non_color=True)
    rough = new_image(f"tile_{mat.name}_rough", size, non_color=True)
    saved = as_emission([p], "Base Color")
    bake([p], "EMIT", albedo, "UVMap", 4, margin=0)
    restore(saved)
    bake([p], "NORMAL", normal, "UVMap", 4, margin=0, normal_space="TANGENT")
    bake([p], "ROUGHNESS", rough, "UVMap", 4, margin=0)
    paths = {"albedo": save(albedo, f"tile_{mat.name}_albedo"), "normal": save(normal, f"tile_{mat.name}_normal"),
             "orm": save(_pack_orm(f"tile_{mat.name}_orm", None, rough, None), f"tile_{mat.name}_orm")}
    new = _image_material(mat.name, paths)
    bpy.data.objects.remove(p)
    new["case_tiled"] = True
    return new


def _pack_orm(name, ao, rough, metal):
    w, h = rough.size
    r = np.array(rough.pixels[:], dtype=np.float32).reshape(-1, 4)
    out = np.ones_like(r)
    out[:, 0] = np.array(ao.pixels[:], dtype=np.float32).reshape(-1, 4)[:, 0] if ao else 1.0
    out[:, 1] = r[:, 0]
    out[:, 2] = np.array(metal.pixels[:], dtype=np.float32).reshape(-1, 4)[:, 0] if metal else 0.0
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels[:] = out.ravel()
    return img


def _image_material(name, paths, uv="UVMap"):
    old = bpy.data.materials.get(name)
    if old:
        old.name = f"{name}__src"
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = uv

    def tex(path, non_color):
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = bpy.data.images.load(path, check_existing=True)
        if non_color:
            n.image.colorspace_settings.name = "Non-Color"
        nt.links.new(uvn.outputs[0], n.inputs["Vector"])
        return n

    nt.links.new(tex(paths["albedo"], False).outputs["Color"], bsdf.inputs["Base Color"])
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(tex(paths["orm"], True).outputs["Color"], sep.inputs[0])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.uv_map = uv
    nt.links.new(tex(paths["normal"], True).outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs[0], bsdf.inputs["Normal"])
    return mat


def bake_atlas(group, objs, report):
    cfg = GROUPS[group]
    size = cfg["atlas"] // (2 if QUICK else 1)
    joined, buckets, pivots = flatten_and_join(group, objs, ["atlas"])
    unwrap(joined, "atlas", 0.002, cfg.get("cull", True))
    bake_lightmap(group, joined, "atlas", cfg["lm"] // (2 if QUICK else 1))
    bpy.context.scene.world.light_settings.distance = 0.5  # contact occlusion at prop scale
    ao = bake([joined], "AO", new_image(f"{group}_ao", size, non_color=True), "atlas", 64 if QUICK else 256)
    normal = bake([joined], "NORMAL", new_image(f"{group}_normal", size, non_color=True), "atlas", 4,
                  normal_space="TANGENT")
    rough = bake([joined], "ROUGHNESS", new_image(f"{group}_rough", size, non_color=True), "atlas", 4)
    saved = as_emission([joined], "Metallic")
    metal = bake([joined], "EMIT", new_image(f"{group}_metal", size, non_color=True), "atlas", 4)
    restore(saved)
    saved = as_emission([joined], "Base Color")
    albedo = bake([joined], "EMIT", new_image(f"{group}_albedo", size), "atlas", 8)
    restore(saved)
    paths = {"albedo": save(albedo, f"{group}_albedo"), "normal": save(normal, f"{group}_normal"),
             "orm": save(_pack_orm(f"{group}_orm", ao, rough, metal), f"{group}_orm")}
    mat = _image_material(f"atlas_{group}", paths, uv="atlas")
    me = joined.data
    me.materials.clear()
    me.materials.append(mat)
    for layer in [l for l in me.uv_layers if l.name != "atlas"]:
        me.uv_layers.remove(layer)
    made = split_buckets(joined, buckets, pivots, group)
    report[group] = dict(kind="atlas", lightmap=f"{group}_lm", rgbmRange=RGBM_RANGE, material=mat.name,
                         objects=sorted(o.name for o in made))


# ---------------------------------------------------------------- main

def main():
    t0 = time.time()
    bpy.ops.wm.open_mainfile(filepath=os.path.join(common.SCENES, "case_file.blend"))
    scene = bpy.context.scene
    common.enable_gpu(scene)
    scene.render.bake.use_selected_to_active = False
    prepare(scene)

    report, taken = {}, set()
    for group in GROUPS:
        objs = collect(group, taken)
        if ONLY and group not in ONLY:
            continue
        if not objs:
            log(f"{group}: nothing to bake")
            continue
        keep, special = split_special(objs)
        for s in special:
            s["case_special"] = "glass" if any(is_transparent(x.material) for x in s.material_slots) else "emissive"
            s["case_group"] = group
            b = bucket_of(s, group)
            if b.startswith("dyn_"):
                s["case_follow"] = b  # glass/LED that moves with a dyn piece (door glass, clock glass)
            mw = s.matrix_world.copy()
            s.parent = None
            s.matrix_world = mw
        log(f"{group}: {len(keep)} parts + {len(special)} glass/emissive")
        (bake_tiling if GROUPS[group]["kind"] == "tiling" else bake_atlas)(group, keep, report)
        report[group]["special"] = sorted(s.name for s in special)

    for o in bpy.data.objects:
        if o.type == "MESH" and o.name.startswith("fx_") and "case_special" not in o and "case_group" not in o:
            m = o.active_material
            o["case_special"] = "glass" if is_transparent(m) else "emissive" if is_emissive(m) else "fx"

    os.makedirs(BAKES, exist_ok=True)
    with open(os.path.join(BAKES, "bake_report.json"), "w") as f:
        json.dump(report, f, indent=2)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(common.SCENES, "case_file_baked.blend"), compress=True)
    log(f"done in {time.time() - t0:.0f}s")


main()
