"use client";

import { useKTX2 } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { Object3D, Texture } from "three";
import { CUTS, camera as shot } from "@/lib/cameraPath";
import { prepareScene, type SceneManifest } from "@/lib/materials";
import { useStore } from "@/lib/store";
import manifestJson from "@/public/models/scene.json";
import { batchStatics, freezeStatics } from "./batch";
import { lightmapUrls, useCaseModel } from "./CaseFile";
import { buildPrint, type Decal } from "./evidencePrint";

const manifest = manifestJson as unknown as SceneManifest;
const decals = ((manifestJson as { table?: { decals?: Decal[] } }).table?.decals ?? []) as Decal[];
/** start loading the store room while the visitor is still at the board (at 60%) */
const PRELOAD_AT = 0.42;

/**
 * evidence table: a separate store room we cut to from the board. GLB and lightmaps load lazily,
 * once, and it only draws while the camera is in it
 */
export default function EvidenceRoom() {
  const [wanted, setWanted] = useState(() => useStore.getState().progress > PRELOAD_AT);
  useEffect(() => {
    if (wanted) return;
    return useStore.subscribe((s) => {
      if (s.progress > PRELOAD_AT) setWanted(true);
    });
  }, [wanted]);
  if (!wanted) return null;
  return (
    <Suspense fallback={null}>
      <Room />
    </Suspense>
  );
}

function Room() {
  const evidence = useCaseModel("evidence");
  const urls = useMemo(() => lightmapUrls("evidence"), []);
  const lightmaps = useKTX2(urls, "/basis/") as unknown as Record<string, Texture>;
  const root = evidence.scene as Object3D;

  useMemo(() => {
    // once per loaded model like CaseFile, this rewrites geometry and materials
    if (root.userData.prepared) return;
    prepareScene(root, manifest, lightmaps, "evidence");
    batchStatics(root);
    root.traverse((o) => {
      o.castShadow = false;
      o.receiveShadow = false;
    });
    freezeStatics(root);
    root.userData.prepared = true;
  }, [root, lightmaps]);

  // bag panels, tags and the log, printed from content/case.ts onto the blank paper
  useEffect(() => {
    const print = buildPrint(decals);
    root.add(print.mesh);
    let live = true;
    print.ready.then(() => live && useStore.getState().set({ evidenceReady: true }));
    return () => {
      live = false;
      root.remove(print.mesh);
      print.mesh.geometry.dispose();
      print.texture.dispose();
      useStore.getState().set({ evidenceReady: false });
    };
  }, [root]);

  useFrame(() => {
    // the probe needs one look at the room before the visitor gets here (RoomProbe)
    root.visible = (shot.p > CUTS.table - 0.01 && shot.p < CUTS.interrogation + 0.01) || !useStore.getState().evidenceProbe;
  });

  return <primitive object={root} />;
}
