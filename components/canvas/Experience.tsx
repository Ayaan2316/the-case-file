"use client";

import { PerformanceMonitor, Preload } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import dynamic from "next/dynamic";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { DefaultLoadingManager, FogExp2, MathUtils, NoToneMapping, SRGBColorSpace } from "three";
import { camera as shot, within } from "@/lib/cameraPath";
import { OFF, SCALE } from "@/lib/debug";
import { force3d, lowerTier, PHONE_DPR, renderScales, TIERS, trimsFor } from "@/lib/quality";
import { useStore } from "@/lib/store";
import CameraRig from "./CameraRig";
import CitySky from "./effects/CitySky";
import Effects from "./effects/Effects";
import PostFX, { type PostFXHandle } from "./effects/PostFX";
import Probe from "./Probe";
import RoomProbe from "./RoomProbe";
import CaseFile from "./scenes/CaseFile";
import EvidenceRoom from "./scenes/EvidenceRoom";
import Interrogation from "./scenes/Interrogation";

// leva panel, dev builds only
const DevPanel =
  process.env.NODE_ENV === "development" ? dynamic(() => import("./DevPanel"), { ssr: false }) : () => null;

/** the webgl part (client only) */
export default function Experience() {
  const tier = useStore((s) => s.tier);
  const renderScale = useStore((s) => SCALE ?? s.renderScale);
  const phone = useStore((s) => s.phone);
  const fps30 = useStore((s) => s.fps30);
  const capped = phone || fps30;
  const settings = TIERS[tier];
  const post = useRef<PostFXHandle>(null);
  const [lo, hi] = settings.dpr;
  const base = phone ? Math.min(window.devicePixelRatio, PHONE_DPR) : Math.min(Math.max(window.devicePixelRatio, lo), hi);
  const dpr = base * renderScale;
  // where we last stepped down. only step back up once the camera has moved on, otherwise a view
  // right on the edge flip-flops (and every change reallocates all the buffers)
  const declinedAt = useRef(-1);

  return (
    <Canvas
      className="experience-canvas"
      // phones + steady 30 render from FrameCap's loop, everything else uses R3F's
      frameloop={capped ? "never" : "always"}
      dpr={dpr}
      shadows={settings.shadows ? "percentage" : false}
      gl={{ antialias: false, powerPreference: "high-performance", stencil: false }}
      camera={{ fov: 38, near: 0.03, far: 140, position: [0.9, 1.6, 7.6] }}
      onCreated={({ gl, scene, get }) => {
        // tone mapping (AgX) happens in the post stack so grading still sees HDR
        gl.toneMapping = NoToneMapping;
        gl.outputColorSpace = SRGBColorSpace;
        scene.fog = new FogExp2("#0b1018", 0.02);
        // old or overloaded drivers can drop the context (black canvas from then on). if it doesn't come
        // back after a moment, switch to the photos. not when the canvas itself went away (photos replacing
        // it, leaving the page) or react made a new renderer (StrictMode in dev)
        gl.domElement.addEventListener("webglcontextlost", () => {
          setTimeout(() => {
            const s = useStore.getState();
            if (s.flat || !gl.domElement.isConnected || get().gl !== gl || !gl.getContext().isContextLost()) return;
            s.set({ flat: "lost" });
          }, 1500);
        });
      }}
    >
      {/*
       * target is 45+ fps on medium. under 50 for most of 2.5s -> step the resolution down, only drop
       * a tier at the bottom. solid at the refresh rate -> step back up. (at 47 a view averaging 45
       * never stepped because uneven frames kept a quarter of the samples above it)
       */}
      <PerformanceMonitor
        bounds={(refresh) => (useStore.getState().fps30 ? [25, 29] : refresh > 100 && !phone ? [62, 100] : [50, 58])}
        onDecline={() => {
          const s = useStore.getState();
          const scales = renderScales(s.tier, window.devicePixelRatio);
          const i = scales.findIndex((x) => Math.abs(x - s.renderScale) < 1e-3);
          declinedAt.current = s.progress;
          // extras go first, then resolution, then the tier itself (unless the visitor picked it). medium
          // never drops to low on its own - low is for people who asked for the 3D (phones, older computers),
          // everyone else gets offered the lite file (SlowNotice) and only "Keep the 3D" lets it keep going down
          if (s.trim < trimsFor(s.tier)) s.set({ trim: s.trim + 1 });
          else if (i >= 0 && i < scales.length - 1) s.set({ renderScale: scales[i + 1] });
          else if (!s.tierLocked && s.tier === "medium" && !force3d()) {
            if (!s.slowPrompt) s.set({ slowPrompt: true });
          } else if (!s.tierLocked && s.tier !== "low") s.set({ tier: lowerTier(s.tier), renderScale: 1, trim: 0 });
        }}
        onIncline={() => {
          const s = useStore.getState();
          // at steady 30 every frame is on time no matter the headroom, don't read that as spare
          if (s.fps30 || Math.abs(s.progress - declinedAt.current) <= 0.04) return;
          const scales = renderScales(s.tier, window.devicePixelRatio);
          const i = scales.findIndex((x) => Math.abs(x - s.renderScale) < 1e-3);
          if (i > 0) s.set({ renderScale: scales[i - 1] });
          else if (s.trim > 0) s.set({ trim: s.trim - 1 });
        }}
      />
      <Suspense fallback={null}>
        <CitySky />
        <CaseFile />
        <Effects />
        <Preload all />
        <ReadySignal />
      </Suspense>
      <EvidenceRoom />
      <Interrogation />
      <LoadProgress />
      <CameraRig onFocus={(d) => post.current?.setFocus(d)} />
      <Fog />
      {!OFF.has("post") && <PostFX ref={post} />}
      <Probe />
      <SlowGuard />
      {capped && <FrameCap />}
      <DevPanel />
      <RoomProbe />
    </Canvas>
  );
}

/**
 * phones on 120hz+ screens draw every other tick (60fps at 120hz). otherwise android draws twice
 * the frames for nothing, heats up and throttles within a minute or two and drops frames anyway.
 * 60 and 90hz draw every tick, halving 90 would give 45 which the monitor reads as too slow.
 * draw once 9.5ms have passed (120hz ticks every 8.3, 90hz every 11.1) with some room for jitter.
 * steady 30 (`fps30`) waits 29.5ms: every 2nd tick at 60, 3rd at 90, 4th at 120.
 * even frames feel like film, wandering between 30 and 45 feels like stutter
 */
function FrameCap() {
  const advance = useThree((s) => s.advance);
  const clock = useThree((s) => s.clock);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < (useStore.getState().fps30 ? 29.5 : 9.5)) return;
      // R3F times a frame from its clock in seconds. start the clock one frame back or the first frame
      // lasts as long as the page has been open
      if (!last) clock.elapsedTime = t / 1000 - 1 / 60;
      last = t;
      advance(t / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [advance, clock]);
  return null;
}

/**
 * last resorts, based on the median frame of 4s windows (shader compiles / room loads don't count):
 * - under 8fps for two windows anywhere: it's a slideshow, no time to step down one rung at a time
 *   (each needs seconds of frames, minutes at that rate). lite file takes over, or if they asked
 *   for the 3D (phones, older computers) straight to low at 50%
 * - at low's 50% and still under 45 for two windows: steady 30 (`fps30`)
 * - at steady 30, under 20 for two windows: SlowNotice offers the photos, under 8: photos take over
 * not when the visitor picked a tier, and once they force the 3D it only steps down.
 * first 3s after load don't count (shaders, probes), one frozen frame counts as half a second max
 * and a window needs 8 frames - on the live site a single 1.4s stall right after load once filled
 * a whole window and dropped an RTX laptop from ultra to low
 */
function SlowGuard() {
  const acc = useMemo(() => ({ frames: [] as number[], time: 0, warm: 0, slow: 0, crawl: 0, jump: 0 }), []);
  useFrame((_, delta) => {
    const s = useStore.getState();
    if (!s.ready || s.tierLocked || s.flat || document.hidden) {
      acc.frames.length = acc.time = acc.warm = acc.slow = acc.crawl = acc.jump = 0;
      return;
    }
    acc.warm += delta;
    if (acc.warm < 3) return;
    acc.frames.push(delta);
    acc.time += Math.min(delta, 0.5);
    if (acc.time < 4 || acc.frames.length < 8) return;
    const sorted = acc.frames.sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    acc.frames.length = acc.time = 0;
    const low = renderScales("low", window.devicePixelRatio);
    const floor = low[low.length - 1];
    if (s.tier !== "low" || Math.abs(s.renderScale - floor) > 1e-3) {
      acc.slow = acc.crawl = 0;
      acc.jump = median > 1 / 8 ? acc.jump + 1 : 0;
      if (acc.jump >= 2) {
        if (force3d()) s.set({ tier: "low", renderScale: floor, trim: 0 });
        else s.set({ flat: "slow" });
        acc.jump = 0;
      }
      return;
    }
    if (!s.fps30) {
      acc.slow = median > 1 / 45 ? acc.slow + 1 : 0;
      if (acc.slow >= 2) {
        s.set({ fps30: true });
        acc.slow = acc.crawl = 0;
      }
      return;
    }
    acc.slow = median > 1 / 20 ? acc.slow + 1 : 0;
    acc.crawl = median > 1 / 8 ? acc.crawl + 1 : 0;
    if (acc.slow < 2 || force3d()) return;
    if (acc.crawl >= 2) s.set({ flat: "slow" });
    else if (!s.slowPrompt) s.set({ slowPrompt: true });
  });
  return null;
}

/** corridor is dustier than the office */
function Fog() {
  const scene = useThree((s) => s.scene);
  useFrame(() => {
    const fog = scene.fog as FogExp2 | null;
    if (!fog) return;
    const inOffice = within(useStore.getState().progress, [0.1, 0.16]);
    // store room has a bit of dust in the lamp light,
    // interrogation room is thick with old smoke under the lamp
    fog.density =
      shot.space === "interrogation" ? 0.02 : shot.space === "evidence" ? 0.012 : MathUtils.lerp(0.03, 0.005, inOffice);
  });
  return null;
}

/** real loading progress for the darkroom loader */
function LoadProgress() {
  useEffect(() => {
    // loaders report while other components render, so defer the store update
    const prev = DefaultLoadingManager.onProgress;
    DefaultLoadingManager.onProgress = (url, loaded, total) => {
      prev?.(url, loaded, total);
      requestAnimationFrame(() => useStore.getState().set({ loaded: Math.min(loaded / Math.max(total, 1), 0.99) }));
    };
    return () => {
      DefaultLoadingManager.onProgress = prev;
    };
  }, []);
  return null;
}

/** only mounts once everything in Suspense has loaded */
function ReadySignal() {
  useEffect(() => {
    useStore.getState().set({ loaded: 1, ready: true });
    document.documentElement.dataset.ready = "true";
  }, []);
  return null;
}
