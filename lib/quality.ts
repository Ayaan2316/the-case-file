// quality tiers. first guess from gpu hints, then adjusted live by drei's PerformanceMonitor,
// can be overridden from the settings menu
import { FORCE_3D, OLD_GPU, SOFTWARE_GPU } from "./mode";

export type Tier = "ultra" | "medium" | "low";

export type TierSettings = {
  dpr: [number, number];
  dof: boolean;
  shafts: boolean;
  dust: number;
  rainRefraction: boolean;
  rainScale: number; // render target scale for the refraction view
  bloom: boolean;
  grain: boolean;
  chromaticAberration: boolean; // its own fullscreen pass, a convolution can't merge with SMAA
  shadows: boolean;
  flashlightShadows: boolean;
  shineLights: number; // baked lights that also draw specular highlights (shine.ts)
  // baked lights for the live lit pieces (pages, drawer files). all of them on every tier since it's
  // the only light they get - with three, low's drawer files were black. they're small on screen anyway
  liveLights: number;
  torchShadowHalfRate?: boolean; // torch shadow map updates every other frame
};

// medium = one pixel per css pixel. on a laptop at 125-150% scaling that's a third to half fewer
// pixels than native and iGPUs are fill bound (want 45+ fps). with the desk depth drawn first
// (depthFirst in batch.ts) an Arc 140T does every medium view in under 12ms, which pays for the
// torch shadows. without them the beam went straight through the door
export const TIERS: Record<Tier, TierSettings> = {
  ultra: { dpr: [1, 2], dof: true, shafts: true, dust: 900, rainRefraction: true, rainScale: 1, bloom: true, grain: true, chromaticAberration: true, shadows: true, flashlightShadows: true, shineLights: 10, liveLights: 10 },
  medium: { dpr: [1, 1], dof: false, shafts: true, dust: 350, rainRefraction: true, rainScale: 0.5, bloom: true, grain: true, chromaticAberration: false, shadows: true, flashlightShadows: true, shineLights: 4, liveLights: 10 },
  low: { dpr: [1, 1], dof: false, shafts: false, dust: 0, rainRefraction: false, rainScale: 0.5, bloom: true, grain: true, chromaticAberration: false, shadows: false, flashlightShadows: false, shineLights: 0, liveLights: 10 },
};

const ORDER: Tier[] = ["low", "medium", "ultra"];

/** adaptive resolution steps. heavy view loses a bit of sharpness first, then a tier */
export const RENDER_SCALES = [1, 0.875, 0.75] as const;

/**
 * a tier under load drops extras before sharpness, a blurry view looks worse than a sharp one with
 * fewer highlights (ultra on the iGPU once sat at 75% res and the office went soft).
 * each rung adds to the ones before. nothing here turns shadows or a post effect off, that
 * recompiles every shader and the stall is worse than the frames you'd save
 * - ultra: most expensive per pixel extras, then torch shadows at half rate
 * - medium: half the highlights and dust, smaller rain view, torch shadows at half rate
 */
const TRIMS: Record<Tier, Partial<TierSettings>[]> = {
  ultra: [
    { chromaticAberration: false, shineLights: 6, dust: 500, rainScale: 0.5 },
    { shineLights: 4, torchShadowHalfRate: true },
  ],
  medium: [{ shineLights: 2, dust: 150, rainScale: 0.35, torchShadowHalfRate: true }],
  low: [],
};

/** how many rungs a tier can drop before resolution steps down */
export const trimsFor = (tier: Tier) => TRIMS[tier].length;

/** tier settings after dropping `trim` rungs */
export function settingsFor(tier: Tier, trim: number): TierSettings {
  let t = TIERS[tier];
  for (const rung of TRIMS[tier].slice(0, Math.max(0, trim))) t = { ...t, ...rung };
  return t;
}

/**
 * resolution steps per tier. ultra never goes below one pixel per screen pixel (on a 125% screen
 * that's 1 -> 0.875 -> 0.8, not 0.75). medium is the plain steps. low goes on to 62.5% then 50%,
 * on old laptop gpus smooth beats sharp (stutter looks broken, soft still looks like film).
 * below that we switch to the photos (SlowGuard)
 */
export function renderScales(tier: Tier, devicePixelRatio: number): number[] {
  if (tier === "low") return [...RENDER_SCALES, 0.625, 0.5];
  if (tier !== "ultra") return [...RENDER_SCALES];
  const [lo, hi] = TIERS.ultra.dpr;
  const base = Math.min(Math.max(devicePixelRatio, lo), hi);
  const floor = 1 / base;
  const steps = RENDER_SCALES.filter((s) => s >= floor - 1e-6) as number[];
  if (steps[steps.length - 1] - floor > 1e-3) steps.push(floor);
  return steps;
}

export const lowerTier = (t: Tier): Tier => ORDER[Math.max(0, ORDER.indexOf(t) - 1)];

/** phone or tablet (touch first): low tier, half size textures, shorter runway */
export function isPhone() {
  if (typeof window === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.matchMedia("(pointer: coarse)").matches;
}

/** gpu name from webgl, `?gpu=<name>` fakes it for testing */
export function rendererName() {
  if (typeof window === "undefined") return "";
  // mode.ts already asked before first paint
  if (window.__gpu) return window.__gpu.name;
  const fake = new URLSearchParams(location.search).get("gpu");
  if (fake !== null) return fake;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const name = info ? String(gl?.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return name;
  } catch {
    return "";
  }
}

/**
 * max pixels per css pixel on phones. their screens are 2-3x and one pixel per css pixel looked
 * soft everywhere (a pixel 7 was drawing 1 per 2.6). 1.5 is sharp at arm's length and still only
 * a fraction of native
 */
export const PHONE_DPR = 1.5;

/**
 * where a phone starts on low's resolution ladder (x PHONE_DPR), based on gpu name. flagships from
 * ~2020 at the top, budget chips (Mali-G5x and older, Adreno 610-613 and older, PowerVR) a bit
 * under 1, everything else in between. safari just says "Apple GPU" so iphones start in the middle.
 * the performance monitor moves it either way
 */
export function phoneStartScale(renderer: string) {
  if (/Adreno \(TM\) (6[4-9]\d|[7-9]\d\d)|Mali-G(6[1-9]\d|[7-9]\d\d)|Immortalis|Xclipse/i.test(renderer)) return 1;
  if (/Adreno \(TM\) ([1-5]\d\d|60\d|61[0-3])\b|Mali-(T|G[0-5]\d\b)|PowerVR/i.test(renderer)) return 0.625;
  return 0.75;
}

/**
 * budget phone (gpu in phoneStartScale's bottom group, or 3gb ram or less). CPU is 5-7x slower than
 * a laptop core so the cpu sets the frame rate, not just the gpu. gets steady 30 from the start,
 * no glow, single pass AA
 */
export function isBudgetPhone(renderer: string) {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return isPhone() && (phoneStartScale(renderer) < 0.7 || (memory !== undefined && memory <= 3));
}

/** first guess before we've measured anything */
export function guessTier(): Tier {
  if (typeof window === "undefined") return "medium";
  if (isPhone()) return "low";
  {
    const renderer = rendererName();
    if (/RTX|Radeon RX|Arc A|Apple M\d (Pro|Max|Ultra)/i.test(renderer)) return "ultra";
    // older laptop gpus (OLD_GPU in mode.ts) get the lite file. if they ask for the 3D anyway they
    // start on low, on medium the first 10 seconds would just be stepping down
    // (and dropping a tier recompiles every shader)
    if (OLD_GPU.some((r) => r.test(renderer))) return "low";
    if (/Intel|UHD|Iris|Mali|Adreno|PowerVR/i.test(renderer)) return "medium";
  }
  return "medium";
}

/**
 * can this browser run the 3D at all? "software" = webgl2 exists but runs on the cpu (SwiftShader,
 * llvmpipe, Microsoft Basic Render Driver) - a few fps, worse than the photos.
 * failIfMajorPerformanceCaveat asks the browser directly, the renderer name catches browsers
 * that don't answer it properly. `?gpu=` fakes it for tests like in guessTier
 */
export function webglSupport(): "ok" | "software" | "none" {
  if (typeof window === "undefined") return "none";
  if (window.__gpu) return window.__gpu.support;
  const release = (gl: WebGL2RenderingContext | null) => gl?.getExtension("WEBGL_lose_context")?.loseContext();
  try {
    const fast = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    if (fast) {
      const info = fast.getExtension("WEBGL_debug_renderer_info");
      const fake = new URLSearchParams(location.search).get("gpu");
      const renderer = fake ?? (info ? String(fast.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "");
      release(fast);
      return SOFTWARE_GPU.test(renderer) ? "software" : "ok";
    }
    const any = document.createElement("canvas").getContext("webgl2");
    release(any);
    return any ? "software" : "none";
  } catch {
    return "none";
  }
}

/**
 * visitor wants the 3D anyway ("Open the 3D case file", `?3d`, "Keep the 3D" on SlowNotice).
 * nothing turns it off for the rest of the visit. pass an arg to save it
 */
export function force3d(set?: boolean) {
  try {
    if (set !== undefined) sessionStorage.setItem(FORCE_3D, set ? "1" : "0");
    return sessionStorage.getItem(FORCE_3D) === "1";
  } catch {
    return false; // storage blocked, choice only lasts until the next check
  }
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
