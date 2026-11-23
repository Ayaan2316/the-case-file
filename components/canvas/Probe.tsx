"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Vector3 } from "three";
import { scrollToProgress } from "@/lib/scroll";
import { useStore } from "@/lib/store";

declare global {
  interface Window {
    __caseFile?: {
      scrollTo: (p: number) => void;
      measure: (ms: number) => Promise<{
        fps: number;
        p95: number;
        /** share of frames that missed a 60hz vsync by more than half a frame (visible stutter) */
        long: number;
        max: number;
        calls: number;
        maxCalls: number;
        sceneCalls: number;
        tris: number;
      }>;
      /** the live three scene, for poking at from devtools or tests */
      scene: import("three").Scene;
      /** the store (open an exhibit from a test, read the grade) */
      store: typeof useStore;
      /** screen position (css px) of a world point, so tests can aim the mouse */
      toScreen: (x: number, y: number, z: number) => { x: number; y: number };
    };
  }
}

/**
 * test hooks (shots.mjs, playwright): jump to a scroll position and measure fps, p95 frame time
 * and draw calls per frame (summed over every post pass)
 */
export default function Probe() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const stats = useMemo(
    () => ({ frames: [] as number[], calls: 0, maxCalls: 0, sceneCalls: 0, sceneAcc: 0, tris: 0, recording: false, last: 0 }),
    [],
  );

  useEffect(() => {
    gl.info.autoReset = false;
    // count the main scene pass (with its shadow maps) separately from the post quads
    const render = gl.render.bind(gl);
    gl.render = (s, c) => {
      const before = gl.info.render.calls;
      render(s, c);
      if (s === scene && c.layers.mask & 1) stats.sceneAcc += gl.info.render.calls - before;
    };
    window.__caseFile = {
      scene,
      store: useStore,
      toScreen: (x, y, z) => {
        const v = new Vector3(x, y, z).project(camera);
        return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
      },
      scrollTo: (p) => scrollToProgress(p),
      measure: (ms) =>
        new Promise((resolve) => {
          stats.frames = [];
          stats.maxCalls = 0;
          stats.recording = true;
          setTimeout(() => {
            stats.recording = false;
            const f = [...stats.frames].sort((a, b) => a - b);
            const avg = f.reduce((a, b) => a + b, 0) / Math.max(1, f.length);
            const { calls, maxCalls, sceneCalls, tris } = stats;
            const long = f.filter((x) => x > 25).length / Math.max(1, f.length);
            resolve({ fps: 1000 / avg, p95: f[Math.floor(f.length * 0.95)] ?? 0, long, max: f[f.length - 1] ?? 0, calls, maxCalls, sceneCalls, tris });
          }, ms);
        }),
    };
    return () => {
      gl.render = render;
      gl.info.autoReset = true;
      delete window.__caseFile;
    };
  }, [gl, scene, camera, stats]);

  // runs after the composer (priority 1) has rendered
  useFrame(() => {
    const now = performance.now();
    if (stats.recording && stats.last) stats.frames.push(now - stats.last);
    stats.last = now;
    stats.calls = gl.info.render.calls;
    if (stats.recording) stats.maxCalls = Math.max(stats.maxCalls, stats.calls);
    stats.sceneCalls = stats.sceneAcc;
    stats.sceneAcc = 0;
    stats.tris = gl.info.render.triangles;
    gl.info.reset();
  }, 2);
  return null;
}
