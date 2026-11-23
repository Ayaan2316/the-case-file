import { CatmullRomCurve3, MathUtils, Vector3 } from "three";
import { caseFile } from "@/content/case";
import { boardWorld, polaroidSpot } from "./board";

// camera path for the whole scroll. three.js coords: x right, y up, z towards the corridor.
// blender (x, y, z) -> (x, z, -y), so corridor is z > 0 and the office is z < 0
export type Keyframe = {
  t: number;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  focusDistance: number;
  shake: number;
  grade: number; // how much SinCityRed
  /** new shot - no spline from the last keyframe, camera cuts (hidden by a dip to black) */
  cut?: boolean;
};

const BEATS_BOARD = { wide: 0.4, first: 0.415, step: 0.022 };
const BEATS_TABLE = { slide: [0.602, 0.64] as const };
const BEATS_INTERRO = { transcript: [0.712, 0.78] as const, mirror: 0.79, verdict: [0.805, 0.88] as const, stamp: 0.85 };

/** scroll positions where we cut to a different room */
export const CUTS = { table: 0.58, interrogation: 0.665, contact: 0.885 } as const;
const DIP = 0.006;
// contact: ringing phone, then turn to the filing cabinet and the RÉSUMÉ drawer slides out with
// the scroll. story ends there
const BEATS_CONTACT = { phone: [CUTS.contact, 0.935] as const, cabinet: [0.962, 0.988] as const };

/** evidence table centre (TABLE in evidence_room.py, top at 0.92m) */
export const TABLE = new Vector3(2.1, 0.92, -31.75);

export type Space = "corridor" | "office" | "evidence" | "interrogation";

/** interrogation table centre (TABLE in interrogation_room.py, top at 0.76m) */
export const INTERRO = new Vector3(2.0, 0.76, -41.8);
/** verdict lands on the case file on the interrogation table */
export const CASE_FILE = new Vector3(2.34, 0.77, -41.94);

/**
 * where the camera actually is: smoothed progress (lags the scroll a bit), the black dip around
 * a cut, and which room. culling and room effects read this instead of raw scroll so nothing
 * switches before the camera gets there
 */
export const camera = { p: 0, blackout: 0, space: "corridor" as Space, focus: 2.5 };

/** RÉSUMÉ drawer while it's out (CameraRig blends towards it) */
export const CABINET_VIEW = { position: new Vector3(1.62, 1.12, -3.12), target: new Vector3(0.86, 0.5, -3.72), fov: 40, focus: 1.1 };

/** camera shake when the stamp lands - when it happened + how hard */
export const impact = { at: -10, strength: 0 };

export function updateCameraState(p: number) {
  camera.p = p;
  camera.blackout = Math.max(...Object.values(CUTS).map((c) => 1 - MathUtils.smoothstep(Math.abs(p - c), 0, DIP)));
  camera.space =
    p >= CUTS.contact ? "office" : p >= CUTS.interrogation ? "interrogation" : p >= CUTS.table ? "evidence" : p < 0.11 ? "corridor" : "office";
}

/** scroll position of each exhibit's close up */
export const EXHIBIT_STEPS = caseFile.exhibits.map((e, index) => ({
  id: e.id,
  index,
  t: BEATS_BOARD.first + index * BEATS_BOARD.step,
}));

export const KEYFRAMES: Keyframe[] = [
  // corridor - slow push towards the door, lettering comes into focus
  { t: 0.0, position: [0.9, 1.6, 7.6], target: [0.9, 1.45, 0], fov: 38, focusDistance: 7.4, shake: 1, grade: 0 },
  { t: 0.05, position: [0.88, 1.6, 3.6], target: [0.9, 1.5, 0], fov: 38, focusDistance: 3.5, shake: 1, grade: 0 },
  { t: 0.085, position: [0.82, 1.57, 1.25], target: [0.92, 1.55, 0.1], fov: 36, focusDistance: 1.15, shake: 0.6, grade: 0 },
  // door opens, we go through
  { t: 0.115, position: [0.9, 1.6, 0.55], target: [1.3, 1.35, -2.0], fov: 40, focusDistance: 2.2, shake: 0.8, grade: 0 },
  { t: 0.14, position: [0.98, 1.62, -0.1], target: [2.05, 1.15, -3.4], fov: 46, focusDistance: 2.6, shake: 1, grade: 0 },
  // office wide shot, typewriter types the headline
  { t: 0.19, position: [1.05, 1.62, -0.22], target: [2.25, 1.05, -3.6], fov: 48, focusDistance: 2.6, shake: 1, grade: 0 },
  { t: 0.26, position: [1.4, 1.5, -0.85], target: [2.3, 0.85, -2.45], fov: 42, focusDistance: 1.7, shake: 0.7, grade: 0 },
  // dossier - dive down to the folder (2.57, 0.753, -2.27), read from the visitor's side so
  // the pages are the right way up
  { t: 0.285, position: [2.15, 1.32, -1.45], target: [2.5, 0.76, -2.27], fov: 40, focusDistance: 1.0, shake: 0.4, grade: 0 },
  { t: 0.305, position: [2.53, 1.18, -2.03], target: [2.53, 0.757, -2.275], fov: 40, focusDistance: 0.49, shake: 0.15, grade: 0 },
  { t: 0.36, position: [2.53, 1.15, -2.05], target: [2.53, 0.757, -2.275], fov: 40, focusDistance: 0.46, shake: 0.15, grade: 0 },
  ...boardKeyframes(),
  ...tableKeyframes(),
  ...interrogationKeyframes(),
  ...contactKeyframes(),
];

/**
 * evidence board: up off the desk, turn to the wall, SinCityRed fades in,
 * then nudge to each polaroid A-G and pull back
 */
function boardKeyframes(): Keyframe[] {
  const v = (p: Vector3) => p.toArray() as [number, number, number];
  const wide = { position: v(boardWorld(0, -0.02, 1.85)), target: v(boardWorld(0, 0, 0)), fov: 40, focusDistance: 1.85 };
  const keys: Keyframe[] = [
    { t: 0.38, position: [2.15, 1.45, -1.85], target: [1.75, 1.45, -3.9], fov: 40, focusDistance: 2.1, shake: 0.4, grade: 0.3 },
    { t: BEATS_BOARD.wide, ...wide, shake: 0.3, grade: 1 },
  ];
  for (const { id, t, index } of EXHIBIT_STEPS) {
    const { across, up } = polaroidSpot(id, index);
    keys.push({
      t,
      position: v(boardWorld(across * 0.85, up * 0.85 - 0.01, 0.85)),
      target: v(boardWorld(across, up, 0)),
      fov: 34,
      focusDistance: 0.85,
      shake: 0.2,
      grade: 1,
    });
  }
  keys.push({ t: 0.565, ...wide, position: v(boardWorld(0, -0.02, 1.7)), shake: 0.3, grade: 1 });
  keys.push({ t: CUTS.table - 0.002, ...wide, position: v(boardWorld(0, -0.02, 1.62)), shake: 0.3, grade: 1 });
  return keys;
}

/**
 * evidence table: cut to the store room, walk in from the door, slide along the bags overhead,
 * pull back over the whole table
 */
function tableKeyframes(): Keyframe[] {
  const T = TABLE;
  const slide = (t: number, x: number): Keyframe => ({
    t,
    position: [x, T.y + 0.5, T.z + 0.37],
    target: [x + 0.07, T.y + 0.01, T.z - 0.01],
    fov: 40,
    focusDistance: 0.62,
    shake: 0.25,
    grade: 0,
  });
  const wide: Keyframe = { t: 0.652, position: [3.55, 1.85, -30.55], target: [T.x, T.y, T.z], fov: 46, focusDistance: 2.1, shake: 0.3, grade: 0 };
  return [
    { t: CUTS.table, position: [0.75, 1.72, -30.45], target: [2.15, 0.95, -31.8], fov: 46, focusDistance: 2.1, shake: 0.35, grade: 0, cut: true },
    { t: 0.594, position: [1.05, 1.58, -31.0], target: [1.45, 0.93, -31.72], fov: 42, focusDistance: 1.05, shake: 0.3, grade: 0 },
    slide(BEATS_TABLE.slide[0], 1.25),
    slide((BEATS_TABLE.slide[0] + BEATS_TABLE.slide[1]) / 2, T.x),
    slide(BEATS_TABLE.slide[1], 2.95),
    wide,
    { ...wide, t: CUTS.interrogation - 0.002, position: [3.62, 1.9, -30.5] },
  ];
}

/**
 * interrogation + verdict: cut in under the swinging lamp, sit in the detective's chair,
 * read the transcript while it types, see yourself in the mirror, look down for the stamp
 */
function interrogationKeyframes(): Keyframe[] {
  const T = INTERRO;
  const C = CASE_FILE;
  // kept this room in colour (warm lamp, red ink) instead of SinCityRed, looked better
  const k = (t: number, position: number[], target: number[], fov: number, focusDistance: number, shake: number, cut = false): Keyframe => ({
    t,
    position: position as [number, number, number],
    target: target as [number, number, number],
    fov,
    focusDistance,
    shake,
    grade: 0,
    ...(cut ? { cut } : {}),
  });
  return [
    k(CUTS.interrogation, [0.55, 1.7, -40.3], [2.2, 0.9, -42.0], 50, 2.4, 0.4, true),
    k(0.684, [1.55, 1.48, -40.72], [T.x - 0.05, T.y + 0.04, T.z - 0.05], 44, 1.3, 0.35),
    k(0.7, [2.08, 1.2, -41.0], [2.12, T.y + 0.01, -41.62], 42, 0.75, 0.25),
    // leaning over the paper and following the typing down. type is ~4mm so the lens
    // needs to be about a third of a metre away
    k(BEATS_INTERRO.transcript[0] + 0.006, [2.168, 1.05, -41.57], [2.168, 0.762, -41.754], 34, 0.34, 0.15),
    k(BEATS_INTERRO.transcript[1] - 0.004, [2.176, 1.045, -41.515], [2.176, 0.762, -41.695], 34, 0.34, 0.15),
    // one-way mirror, the room and you in it
    k(BEATS_INTERRO.mirror, [2.2, 1.52, -41.42], [3.98, 1.45, -41.95], 46, 1.85, 0.25),
    // verdict - down to the case file, stamp slams at BEATS.stamp
    k(BEATS_INTERRO.verdict[0], [2.28, 1.27, -41.68], [C.x, C.y, C.z], 40, 0.56, 0.2),
    k(0.838, [C.x - 0.01, 1.13, C.z + 0.13], [C.x, C.y, C.z - 0.01], 38, 0.4, 0.15),
    k(BEATS_INTERRO.verdict[1], [C.x - 0.01, 1.12, C.z + 0.14], [C.x, C.y, C.z - 0.01], 38, 0.39, 0.15),
    k(CUTS.contact - 0.002, [C.x - 0.01, 1.12, C.z + 0.14], [C.x, C.y, C.z - 0.01], 38, 0.39, 0.15),
  ];
}

/**
 * contact: cut back to the office desk (cabinet + board behind), ease in on the ringing phone,
 * then turn to the cabinet while the RÉSUMÉ drawer slides out. goes round the front-left corner
 * of the desk because the straight path went through the banker's lamp
 */
function contactKeyframes(): Keyframe[] {
  const k = (t: number, position: number[], target: number[], fov: number, focusDistance: number, shake: number, cut = false): Keyframe => ({
    t,
    position: position as [number, number, number],
    target: target as [number, number, number],
    fov,
    focusDistance,
    shake,
    grade: 0,
    ...(cut ? { cut } : {}),
  });
  return [
    k(CUTS.contact, [3.35, 1.35, -1.35], [2.0, 0.85, -3.0], 46, 1.4, 0.4, true),
    k(0.905, [3.27, 1.29, -1.58], [2.72, 0.83, -2.74], 42, 1.1, 0.3),
    k(0.925, [3.2, 1.25, -1.7], [2.8, 0.82, -2.7], 40, 0.95, 0.25),
    k(BEATS_CONTACT.phone[1], [3.18, 1.245, -1.73], [2.8, 0.82, -2.7], 40, 0.95, 0.25),
    k(0.96, [1.3, 1.2, -1.85], [1.0, 0.7, -3.4], 44, 1.8, 0.35),
    k(0.985, CABINET_VIEW.position.toArray(), CABINET_VIEW.target.toArray(), CABINET_VIEW.fov, CABINET_VIEW.focus, 0.15),
    k(1.0, [1.6, 1.11, -3.15], CABINET_VIEW.target.toArray(), CABINET_VIEW.fov, CABINET_VIEW.focus, 0.12),
  ];
}

type Shot = { keys: Keyframe[]; positions: CatmullRomCurve3; targets: CatmullRomCurve3 };
let shots: Shot[] = [];

/** rebuild the splines after editing KEYFRAMES (dev panel does it live). one per shot */
export function rebuildPath() {
  const runs: Keyframe[][] = [];
  for (const k of KEYFRAMES) {
    if (k.cut || runs.length === 0) runs.push([]);
    runs[runs.length - 1].push(k);
  }
  shots = runs.map((keys) => {
    // one keyframe still needs two points to make a curve
    const pts = keys.length > 1 ? keys : [keys[0], keys[0]];
    return {
      keys: pts,
      positions: new CatmullRomCurve3(pts.map((k) => new Vector3(...k.position)), false, "centripetal"),
      targets: new CatmullRomCurve3(pts.map((k) => new Vector3(...k.target)), false, "centripetal"),
    };
  });
}
rebuildPath();

/** shot at `progress` + its keyframe times mapped onto the curve's control points */
function curveU(progress: number) {
  const p = MathUtils.clamp(progress, 0, 1);
  let s = 0;
  while (s < shots.length - 1 && p >= shots[s + 1].keys[0].t) s++;
  const shot = shots[s];
  const keys = shot.keys;
  let i = keys.findIndex((k, n) => n < keys.length - 1 && p <= keys[n + 1].t);
  if (i < 0) i = keys.length - 2;
  const a = keys[i];
  const b = keys[i + 1];
  const local = MathUtils.clamp((p - a.t) / Math.max(1e-6, b.t - a.t), 0, 1);
  return { shot, i, local, u: (i + local) / (keys.length - 1) };
}

const smooth = (x: number) => x * x * (3 - 2 * x);

export function sampleCamera(progress: number, out: { position: Vector3; target: Vector3 }) {
  const { shot, i, local, u } = curveU(progress);
  shot.positions.getPoint(u, out.position);
  shot.targets.getPoint(u, out.target);
  const a = shot.keys[i];
  const b = shot.keys[i + 1];
  const e = smooth(MathUtils.clamp(local, 0, 1));
  return {
    fov: MathUtils.lerp(a.fov, b.fov, e),
    focusDistance: MathUtils.lerp(a.focusDistance, b.focusDistance, e),
    shake: MathUtils.lerp(a.shake, b.shake, e),
    grade: MathUtils.lerp(a.grade, b.grade, e),
  };
}

/** progress windows for scene events */
export const BEATS = {
  corridor: [0, 0.08],
  door: [0.08, 0.14],
  office: [0.14, 0.26],
  typewriter: [0.15, 0.24],
  dossier: [0.27, 0.36],
  folderOpen: [0.288, 0.306],
  pageFlip: [0.325, 0.344],
  board: [0.37, 0.58],
  table: [CUTS.table, CUTS.interrogation - 0.004],
  tableSlide: BEATS_TABLE.slide,
  interrogation: [CUTS.interrogation, BEATS_INTERRO.verdict[0]],
  transcript: BEATS_INTERRO.transcript,
  mirror: [BEATS_INTERRO.mirror - 0.012, BEATS_INTERRO.mirror + 0.01],
  verdict: BEATS_INTERRO.verdict,
  /** stamp lands here (and the camera shakes) */
  stamp: [BEATS_INTERRO.stamp, BEATS_INTERRO.stamp + 0.01],
  /** back at the desk, phone rings until you pick it up */
  contact: [CUTS.contact, 1],
  /** close up on the ringing phone before we turn to the cabinet */
  phone: BEATS_CONTACT.phone,
  /** RÉSUMÉ drawer slides out with the scroll, the end */
  cabinet: BEATS_CONTACT.cabinet,
} as const;

export const within = (p: number, [a, b]: readonly [number, number]) => MathUtils.clamp((p - a) / (b - a), 0, 1);

/**
 * reduced motion: no camera moves, scroll snaps between finished beats
 * (headline typed, folder open, each exhibit, stamp down)
 */
export const REDUCED_MOTION_STOPS = [
  0,
  0.13,
  0.245,
  0.31,
  0.35,
  BEATS_BOARD.wide,
  ...EXHIBIT_STEPS.map((s) => s.t),
  0.6,
  0.645,
  0.69,
  0.785,
  BEATS_INTERRO.mirror + 0.005,
  0.87,
  0.93,
  1,
];
