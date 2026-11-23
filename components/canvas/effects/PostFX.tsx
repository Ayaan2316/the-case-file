"use client";

import { useFrame, useThree } from "@react-three/fiber";
import {
  Bloom,
  ChromaticAberration,
  DepthOfField,
  EffectComposer,
  FXAA,
  Noise,
  SMAA,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction, type DepthOfFieldEffect, EffectPass, ToneMappingMode } from "postprocessing";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { MathUtils, type PerspectiveCamera, Vector2 } from "three";
import { OFF } from "@/lib/debug";
import { settingsFor } from "@/lib/quality";
import { useStore } from "@/lib/store";
import { BEATS, camera as shot, within } from "@/lib/cameraPath";
import { SinCityRedEffect, SplitToneEffect, WhiteBalanceEffect } from "./grading";
import { MagnifierEffect } from "./Magnifier";

/**
 * per channel white balance is a stronger correction than blender's chromatic adaptation,
 * so 4400K here matches the stills rendered at 3700K (checked side by side)
 */
const WHITE_BALANCE_K = 4400;

export type PostFXHandle = { setFocus: (distance: number) => void };

const query = typeof location === "undefined" ? new URLSearchParams() : new URLSearchParams(location.search);
/**
 * lens-like depth of field. a lens blurs depth d by |d - s| / d so the sharp range grows with focus
 * distance s, and max blur goes as focal length^2 / (f-stop * s). same as the review stills
 * (cameras.py) close ups at f/2, wide at f/4. BOKEH tuned on the f/2 desk still (34 deg vertical
 * fov, focus 1.25m, screenshots/blender/office_desk.png). ?frange= / ?bokeh= override for tuning
 */
const FOCUS_RANGE_PER_METRE = Number(query.get("frange")) || 1.45;
const BOKEH = Number(query.get("bokeh")) || 4;
const focalMm = (fovDeg: number) => 12 / Math.tan(MathUtils.degToRad(fovDeg) / 2); // 24mm sensor
const DESK = { focal: focalMm(34), focus: 1.25 };

/** post stack */
const PostFX = forwardRef<PostFXHandle>(function PostFX(_, ref) {
  const tier = useStore((s) => s.tier);
  const trim = useStore((s) => s.trim);
  const t = settingsFor(tier, trim);
  const dof = useRef<DepthOfFieldEffect>(null);
  const sinCity = useMemo(() => new SinCityRedEffect(), []);
  // ?wb=<kelvin> overrides white balance while matching the blender stills
  const whiteBalance = useMemo(
    () => new WhiteBalanceEffect(Number(new URLSearchParams(location.search).get("wb")) || WHITE_BALANCE_K),
    [],
  );
  const splitTone = useMemo(() => new SplitToneEffect(), []);
  const caOffset = useMemo(() => new Vector2(0.0011, 0.0006), []);
  const focus = useRef(2.5);
  // evidence board cursor, own pass at the end so it magnifies the finished frame
  const camera = useThree((s) => s.camera);
  const magnifier = useMemo(() => new MagnifierEffect(), []);
  const magnifierPass = useMemo(() => new EffectPass(camera, magnifier), [camera, magnifier]);
  // magnifier follows the mouse, without one (phones, tablets) the pass would just copy the frame again.
  // decided once when the stack is built (switching a pass off later blacks out the screen)
  const mouse = useMemo(() => matchMedia("(pointer: fine)").matches, []);
  // budget phone: no glow (a dozen small passes) and FXAA merged with the grade instead of SMAA's
  // three passes. set before the stack is built so nothing recompiles later
  const budget = useStore((s) => s.budget);
  const pointer = useRef({ x: 0.5, y: 0.5, mouse: false });

  useEffect(() => {
    const move = (e: PointerEvent) => {
      pointer.current = { x: e.clientX / innerWidth, y: 1 - e.clientY / innerHeight, mouse: e.pointerType === "mouse" };
    };
    const leave = () => (pointer.current.mouse = false);
    addEventListener("pointermove", move);
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      document.body.classList.remove("magnifier");
    };
  }, []);

  useImperativeHandle(ref, () => ({ setFocus: (d) => (focus.current = d) }), []);

  useFrame(({ camera, size }, delta) => {
    const s = useStore.getState();
    const board = within(s.progress, BEATS.board);
    const want = board > 0.05 && board < 0.97 && pointer.current.mouse && !s.openExhibit && !OFF.has("magnifier") ? 1 : 0;
    magnifier.strength = MathUtils.damp(magnifier.strength, want, 8, delta);
    magnifier.center.set(pointer.current.x, pointer.current.y);
    magnifier.aspect = size.width / size.height;
    document.body.classList.toggle("magnifier", magnifier.strength > 0.5);
    sinCity.intensity = s.sinCityRed;
    // cuts to another room happen inside a short dip to black (CUTS in cameraPath.ts)
    whiteBalance.exposure = (1 + s.flash * 2.5) * (1 - shot.blackout);
    const coc = dof.current?.cocMaterial;
    if (coc) {
      coc.worldFocusDistance = MathUtils.damp(coc.worldFocusDistance, focus.current, 4, delta);
      const fov = (camera as PerspectiveCamera).fov;
      const fStop = MathUtils.lerp(2, 4, MathUtils.smoothstep(fov, 34, 48));
      // DOF grows as f-stop * distance^2 / focal length^2. the effect has no sharp zone (any circle of
      // confusion blends into its half res blur), so past the desk close up the range opens up like a real
      // lens - 27mm at f/4 focused at 2.6m is sharp from 1.8 to 4.8m and the back wall stops going soft
      const s = coc.worldFocusDistance;
      const deep = Math.max(1, (fStop / 2) * (s / DESK.focus) * (DESK.focal / focalMm(fov)) ** 2);
      coc.worldFocusRange = s * FOCUS_RANGE_PER_METRE * deep;
      const k = (focalMm(fov) / DESK.focal) ** 2 * (DESK.focus / Math.max(coc.worldFocusDistance, 0.3)) * (2 / fStop);
      dof.current!.bokehScale = MathUtils.clamp(BOKEH * k, 0.3, 6);
    }
  });

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {budget ? <FXAA /> : <SMAA />}
      {t.dof && !OFF.has("dof") ? <DepthOfField ref={dof} worldFocusDistance={2.5} worldFocusRange={2.5 * FOCUS_RANGE_PER_METRE} bokehScale={BOKEH} /> : <></>}
      {t.bloom && !budget && !OFF.has("bloom") ? <Bloom mipmapBlur levels={5} luminanceThreshold={1.1} luminanceSmoothing={0.2} intensity={0.55} radius={0.7} /> : <></>}
      {/* white balance first, SinCityRed's greys need to stay grey and not pick up the 3700K correction */}
      <primitive object={whiteBalance} />
      <primitive object={sinCity} />
      <ToneMapping mode={ToneMappingMode.AGX} />
      {/* vignette before the display grade so the toe still keeps the corners above black */}
      <Vignette offset={0.32} darkness={0.55} />
      <primitive object={splitTone} />
      {t.grain && !OFF.has("grain") ? <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.16} /> : <></>}
      {t.chromaticAberration && !OFF.has("ca") ? <ChromaticAberration offset={caOffset} radialModulation modulationOffset={0.35} /> : <></>}
      {mouse ? <primitive object={magnifierPass} /> : <></>}
    </EffectComposer>
  );
});

export default PostFX;
