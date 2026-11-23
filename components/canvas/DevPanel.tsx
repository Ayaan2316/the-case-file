"use client";

import { button, useControls } from "leva";
import { KEYFRAMES, rebuildPath } from "@/lib/cameraPath";
import { scrollToProgress } from "@/lib/scroll";

type V3 = [number, number, number];

/**
 * dev only shot tuning: scrub the timeline, pick a keyframe, nudge it live, copy the keyframes
 * as JSON to paste back into cameraPath.ts
 */
export default function DevPanel() {
  const [, set] = useControls("Camera", () => ({
    scrub: { value: 0, min: 0, max: 1, step: 0.001, onChange: (v: number, _p, ctx) => !ctx.initial && scrollToProgress(v) },
    keyframe: {
      value: 0,
      options: Object.fromEntries(KEYFRAMES.map((k, i) => [`${i}: t=${k.t}`, i])),
      onChange: (i: number, _p, ctx) => {
        if (ctx.initial) return;
        const k = KEYFRAMES[i];
        scrollToProgress(k.t);
        set({ position: k.position, target: k.target, fov: k.fov, focus: k.focusDistance });
      },
    },
    position: { value: KEYFRAMES[0].position as V3, step: 0.01, onChange: (v: V3, _p, ctx) => edit(ctx, (k) => (k.position = v)) },
    target: { value: KEYFRAMES[0].target as V3, step: 0.01, onChange: (v: V3, _p, ctx) => edit(ctx, (k) => (k.target = v)) },
    fov: { value: KEYFRAMES[0].fov, min: 20, max: 70, step: 0.5, onChange: (v: number, _p, ctx) => edit(ctx, (k) => (k.fov = v)) },
    focus: { value: KEYFRAMES[0].focusDistance, min: 0.2, max: 10, step: 0.05, onChange: (v: number, _p, ctx) => edit(ctx, (k) => (k.focusDistance = v)) },
    "Copy keyframe JSON": button(() => void navigator.clipboard.writeText(JSON.stringify(KEYFRAMES, null, 2))),
  }));

  function edit(ctx: { initial: boolean; get: (path: string) => unknown }, apply: (k: (typeof KEYFRAMES)[number]) => void) {
    if (ctx.initial) return;
    apply(KEYFRAMES[ctx.get("Camera.keyframe") as number]);
    rebuildPath();
  }
  return null;
}
