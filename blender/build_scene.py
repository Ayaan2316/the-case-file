"""Puts the corridor, office and evidence room together into blender/scenes/case_file.blend.

Usage: pnpm blender build_scene.py [-- --only office,corridor]
Both scenes share one world space (corridor at y<0, office at y>=0) so the door, the light under
it and the glass all render with real light coming from the other side. export splits by collection.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

import bpy  # noqa: E402

from lib import common  # noqa: E402

STEPS = ["office_shell", "furniture", "props", "exterior", "corridor", "evidence_room", "interrogation_room"]


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    only = argv[argv.index("--only") + 1].split(",") if "--only" in argv else None
    t0 = time.time()
    scene = common.reset_scene()
    common.enable_gpu(scene)
    root_office = common.collection("office")
    root_corridor = common.collection("corridor")
    root_evidence = common.collection("evidence")
    root_interro = common.collection("interrogation")

    import cameras
    import lighting
    from procedural import office_shell

    lighting.world(scene)
    office_shell.build(root_office)
    office_shell.spot_heads(common.collection("office_shell", root_office))
    lighting.office(root_office)

    for step in STEPS[1:]:
        if only and step not in only and not (step in ("furniture", "props", "exterior") and "office" in only):
            continue
        try:
            mod = __import__(f"procedural.{step}", fromlist=["build"])
        except ModuleNotFoundError:
            print(f"[build] skip {step}: not written yet")
            continue
        target = {"corridor": root_corridor, "evidence_room": root_evidence, "interrogation_room": root_interro}.get(step, root_office)
        result = mod.build(target)
        if step == "corridor":
            lighting.corridor(root_corridor, result["bulbs"])
        if step == "evidence_room":
            lighting.evidence(root_evidence)
        if step == "interrogation_room":
            lighting.interrogation(root_interro)
        print(f"[build] {step} done")

    cameras.build(common.collection("review"))
    os.makedirs(common.SCENES, exist_ok=True)
    path = os.path.join(common.SCENES, "case_file.blend")
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    print(f"[build] saved {path} in {time.time() - t0:.1f}s, {len(bpy.data.objects)} objects")


main()
