import { type Camera, MathUtils, Matrix3, Vector3, Vector4 } from "three";
import { blackbody } from "@/components/canvas/effects/grading";
import manifestJson from "@/public/models/scene.json";

// specular highlights from the baked lights. lightmaps only store the diffuse part of the spots,
// shelf LEDs and cove, but in cycles they also put glossy highlights on leather, lacquer, enamel
// and brass, which the room probe (one cube map from the middle of the room) can't place.
// materials.ts adds this to every lightmapped material

export const SHINE_MAX = 10;
/** live lit pieces have no lightmap so they always get at least this many */
const LIVE_MIN = 3;

type Highlight = {
  name: string;
  type: "POINT" | "SPOT" | "SUN" | "AREA";
  position: number[];
  direction: number[];
  axis?: number[];
  energyW: number;
  color: number[];
  temperature: number | null;
  spotSize: number | null;
  spotBlend: number | null;
  size: number[];
};

export type Room = "office" | "corridor" | "evidence" | "interrogation";

type Light = { pos: Vector3; dir: Vector3; axis: Vector3; color: Vector3; cone: Vector4 };

const LUMA = new Vector3(0.2126, 0.7152, 0.0722);

/**
 * what a highlight reflects if it's bigger than the light that casts shadows. the evidence lamp's
 * hard shadows come from the bulb but the steel table mirrors the whole glowing shade
 */
const GLOW_RADIUS: Record<string, number> = { bake_evid_lamp: 0.2 };

/** blender light -> radiant intensity (W/sr, same units as the lightmaps) + shape */
function toLight(h: Highlight): Light {
  const [r, g, b] = h.temperature ? blackbody(h.temperature) : [1, 1, 1];
  const tint = new Vector3(r * h.color[0], g * h.color[1], b * h.color[2]);
  tint.divideScalar(Math.max(tint.dot(LUMA), 1e-4)); // blender keeps luminance when tinting
  const area = h.type === "AREA";
  // point/spot: P / 4PI in every direction. one sided lambertian area: P / PI along its normal
  const intensity = area ? h.energyW / Math.PI : h.energyW / (4 * Math.PI);
  const half = (h.spotSize ?? Math.PI) / 2;
  const cone = new Vector4(
    area ? 2 : h.type === "SPOT" ? 1 : 0,
    Math.cos(half),
    Math.cos(half * (1 - (h.spotBlend ?? 0))),
    area ? h.size[1] : (GLOW_RADIUS[h.name] ?? h.size[0]), // strip thickness, or the bulb radius
  );
  const axis = new Vector3(...((h.axis ?? [1, 0, 0]) as [number, number, number])).multiplyScalar(area ? h.size[0] / 2 : 0);
  return {
    pos: new Vector3(...(h.position as [number, number, number])),
    dir: new Vector3(...(h.direction as [number, number, number])).normalize(),
    axis,
    color: tint.multiplyScalar(intensity),
    cone,
  };
}

// room volumes in three coords (blender x, z, -y), ceiling cove lights included
const ROOMS: Record<Room, [number[], number[]]> = {
  office: [[0, 0, -4], [5, 3.6, 0]],
  corridor: [[0, 0, 0], [1.8, 3.1, 8]],
  evidence: [[0, 0, -33.6], [4.2, 3.2, -30]],
  interrogation: [[0, 0, -43.6], [4.0, 3.1, -40]],
};
const roomOf = (p: number[]) =>
  (Object.keys(ROOMS) as Room[]).find((r) => p.every((v, i) => v >= ROOMS[r][0][i] - 0.05 && v <= ROOMS[r][1][i] + 0.05));

/**
 * lights per room, only the ones inside. moon, street lamp and neon come through blinds and glass,
 * and without shadows their highlights would leak onto everything facing the window, so they
 * stay diffuse only (baked)
 */
const LIGHTS: Record<Room, Light[]> = { office: [], corridor: [], evidence: [], interrogation: [] };
for (const h of (manifestJson as { highlights?: Highlight[] }).highlights ?? []) {
  const room = h.type === "SUN" ? undefined : roomOf(h.position);
  if (room) LIGHTS[room].push(toLight(h));
}
const ROOM_NAMES = Object.keys(LIGHTS) as Room[];

/**
 * per room, each light's eased share of two budgets: `spec` (highlights on lightmapped surfaces,
 * tier's shineLights) and `live` (all the light a live lit piece gets, tier's liveLights, at least
 * LIVE_MIN). a small budget goes to the lights that matter for what's in focus, not the brightest
 * ones. medium used to keep the cove + three spots and the resume drawer files, lit by lights
 * further down the list, came out black
 */
const SHARE = Object.fromEntries(
  ROOM_NAMES.map((r) => {
    const idx = LIGHTS[r].map((_, i) => i);
    return [r, { spec: idx.map(() => -1), live: idx.map(() => -1), score: idx.map(() => 0), rank: [...idx], order: [...idx] }];
  }),
) as Record<Room, { spec: number[]; live: number[]; score: number[]; rank: number[]; order: number[] }>;

const toFocus = new Vector3();
/** rough contribution of a light at the focus point (W/sr over distance squared, aimed lights by their aim) */
function relevance(l: Light, at: Vector3) {
  toFocus.subVectors(at, l.pos);
  const d2 = toFocus.lengthSq();
  const cos = toFocus.normalize().dot(l.dir);
  const aim = l.cone.x > 1.5 ? Math.max(cos, 0) : l.cone.x > 0.5 ? (cos > l.cone.y - 0.15 ? 1 : 0) : 1;
  return (l.color.dot(LUMA) * (0.15 + aim)) / (d2 + 0.5);
}

const makeUniforms = () => ({
  uShinePos: { value: Array.from({ length: SHINE_MAX }, () => new Vector3()) },
  uShineDir: { value: Array.from({ length: SHINE_MAX }, () => new Vector3()) },
  uShineAxis: { value: Array.from({ length: SHINE_MAX }, () => new Vector3()) },
  uShineColor: { value: Array.from({ length: SHINE_MAX }, () => new Vector3()) },
  uShineCone: { value: Array.from({ length: SHINE_MAX }, () => new Vector4()) },
  /** highlight share of each uploaded light relative to its live share (already in uShineColor) */
  uShineSpec: { value: new Float32Array(SHINE_MAX) },
  uShineCount: { value: 0 },
  uShineLiveCount: { value: 0 },
  uShineGain: { value: 1 },
});

/** shared by every material in a room, updated once a frame by updateShine() */
export const SHINE_UNIFORMS: Record<Room, ReturnType<typeof makeUniforms>> = {
  office: makeUniforms(),
  corridor: makeUniforms(),
  evidence: makeUniforms(),
  interrogation: makeUniforms(),
};

const normalMatrix = new Matrix3();
const forward = new Vector3();
const focusAt = new Vector3();

/**
 * picks each room's lights for this frame and moves them to view space (where the lighting shader
 * works). `focus` = camera focus distance (CameraRig). shares ease over ~0.3s so lights fade
 * instead of popping when the ranking changes
 */
export function updateShine(camera: Camera, maxLights: number, liveLights: number, gain: number, focus = 2.5, delta = 1) {
  normalMatrix.setFromMatrix4(camera.matrixWorldInverse);
  camera.getWorldDirection(forward);
  camera.getWorldPosition(focusAt).addScaledVector(forward, focus);
  const liveMax = Math.max(maxLights, liveLights, LIVE_MIN);
  for (const room of ROOM_NAMES) {
    const u = SHINE_UNIFORMS[room];
    const list = LIGHTS[room];
    const s = SHARE[room];
    for (let i = 0; i < list.length; i++) s.score[i] = relevance(list[i], focusAt);
    s.rank.sort((a, b) => s.score[b] - s.score[a]);
    for (let r = 0; r < s.rank.length; r++) {
      const i = s.rank[r];
      const spec = r < maxLights ? 1 : 0;
      const live = r < liveMax ? 1 : 0;
      s.spec[i] = s.spec[i] < 0 ? spec : MathUtils.damp(s.spec[i], spec, 4, delta);
      s.live[i] = s.live[i] < 0 ? live : MathUtils.damp(s.live[i], live, 4, delta);
    }
    // highlight lights first - the lightmapped loop stops at uShineCount, the live one keeps going
    s.order.sort((a, b) => s.spec[b] + s.live[b] - (s.spec[a] + s.live[a]));
    let n = 0;
    let nSpec = 0;
    for (const i of s.order) {
      if (n >= SHINE_MAX || s.live[i] < 0.002) break;
      const l = list[i];
      u.uShinePos.value[n].copy(l.pos).applyMatrix4(camera.matrixWorldInverse);
      u.uShineDir.value[n].copy(l.dir).applyMatrix3(normalMatrix).normalize();
      u.uShineAxis.value[n].copy(l.axis).applyMatrix3(normalMatrix);
      u.uShineColor.value[n].copy(l.color).multiplyScalar(s.live[i]);
      u.uShineCone.value[n].copy(l.cone);
      u.uShineSpec.value[n] = Math.min(1, s.spec[i] / s.live[i]);
      n++;
      if (s.spec[i] > 0.002) nSpec = n;
    }
    u.uShineCount.value = nSpec;
    u.uShineLiveCount.value = n;
    u.uShineGain.value = gain;
  }
}

export const SHINE_PARS = /* glsl */ `
#define SHINE_MAX ${SHINE_MAX}
uniform vec3 uShinePos[SHINE_MAX];
uniform vec3 uShineDir[SHINE_MAX];
uniform vec3 uShineAxis[SHINE_MAX];
uniform vec3 uShineColor[SHINE_MAX];
uniform vec4 uShineCone[SHINE_MAX];
uniform float uShineSpec[SHINE_MAX];
uniform int uShineCount;
uniform int uShineLiveCount;
uniform float uShineGain;
`;

/**
 * runs after the lightmap chunk (needs lightMapIrradiance) and before lights_fragment_end.
 * with SHINE_DIFFUSE defined it does the full lighting (diffuse too) for things that move or open.
 * point/spot lights are small spheres, strips are line lights (closest point to the reflection ray),
 * both energy normalised like Karis' UE4 area lights
 */
export const SHINE_FRAGMENT = /* glsl */ `
{
  // no shadows here, so where the bake says almost no light gets in keep highlights out too
  // and skip the lights completely (most of a night room, this loop is the most expensive part of a pixel)
  #ifdef USE_LIGHTMAP
    float lit = smoothstep(0.03, 0.4, dot(lightMapIrradiance, vec3(0.2126, 0.7152, 0.0722)));
  #else
    float lit = 1.0;
  #endif
  vec3 shine = vec3(0.0);
  vec3 N = geometryNormal;
  vec3 V = geometryViewDir;
  vec3 R = reflect(-V, N);
  float alpha = pow2(material.roughness);
  #ifdef SHINE_DIFFUSE
    int count = uShineLiveCount;
  #else
    int count = lit > 0.0 ? uShineCount : 0;
  #endif
  for (int i = 0; i < SHINE_MAX; i++) {
    if (i >= count) break;
    vec4 cone = uShineCone[i];
    vec3 toL = uShinePos[i] - geometryPosition;
    float lenNorm = 1.0;
    if (cone.x > 1.5) {
      vec3 a = toL - uShineAxis[i];
      vec3 ab = 2.0 * uShineAxis[i];
      float rab = dot(R, ab);
      float t = saturate((dot(R, a) * rab - dot(a, ab)) / max(dot(ab, ab) - rab * rab, 1e-5));
      toL = a + t * ab;
      lenNorm = alpha / saturate(alpha + length(ab) / (2.0 * length(toL)));
    }
    // near field clamp, a strip 5cm from the wall would blow up as 1/d^2
    float d2 = max(dot(toL, toL), cone.x > 1.5 ? 0.09 : 0.01);
    float d = sqrt(d2);
    vec3 L = toL / d;
    float dotNL = saturate(dot(N, L));
    float emit = cone.x > 1.5 ? saturate(dot(-L, uShineDir[i]))
               : cone.x > 0.5 ? smoothstep(cone.y, cone.z, dot(-L, uShineDir[i])) : 1.0;
    if (dotNL <= 0.0 || emit <= 0.0) continue;
    float widen = alpha / saturate(alpha + cone.w / (2.0 * d));
    vec3 E = uShineColor[i] * (emit * dotNL / d2);
    #ifndef SHINE_DIFFUSE
      E *= uShineSpec[i];
    #endif
    shine += E * BRDF_GGX(L, V, N, material) * widen * widen * lenNorm;
    #ifdef SHINE_DIFFUSE
      // live lit pieces (no lightmap - dossier pages, opened cover) get the diffuse too
      reflectedLight.directDiffuse += E * BRDF_Lambert(material.diffuseContribution);
    #endif
  }
  reflectedLight.directSpecular += shine * lit * uShineGain;
}
`;
