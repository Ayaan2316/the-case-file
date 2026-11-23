"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Color, type Mesh, type MeshStandardMaterial, type Object3D } from "three";
import { play, setSound } from "@/lib/audio";
import { useStore } from "@/lib/store";
import { registerClick } from "../scenes/interactions";

/** the valve radio is the sound toggle - click it, dial glows, needle sweeps */
export default function Radio({ roots }: { roots: Object3D[] }) {
  const parts = useMemo(() => {
    const find = (n: string) => {
      for (const r of roots) {
        const o = r.getObjectByName(n);
        if (o) return o;
      }
    };
    const dial = find("dyn_radio_dial") as Mesh | undefined;
    const needle = find("dyn_radio_needle");
    let dialMat: MeshStandardMaterial | null = null;
    if (dial) {
      const base = dial.material as MeshStandardMaterial;
      dialMat = base.clone();
      dialMat.onBeforeCompile = base.onBeforeCompile.bind(base);
      dialMat.customProgramCacheKey = base.customProgramCacheKey.bind(base);
      dialMat.emissive = new Color("#ffb45a");
      dialMat.emissiveIntensity = 0;
      dial.material = dialMat;
    }
    return { needle, dialMat, needleRest: needle?.position.x ?? 0, glow: 0, sweep: 0 };
  }, [roots]);

  useEffect(
    () =>
      registerClick(/^dyn_radio/, () => {
        const on = !useStore.getState().soundOn;
        void setSound(on).then(() => on && play("radioStatic"));
      }),
    [],
  );

  useFrame((_, delta) => {
    const on = useStore.getState().soundOn;
    parts.glow += ((on ? 1 : 0) - parts.glow) * Math.min(1, delta * 3);
    if (parts.dialMat) parts.dialMat.emissiveIntensity = parts.glow * 2.2;
    if (parts.needle) {
      parts.sweep += ((on ? 1 : 0) - parts.sweep) * Math.min(1, delta * 1.2);
      parts.needle.position.x = parts.needleRest + parts.sweep * 0.06;
    }
  });
  return null;
}
