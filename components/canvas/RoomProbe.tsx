"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { CubeCamera, HalfFloatType, type Texture, WebGLCubeRenderTarget } from "three";
import { camera as shot } from "@/lib/cameraPath";
import { OFF } from "@/lib/debug";
import { useStore } from "@/lib/store";

const PROBES = {
  // three coords (blender x, z, -y)
  office: [2.5, 1.5, -2.0],
  corridor: [0.9, 1.6, 3.5],
  evidence: [2.1, 1.45, -31.75],
  interrogation: [2.0, 1.4, -41.8],
};

/**
 * reflections come from the rooms themselves, not the sky. each room gets captured once into a
 * cube map after loading so the LEDs and lamps show up in the desk lacquer, bakelite and brass.
 * the city HDRI is still the background through the window
 */
export default function RoomProbe() {
  const { gl, scene } = useThree();
  const probes = useMemo(() => {
    const make = () => {
      const rt = new WebGLCubeRenderTarget(256, { type: HalfFloatType, generateMipmaps: true });
      return { rt, cam: new CubeCamera(0.05, 60, rt) };
    };
    return { office: make(), corridor: make(), evidence: make(), interrogation: make(), captured: false, current: "" as "" | keyof typeof PROBES };
  }, []);

  useEffect(() => () => {
    probes.office.rt.dispose();
    probes.corridor.rt.dispose();
    probes.evidence.rt.dispose();
    probes.interrogation.rt.dispose();
  }, [probes]);

  useFrame(() => {
    if (!useStore.getState().ready) return;
    if (!probes.captured) {
      const bg = scene.background;
      const env = scene.environment;
      scene.background = null;
      scene.environment = null;
      for (const key of ["office", "corridor"] as const) {
        probes[key].cam.position.fromArray(PROBES[key]);
        probes[key].cam.update(gl, scene);
      }
      scene.background = bg;
      scene.environment = env;
      probes.captured = true;
      useStore.getState().set({ probesReady: true });
    }
    const s = useStore.getState();
    // later rooms load lazily, capture each one the first time it shows up (they're closed on all
    // sides so a probe only sees its own room)
    const capture = (key: "evidence" | "interrogation") => {
      const bg = scene.background;
      const env = scene.environment;
      scene.background = null;
      scene.environment = null;
      probes[key].cam.position.fromArray(PROBES[key]);
      probes[key].cam.update(gl, scene);
      scene.background = bg;
      scene.environment = env;
    };
    if (s.evidenceReady && !s.evidenceProbe) {
      capture("evidence");
      s.set({ evidenceProbe: true });
    }
    if (s.interroReady && !s.interroProbe) {
      capture("interrogation");
      s.set({ interroProbe: true });
    }
    const want =
      shot.space === "evidence" && s.evidenceProbe
        ? "evidence"
        : shot.space === "interrogation" && s.interroProbe
          ? "interrogation"
          : shot.p < 0.11
            ? "corridor"
            : "office";
    if (want !== probes.current) {
      scene.environment = OFF.has("env") ? null : (probes[want].rt.texture as Texture);
      probes.current = want;
    }
  });
  return null;
}
