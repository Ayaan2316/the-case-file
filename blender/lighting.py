"""Lights for the look-dev renders and the lightmap bake.

Warm 2700-3000K practicals and strips inside, cool moonlight and red neon through the window.
lights named `live_*` become real time lights in three.js, the rest are bake only.
"""
import math
import os

import bpy
from mathutils import Vector

import materials as M
from lib.common import PH, collection, kelvin, link
from procedural import office_shell as shell


def _light(name, kind, loc, col, power, color=(1, 1, 1), size=None, temp=None, **props):
    data = bpy.data.lights.new(name, kind)
    data.energy = power
    if temp:
        data.use_temperature = True
        data.temperature = temp
    else:
        data.color = color
    if size is not None and kind == "AREA":
        data.shape = "RECTANGLE"
        data.size, data.size_y = size
    for k, v in props.items():
        setattr(data, k, v)
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    # lights the scene but never shows up as a glowing panel
    obj.visible_camera = False
    obj.visible_transmission = False
    # only the moonlight should make shafts in the haze
    obj.visible_volume_scatter = kind == "SUN"
    col.objects.link(obj)
    return obj


def _aim(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def world(scene, strength=0.22, camera_strength=1.4, rotation=200):
    w = bpy.data.worlds.new("night_city")
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(os.path.join(PH, "hdris", "modern_buildings_night", "modern_buildings_night_2k.hdr"))
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Rotation"].default_value[2] = math.radians(rotation)
    nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])
    nt.links.new(mp.outputs[0], env.inputs["Vector"])
    nt.links.new(env.outputs["Color"], bg.inputs["Color"])
    # city looks brighter to the camera (through the glass) than it lights the room
    lp = nt.nodes.new("ShaderNodeLightPath")
    mix = nt.nodes.new("ShaderNodeMath")
    mix.operation = "MULTIPLY_ADD"
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs[0])
    mix.inputs[1].default_value = camera_strength - strength
    mix.inputs[2].default_value = strength
    nt.links.new(mix.outputs[0], bg.inputs["Strength"])
    nt.links.new(bg.outputs[0], out.inputs["Surface"])
    return w


def office(root):
    col = collection("office_lights", root)
    W, D, H = shell.W, shell.D, shell.H

    # moon / street light through the blinds - crisp slat shadows and the light shafts
    moon = _light("live_moonlight", "SUN", (W + 3, 2.0, 5.0), col, 4.0, color=(0.72, 0.8, 1.0), angle=math.radians(0.6))
    _aim(moon, (2.6, 1.6, 0.0))

    # ceiling cove grazing the relief wall (main light from reference 01)
    cove = _light("bake_cove", "AREA", (W / 2, shell.COVE_Y + 0.07, H + 0.12), col, 110, size=(W - 0.12, 0.05), temp=2900)
    cove.data.spread = math.radians(70)

    # LED strips under the shelves
    for i, z in enumerate((1.32, 1.74, 2.16)):
        s = _light(f"bake_shelf_led_{i}", "AREA", (3.9, D - 0.05, z - 0.03), col, 11, size=(1.85, 0.015), temp=2700)
        s.data.spread = math.radians(110)

    # track spots
    power = {"desk": 120, "board": 75, "shelves": 35, "door": 70, "chair": 45}
    for name, (pos, target) in shell.SPOTS.items():
        sp = _light(f"live_spot_{name}" if name == "desk" else f"bake_spot_{name}", "SPOT", shell.spot_light_pos(name), col, power[name],
                    temp=3000, spot_size=math.radians(34), spot_blend=0.45, shadow_soft_size=0.02)
        _aim(sp, target)

    # neon spill from across the street
    neon = _light("live_neon_spill", "AREA", (W + 1.6, 2.1, 2.3), col, 30, color=(1.0, 0.16, 0.06), size=(1.6, 0.7))
    _aim(neon, (2.5, 2.0, 1.2))

    # ambient bounce, a real room is never pitch black under the desk (darkest ~RGB 6-10)
    _light("bake_ambient_fill", "AREA", (W / 2, D / 2, H - 0.05), col, 14, size=(W - 1.0, D - 1.0), temp=3200)

    # thin haze so the moonlight shows up as shafts through the blinds
    bpy.ops.mesh.primitive_cube_add(size=1, location=(W / 2, D / 2, H / 2))
    haze = bpy.context.active_object
    haze.name = "fx_haze_volume"
    haze.scale = (W - 0.04, D - 0.04, H - 0.02)
    # denser towards the window so the shafts show through the slats
    haze.data.materials.append(M.volume_haze(0.006, toward_x=(0.0, 0.5, 0.05)))
    link(haze, col)
    haze.visible_shadow = False
    return col


def evidence(root):
    """one hard industrial lamp over the steel table, the rest of the room lives off its bounce"""
    from procedural import evidence_room as ev

    col = collection("evidence_lights", root)
    lamp = _light("bake_evid_lamp", "SPOT", (ev.TABLE.x, ev.TABLE.y, ev.H - 1.27), col, 30, temp=3300,
                  spot_size=math.radians(118), spot_blend=0.35, shadow_soft_size=0.025)
    _aim(lamp, (ev.TABLE.x, ev.TABLE.y, 0.0))
    # a bit of cool light from the corridor side so the shelves aren't just a black void
    _light("bake_evid_fill", "AREA", (1.0, ev.Y0 + 0.6, ev.H - 0.05), col, 2.0, size=(1.2, 0.6), temp=4000)
    # ambient bounce, room is never pitch black away from the lamp (darkest ~RGB 6-10)
    _light("bake_evid_ambient", "AREA", ((ev.X0 + ev.X1) / 2, (ev.Y0 + ev.Y1) / 2, ev.H - 0.05), col, 16.0,
           size=(ev.X1 - ev.X0 - 0.8, ev.Y1 - ev.Y0 - 0.8), temp=3600)
    exit_ = _light("bake_evid_exit", "AREA", (0.08, (ev.DOOR[0] + ev.DOOR[1]) / 2, ev.DOOR[2] + 0.22), col, 1.2,
                   color=(0.2, 1.0, 0.4), size=(0.28, 0.1))
    _aim(exit_, (2.0, (ev.DOOR[0] + ev.DOOR[1]) / 2, ev.DOOR[2] + 0.1))
    return col


def interrogation(root):
    """the swinging lamp is the only real light in the room and it moves, so the browser runs it as a
    real time spot with live shadows (`case_realtime`, the bake skips it). the bake gets stand-ins
    for its bounce instead (`case_bake_only`, the stills skip those)
    """
    from procedural import interrogation_room as ir

    col = collection("interro_lights", root)
    lamp = _light("live_interro_lamp", "SPOT", (ir.TABLE.x, ir.TABLE.y, ir.H - ir.CORD - 0.075), col, 70, temp=3000,
                  spot_size=math.radians(112), spot_blend=0.3, shadow_soft_size=0.02)
    _aim(lamp, (ir.TABLE.x, ir.TABLE.y, 0.0))
    lamp["case_realtime"] = True
    # what the lamp's pool on the table and floor throws back onto the walls and ceiling. kept small -
    # with the stand-ins hidden and the lamp on, cycles' real bounce only adds ~15% over the ambient
    # on the walls (render_stills.py --bake-view vs the plain still)
    bounce = _light("bake_interro_bounce", "AREA", (ir.TABLE.x, ir.TABLE.y, ir.TOP + 0.02), col, 1.8, size=(1.4, 1.0), temp=3000)
    _aim(bounce, (ir.TABLE.x, ir.TABLE.y, ir.H))
    bounce.data.spread = math.radians(150)
    bounce["case_bake_only"] = True
    floor = _light("bake_interro_floor_bounce", "AREA", (ir.TABLE.x, ir.TABLE.y, 0.02), col, 1.0, size=(2.2, 1.8), temp=3000)
    _aim(floor, (ir.TABLE.x, ir.TABLE.y, ir.H))
    floor["case_bake_only"] = True
    _light("bake_interro_ambient", "AREA", ((ir.X0 + ir.X1) / 2, (ir.Y0 + ir.Y1) / 2, ir.H - 0.05), col, 11.0,
           size=(ir.X1 - ir.X0 - 0.6, ir.Y1 - ir.Y0 - 0.6), temp=3800)
    exit_ = _light("bake_interro_exit", "AREA", (0.08, (ir.DOOR[0] + ir.DOOR[1]) / 2, ir.DOOR[2] + 0.22), col, 1.0,
                   color=(0.2, 1.0, 0.4), size=(0.28, 0.1))
    _aim(exit_, (2.0, (ir.DOOR[0] + ir.DOOR[1]) / 2, ir.DOOR[2] + 0.1))
    return col


def corridor(root, bulbs):
    col = collection("corridor_lights", root)
    for i, pos in enumerate(bulbs):
        b = _light(f"live_corridor_bulb_{i}", "POINT", pos, col, 44 if i == 0 else 30, temp=2700, shadow_soft_size=0.03)
        b.visible_volume_scatter = True  # bare bulbs glow in the corridor dust
    return col
