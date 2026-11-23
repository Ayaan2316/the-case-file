"""The share image: 1200x630 from the office, the case folder caught in a flashlight beam through
the haze. cycles, graded like the review stills. the title gets added on top by
scripts/brand-images.mjs. writes screenshots/blender/og_base.png, doesn't save the scene.

Usage: pnpm blender og_image.py [-- --samples 512 --pct 100]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

from lib import common  # noqa: E402
import render_stills as rs  # noqa: E402

# blender coords, the closed case folder on the desk
FOLDER = Vector((2.53, 2.275, 0.762))
# camera sits low over the front edge of the desk, folder lands right of centre so the left half
# stays dark for the title
CAMERA = Vector((1.95, 1.3, 1.32))
TARGET = Vector((2.36, 2.42, 0.8))
FOV = 36.0
# room a stop and a half under the stills, the flashlight carries the picture
EXPOSURE = -1.5


def aim(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    samples = int(rs.arg(argv, "--samples", "512"))
    pct = int(rs.arg(argv, "--pct", "100"))
    bpy.ops.wm.open_mainfile(filepath=os.path.join(common.SCENES, "case_file.blend"))
    scene = bpy.context.scene
    for o in bpy.data.objects:
        if o.type == "LIGHT" and o.get("case_bake_only"):
            o.hide_render = True
    rs.configure(scene, samples, pct, exposure=float(rs.arg(argv, "--exposure", str(EXPOSURE))), size=(1200, 630))
    scene.cycles.volume_bounces = 1  # the beam is single scattering, 0 bounces renders no haze at all

    cam_data = bpy.data.cameras.new("og_camera")
    cam_data.sensor_fit = "VERTICAL"
    cam_data.angle_y = math.radians(FOV)
    cam_data.dof.use_dof = True
    cam_data.dof.focus_distance = (FOLDER - CAMERA).length
    cam_data.dof.aperture_fstop = 2.8
    cam = bpy.data.objects.new("og_camera", cam_data)
    scene.collection.objects.link(cam)
    cam.location = CAMERA
    aim(cam, TARGET)
    scene.camera = cam

    # flashlight held out to the right and above so the beam crosses the frame through the haze
    # (a beam along the line of sight doesn't show), hot spot on the folder
    rot = cam.matrix_world.to_quaternion()
    right, forward = rot @ Vector((1, 0, 0)), rot @ Vector((0, 0, -1))
    light_data = bpy.data.lights.new("og_flashlight", "SPOT")
    light_data.energy = 420
    light_data.use_temperature = True
    light_data.temperature = 3400
    light_data.spot_size = math.radians(16)
    light_data.spot_blend = 0.45
    light_data.shadow_soft_size = 0.02
    flashlight = bpy.data.objects.new("og_flashlight", light_data)
    scene.collection.objects.link(flashlight)
    flashlight.location = CAMERA + right * 1.3 - forward * 0.1 + Vector((0, 0, 0.55))
    aim(flashlight, FOLDER)

    # dust in the air so the beam shows, thin scattering volume over the desk. built from data and
    # linked to the scene directly - the operator drops it into whatever collection was active when
    # the file was saved (an excluded one rendered nothing)
    mesh = bpy.data.meshes.new("og_haze")
    sx, sy, sz = 1.7, 1.6, 1.2
    verts = [(x * sx, y * sy, z * sz) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    mesh.from_pydata(verts, [], faces)
    haze = bpy.data.objects.new("og_haze", mesh)
    haze.location = (2.4, 2.1, 1.3)
    scene.collection.objects.link(haze)
    mat = bpy.data.materials.new("og_haze")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    vol = nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Density"].default_value = float(rs.arg(argv, "--haze", "0.15"))
    vol.inputs["Anisotropy"].default_value = 0.45
    out = nodes.new("ShaderNodeOutputMaterial")
    mat.node_tree.links.new(vol.outputs["Volume"], out.inputs["Volume"])
    haze.data.materials.append(mat)

    os.makedirs(common.SHOTS, exist_ok=True)
    scene.render.filepath = os.path.join(common.SHOTS, "og_base.png")
    bpy.ops.render.render(write_still=True)
    print(f"[og] {scene.render.filepath}")


main()
