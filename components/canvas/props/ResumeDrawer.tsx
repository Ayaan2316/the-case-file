"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BoxGeometry, CanvasTexture, Group, MathUtils, Mesh, MeshStandardMaterial, type Object3D, SRGBColorSpace } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { specialElite } from "@/app/fonts";
import { caseFile } from "@/content/case";
import { BEATS, camera as shot, within } from "@/lib/cameraPath";
import { downloadResume, openDrawer } from "@/lib/contact";
import { liveLit } from "@/lib/materials";
import { useStore } from "@/lib/store";
import { registerClick } from "../scenes/interactions";

/** how far the drawer slides out (m) along the cabinet front (+x, it's on the left wall) */
const TRAVEL = 0.34;

/**
 * filing cabinet RÉSUMÉ drawer. the bake only has the front, so the drawer behind it is built here
 * (steel sides, hanging files, the resume tab) in the front's space. end of the scroll slides it
 * out (BEATS.cabinet). clicking it or "Get the résumé" on the notepad also slides it out and starts
 * the pdf download. scrolling alone never downloads anything
 */
export default function ResumeDrawer({ roots }: { roots: Object3D[] }) {
  const parts = useMemo(() => {
    let front: Object3D | undefined;
    for (const r of roots) front ??= r.getObjectByName("dyn_cabinet_drawer_resume");
    if (!front) return null;
    // drawer front's own space: x out of the cabinet, y up, z across (0.44 x 0.3m front)
    const steel = liveLit(new MeshStandardMaterial({ color: 0x2a2c2e, metalness: 0.7, roughness: 0.42 }), { key: "drawer-steel" });
    const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number) =>
      new BoxGeometry(sx, sy, sz).translate(x, y, z);
    const shell = mergeGeometries([
      box(0.54, 0.006, 0.4, -0.28, -0.125, 0), // bottom
      box(0.54, 0.2, 0.006, -0.28, -0.03, -0.2), // sides
      box(0.54, 0.2, 0.006, -0.28, -0.03, 0.2),
      box(0.006, 0.2, 0.4, -0.55, -0.03, 0), // back
    ])!;
    const manila = liveLit(new MeshStandardMaterial({ color: 0xc9a66b, roughness: 0.85 }), { key: "drawer-files" });
    const files = mergeGeometries(
      Array.from({ length: 9 }, (_, i) => {
        const x = -0.06 - i * 0.052;
        const tab = ((i * 0.37) % 1) * 0.24 - 0.12;
        return mergeGeometries([box(0.003, 0.2, 0.37, x, -0.02, 0), box(0.003, 0.024, 0.07, x, 0.092, tab)])!;
      }),
    )!;
    // label goes on the third file's tab (the front one is hidden behind the drawer front)
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 96;
    const label = new CanvasTexture(canvas);
    label.colorSpace = SRGBColorSpace;
    const tab = new Mesh(
      new BoxGeometry(0.004, 0.034, 0.09).translate(-0.06 - 2 * 0.052 + 0.003, 0.108, 0.07),
      liveLit(new MeshStandardMaterial({ map: label, roughness: 0.8 }), { key: "drawer-label" }),
    );
    void document.fonts.load(`40px ${specialElite.style.fontFamily}`, "R").then(() => {
      const g = canvas.getContext("2d")!;
      g.fillStyle = "#efe6d2";
      g.fillRect(0, 0, 256, 96);
      g.fillStyle = "#b0161d";
      g.font = `bold 50px ${specialElite.style.fontFamily}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("RÉSUMÉ", 128, 52);
      label.needsUpdate = true;
    });
    const drawer = new Group();
    drawer.name = "fx_resume_drawer_box";
    drawer.add(new Mesh(shell, steel), new Mesh(files, manila), tab);
    drawer.visible = false;
    front.add(drawer);
    return { front, drawer, x: front.position.x, label, open: 0, downloaded: false };
  }, [roots]);

  useEffect(() => {
    const off = registerClick(/^dyn_cabinet_drawer_resume/, openDrawer);
    return () => {
      off();
      if (!parts) return;
      parts.front.remove(parts.drawer);
      parts.label.dispose();
    };
  }, [parts]);

  useFrame((_, delta) => {
    if (!parts) return;
    const want = useStore.getState().drawerOpen ? 1 : 0;
    parts.open = MathUtils.damp(parts.open, want, 3.2, delta);
    const clicked = 1 - Math.pow(1 - parts.open, 3); // heavy drawer, quick start then a long glide
    const s = within(shot.p, BEATS.cabinet);
    const e = Math.max(clicked, s * s * (3 - 2 * s));
    parts.front.position.x = parts.x + e * TRAVEL;
    parts.drawer.visible = e > 0.002;
    // once it's out, hand over the resume
    if (want && parts.open > 0.9 && !parts.downloaded) {
      parts.downloaded = true;
      downloadResume(caseFile.subject.resumePdf);
    }
    if (!want && parts.open < 0.1) parts.downloaded = false;
  });
  return null;
}
