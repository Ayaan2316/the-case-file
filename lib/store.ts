import { create } from "zustand";
import type { Tier } from "./quality";

type State = {
  /** master scroll progress 0-1 (scroll.ts writes it) */
  progress: number;
  /** asset loading 0-1 for the darkroom loader */
  loaded: number;
  ready: boolean;
  /** room reflection probes are captured (rooms can be culled after this) */
  probesReady: boolean;
  /** evidence room loaded (lazy) and its probe captured */
  evidenceReady: boolean;
  evidenceProbe: boolean;
  /** same for the interrogation room */
  interroReady: boolean;
  interroProbe: boolean;
  tier: Tier;
  tierLocked: boolean;
  /**
   * asset set, picked once from the first tier: "" (full) or ".low" (phones, half size textures).
   * changing tier later never reloads the scene
   */
  assets: "" | ".low";
  /** shorter scroll runway (phones) */
  short: boolean;
  /** phone or tablet: own resolution (PHONE_DPR), max 60fps, no mouse-only passes */
  phone: boolean;
  /** gpu does its own hidden surface removal (Apple, PowerVR), skip the depth pre-pass */
  hsr: boolean;
  /** budget phone (isBudgetPhone): no glow, FXAA instead of SMAA, steady 30 from the start */
  budget: boolean;
  /**
   * steady 30 = one frame every 33ms, evenly. budget phones start here, anything still under 45fps
   * at low's lowest resolution drops into it (SlowGuard)
   */
  fps30: boolean;
  /** adaptive resolution inside a tier (1 -> 0.75), set by the performance monitor */
  renderScale: number;
  /** how many rungs of the tier's ladder got dropped under load (settingsFor in quality.ts) */
  trim: number;
  reducedMotion: boolean;
  soundOn: boolean;
  /** a DOM panel is open - hide the flashlight, calm the camera down */
  reading: boolean;
  /** live grade inputs driven by events (lightning, SinCityRed fade) */
  flash: number;
  sinCityRed: number;
  /** desk lamp easter egg (konami code) */
  lampOn: boolean;
  /** fedora easter egg - hat brim over the view until this time (ms, performance.now) */
  hatUntil: number;
  /** evidence board: exhibit under the cursor + the one that's open */
  hoverExhibit: string | null;
  openExhibit: string | null;
  /** contact: phone stops ringing once answered, notepad is the tip form */
  phoneAnswered: boolean;
  notepadOpen: boolean;
  /** RÉSUMÉ drawer is out (camera looks at it, pdf downloads) */
  drawerOpen: boolean;
  /** resume window, the case report out of the drawer */
  resumeOpen: boolean;
  /**
   * why we're showing the photos instead of 3D (null = 3D is running). "unsupported" no webgl2,
   * "software" rendering on the cpu, "slow" too slow even on the lowest setting,
   * "lost" the driver dropped the context
   */
  flat: null | "unsupported" | "software" | "slow" | "lost";
  /** 3D is crawling at its lowest setting, offer the photos (SlowNotice) */
  slowPrompt: boolean;
  set: (patch: Partial<State>) => void;
};

export const useStore = create<State>((set) => ({
  progress: 0,
  loaded: 0,
  ready: false,
  probesReady: false,
  evidenceReady: false,
  evidenceProbe: false,
  interroReady: false,
  interroProbe: false,
  tier: "ultra",
  tierLocked: false,
  assets: "",
  short: false,
  phone: false,
  hsr: false,
  budget: false,
  fps30: false,
  renderScale: 1,
  trim: 0,
  reducedMotion: false,
  soundOn: false,
  reading: false,
  flash: 0,
  sinCityRed: 0,
  lampOn: false,
  hatUntil: 0,
  hoverExhibit: null,
  openExhibit: null,
  phoneAnswered: false,
  notepadOpen: false,
  drawerOpen: false,
  resumeOpen: false,
  flat: null,
  slowPrompt: false,
  set: (patch) => set(patch),
}));
