"""Review cameras for the cycles stills, three angles per scene.

`fov` is vertical fov in degrees, same as three's PerspectiveCamera.fov, so shots can be
copied straight into lib/cameraPath.ts
"""
import math

import bpy
from mathutils import Vector

from lib.common import collection

SHOTS = {
    "office": {
        "establishing": dict(pos=(1.05, 0.12, 1.62), target=(2.25, 3.6, 1.05), fov=48, focus=2.4, fstop=4.0),
        "desk": dict(pos=(1.55, 1.45, 1.22), target=(2.45, 2.45, 0.78), fov=34, focus=1.25, fstop=2.0),
        "window": dict(pos=(0.6, 3.5, 1.55), target=(5.0, 1.4, 1.35), fov=42, focus=2.6, fstop=1.6),
    },
    "debug": {
        "phone": dict(pos=(2.75, 2.15, 0.98), target=(2.98, 2.56, 0.8), fov=30, focus=0.5, fstop=8.0),
        "lamp": dict(pos=(1.6, 2.2, 1.05), target=(1.8, 2.66, 0.95), fov=34, focus=0.5, fstop=8.0),
        "folder": dict(pos=(2.55, 1.95, 1.12), target=(2.57, 2.27, 0.75), fov=30, focus=0.48, fstop=8.0),
        "paper": dict(pos=(1.98, 2.05, 1.0), target=(2.05, 2.55, 0.92), fov=24, focus=0.55, fstop=8.0),
    },
    "evidence": {
        "wide": dict(pos=(0.55, 30.35, 1.75), target=(2.2, 31.85, 0.85), fov=48, focus=2.2, fstop=4.0),
        "table": dict(pos=(2.1, 31.05, 1.62), target=(2.1, 31.68, 0.92), fov=42, focus=0.95, fstop=4.0),
        "bag": dict(pos=(1.55, 31.2, 1.28), target=(1.65, 31.55, 0.93), fov=34, focus=0.5, fstop=4.0),
    },
    "interrogation": {
        "room": dict(pos=(0.55, 40.3, 1.7), target=(2.2, 42.0, 0.9), fov=50, focus=2.4, fstop=4.0),
        "recorder": dict(pos=(1.95, 41.15, 1.18), target=(1.85, 41.9, 0.78), fov=40, focus=0.8, fstop=4.0),
        "mirror": dict(pos=(1.9, 41.4, 1.55), target=(4.0, 41.95, 1.45), fov=46, focus=2.1, fstop=4.0),
    },
    "corridor": {
        "far": dict(pos=(0.9, -7.4, 1.6), target=(0.9, 0.0, 1.35), fov=38, focus=7.0, fstop=5.6),
        "mid": dict(pos=(0.75, -3.2, 1.6), target=(0.9, 0.0, 1.5), fov=38, focus=3.1, fstop=4.0),
        "door": dict(pos=(0.55, -1.15, 1.55), target=(1.0, 0.0, 1.5), fov=36, focus=1.12, fstop=5.6),
    },
}


def build(root):
    col = collection("cameras", root)
    cams = {}
    for scene_name, shots in SHOTS.items():
        for shot, s in shots.items():
            data = bpy.data.cameras.new(f"cam_{scene_name}_{shot}")
            data.sensor_fit = "VERTICAL"
            data.angle_y = math.radians(s["fov"])
            data.clip_start = 0.02
            data.clip_end = 200
            data.dof.use_dof = True
            data.dof.focus_distance = s["focus"]
            data.dof.aperture_fstop = s["fstop"]
            data.dof.aperture_blades = 7
            obj = bpy.data.objects.new(data.name, data)
            obj.location = s["pos"]
            d = Vector(s["target"]) - Vector(s["pos"])
            obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
            col.objects.link(obj)
            cams[(scene_name, shot)] = obj
    return cams
