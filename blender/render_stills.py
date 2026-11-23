"""Cycles review stills: 1920x1080, OptiX, OIDN, AgX.

Usage: pnpm blender render_stills.py -- office [--cams desk,window] [--samples 384] [--pct 100]
Writes screenshots/blender/<scene>_<shot>.png.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

import bpy  # noqa: E402

from lib import common  # noqa: E402


def arg(argv, name, default):
    return argv[argv.index(name) + 1] if name in argv else default


def configure(scene, samples, pct, wb=3700.0, exposure=0.0, size=(1920, 1080)):
    """OptiX, OIDN, AgX medium high contrast and the tungsten white balance every still uses
    (og_image.py uses it too)
    """
    common.enable_gpu(scene)
    c = scene.cycles
    c.samples = samples
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.01
    c.use_denoising = True
    c.denoiser = "OPENIMAGEDENOISE"
    c.max_bounces = 8
    c.diffuse_bounces = 4
    c.glossy_bounces = 4
    c.transmission_bounces = 8
    c.volume_bounces = 1
    c.transparent_max_bounces = 16
    c.sample_clamp_indirect = 8.0
    c.blur_glossy = 1.0
    c.caustics_reflective = False
    c.caustics_refractive = False
    c.volume_step_rate = 2.0
    scene.render.resolution_x = size[0]
    scene.render.resolution_y = size[1]
    scene.render.resolution_percentage = pct
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_depth = "8"
    vs = scene.view_settings
    vs.view_transform = "AgX"
    for look in ("AgX - Medium High Contrast", "Medium High Contrast", "AgX - Base Contrast"):
        try:
            vs.look = look
            break
        except TypeError:
            continue
    vs.exposure = exposure
    # white balance for tungsten like a photographer would - practicals stay warm, paper looks cream,
    # moonlight goes blue
    vs.use_white_balance = True
    vs.white_balance_temperature = wb



def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    scene_name = argv[0] if argv and not argv[0].startswith("--") else "office"
    cams = arg(argv, "--cams", "")
    samples = int(arg(argv, "--samples", "384"))
    pct = int(arg(argv, "--pct", "100"))
    suffix = arg(argv, "--suffix", "")

    bpy.ops.wm.open_mainfile(filepath=os.path.join(common.SCENES, "case_file.blend"))
    scene = bpy.context.scene
    # bake only stand-ins (swinging lamp bounce) would double up with the real thing in a still.
    # --bake-view renders what the lightmaps hold instead (real time lights off, stand-ins on) and
    # --hide drops named lights, together they're for tuning the stand-ins against the real bounce
    bake_view = "--bake-view" in argv
    hide = set(arg(argv, "--hide", "").split(",")) - {""}
    for o in bpy.data.objects:
        if o.type != "LIGHT":
            continue
        if (o.get("case_bake_only") and not bake_view) or (o.get("case_realtime") and bake_view) or o.name in hide:
            o.hide_render = True
    configure(scene, samples, pct, float(arg(argv, "--wb", "3700")), float(arg(argv, "--exposure", "0.0")))

    os.makedirs(common.SHOTS, exist_ok=True)
    wanted = [s for s in cams.split(",") if s]
    for obj in sorted(bpy.data.objects, key=lambda o: o.name):
        if obj.type != "CAMERA" or not obj.name.startswith(f"cam_{scene_name}_"):
            continue
        shot = obj.name.removeprefix(f"cam_{scene_name}_")
        if wanted and shot not in wanted:
            continue
        scene.camera = obj
        out = os.path.join(common.SHOTS, f"{scene_name}_{shot}{suffix}.png")
        scene.render.filepath = out
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"[render] {out} in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
