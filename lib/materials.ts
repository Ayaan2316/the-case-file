import {
  AdditiveBlending,
  Color,
  type Material,
  type Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  type Object3D,
  ShaderChunk,
  type Texture,
} from "three";
import { ANISO, OFF } from "./debug";
import { useStore } from "./store";
import { type Room, SHINE_FRAGMENT, SHINE_PARS, SHINE_UNIFORMS } from "./shine";

// lightmap + material setup for the baked GLBs. bake.py writes scene.json with which
// objects go in which lightmap group

export type SceneManifest = {
  groups: Record<string, { kind: "tiling" | "atlas"; lightmap: string; rgbmRange: number; objects: string[] }>;
  lights: { name: string; type: string; position: number[]; direction: number[]; energyW: number; temperature: number | null; color: number[]; spotAngle: number | null }[];
  follow: Record<string, string>;
  special: Record<string, "glass" | "emissive" | "fx">;
  pivots: Record<string, { position: number[]; quaternion: number[] }>;
};

/**
 * blender's diffuse light pass multiplies albedo, three treats lightmaps as irradiance
 * and divides by PI in lambert, so multiply by PI to match
 */
export const LIGHTMAP_INTENSITY = Math.PI;

/**
 * near black rough stuff that in cycles mostly shows a glossy sheen from a light right next
 * to it (cove LED on the charcoal wall). lightmaps only have diffuse and the probe can't place
 * a light that close, so bump the albedo to fake it. tuned against
 * screenshots/blender/office_establishing.png with `scripts/shots.mjs --cam`
 */
const SHEEN_GAIN: Record<string, number> = { office_feature_wall: 1.6 };

// three expands #includes after onBeforeCompile so swap the whole chunk for one that decodes
// RGBM (sqrt rgb, multiplier in alpha - see to_rgbm in bake.py)
const LIGHTS_FRAGMENT_MAPS_RGBM = ShaderChunk.lights_fragment_maps
  .replace(
    "vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;",
    "vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapTexel.rgb * lightMapTexel.a * RGBM_RANGE * lightMapIntensity;",
  )
  // lightmap already has all the diffuse light (sky through the window too), the HDRI
  // should only add reflections, not a second ambient
  .replace("iblIrradiance += getIBLIrradiance( geometryNormal );", "");
if (!LIGHTS_FRAGMENT_MAPS_RGBM.includes("RGBM_RANGE")) {
  throw new Error("three's lights_fragment_maps chunk changed: update the RGBM lightmap decode");
}

/**
 * three runs the full BRDF for every light on every pixel, even if the light is off or the pixel
 * is outside its cone. we keep six lights alive from the start (adding one later recompiles
 * every shader) and most are dark in any given room. on an old i5's UHD graphics that wasted
 * maths was a fifth of the frame. a light with zero colour adds nothing, so skip it.
 * global so every material picks it up
 */
const SKIP_DARK = "if ( directLight.color != vec3( 0.0 ) ) RE_Direct( directLight,";
if (!ShaderChunk.lights_fragment_begin.includes(SKIP_DARK)) {
  const patched = ShaderChunk.lights_fragment_begin.replaceAll("RE_Direct( directLight,", SKIP_DARK);
  if (patched === ShaderChunk.lights_fragment_begin) throw new Error("three's lights_fragment_begin chunk changed: update SKIP_DARK");
  ShaderChunk.lights_fragment_begin = patched;
}

const MACRO_NOISE = /* glsl */ `
  varying vec3 vMacroWorld;
  float macroHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float macroNoise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(macroHash(i + vec3(0,0,0)), macroHash(i + vec3(1,0,0)), f.x),
                   mix(macroHash(i + vec3(0,1,0)), macroHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(macroHash(i + vec3(0,0,1)), macroHash(i + vec3(1,0,1)), f.x),
                   mix(macroHash(i + vec3(0,1,1)), macroHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
`;

function patchShader(
  mat: MeshStandardMaterial,
  { rgbmRange, macro, room }: { rgbmRange: number; macro: boolean; room: Room | null },
) {
  mat.onBeforeCompile = (shader) => {
    shader.defines = { ...shader.defines, RGBM_RANGE: rgbmRange.toFixed(1) };
    shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_maps>", LIGHTS_FRAGMENT_MAPS_RGBM);
    if (room) {
      // highlights from the baked lights (shine.ts), shares the room's per frame uniforms
      Object.assign(shader.uniforms, SHINE_UNIFORMS[room]);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>
${SHINE_PARS}`)
        .replace("#include <lights_fragment_end>", `${SHINE_FRAGMENT}
#include <lights_fragment_end>`);
    }
    if (macro) {
      // break up the tiling, slow world space variation in colour + roughness
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vMacroWorld;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvMacroWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${MACRO_NOISE}`)
        .replace(
          "#include <map_fragment>",
          "#include <map_fragment>\nfloat macroN = macroNoise(vMacroWorld * 0.9) * 0.6 + macroNoise(vMacroWorld * 3.1) * 0.4;\ndiffuseColor.rgb *= mix(0.84, 1.1, macroN);",
        )
        .replace(
          "#include <roughnessmap_fragment>",
          "#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * mix(0.9, 1.12, macroN), 0.04, 1.0);",
        );
    }
  };
  mat.customProgramCacheKey = () => `rgbm${rgbmRange}${macro ? "m" : ""}${room ? "s" : ""}`;
}

/** find the lightmap group for a mesh (gltf nodes with several primitives turn into a Group) */
function groupOf(obj: Object3D, index: Map<string, string>): string | undefined {
  let o: Object3D | null = obj;
  while (o) {
    const g = index.get(o.name);
    if (g) return g;
    o = o.parent;
  }
  return undefined;
}

/** which room's lights a bake group gets its highlights from (group names from bake.py) */
function roomOfGroup(g: string): Room {
  return g.startsWith("corridor") ? "corridor" : g.startsWith("evidence") ? "evidence" : g.startsWith("interro") ? "interrogation" : "office";
}

export function prepareScene(root: Object3D, manifest: SceneManifest, lightmaps: Record<string, Texture>, room: Room = "office") {
  // low tier (phones, old laptops) skips the macro noise on tiled surfaces (16 hashes a pixel
  // on the office walls) and the highlight code on lightmapped ones. it draws no highlights anyway
  // but three still re-sent ~170 uniform floats before every draw, a quarter of a budget phone's
  // CPU frame. picked when the room loads, changing tier later doesn't recompile
  const lite = useStore.getState().tier === "low";
  const index = new Map<string, string>();
  for (const [g, info] of Object.entries(manifest.groups)) for (const name of info.objects) index.set(name, g);
  const done = new WeakSet<Material>();

  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const special = manifest.special[mesh.name] ?? manifest.special[mesh.parent?.name ?? ""];
    const g = groupOf(mesh, index);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m, i) => {
      for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap"] as const) {
        const tex = (m as MeshStandardMaterial)[key];
        if (tex) tex.anisotropy = ANISO ?? 8; // floors/desks are seen at grazing angles
      }
      // scanned models with alpha glass (wall clock, multimeter) keep their own material.
      // opaque panes get replaced, a picture frame's glass has the frame texture on it and would
      // otherwise sit over the artwork as an unlit sheet
      const ownAlpha = (m as MeshStandardMaterial).map && (m.transparent || m.alphaTest > 0);
      if (special === "glass" && !ownAlpha) {
        const glass = glassFor(m as MeshStandardMaterial, room);
        if (Array.isArray(mesh.material)) mesh.material[i] = glass;
        else mesh.material = glass;
        return;
      }
      const mat = m as MeshStandardMaterial;
      if (!mat.isMeshStandardMaterial || done.has(mat)) return;
      done.add(mat);
      if (special === "emissive") {
        mat.toneMapped = true;
        // use the gltf value, not the current one - react can run this twice in StrictMode
        mat.userData.gltfEmissive ??= mat.emissiveIntensity;
        mat.emissiveIntensity = Math.max(mat.userData.gltfEmissive, 1) * 1.6;
        return;
      }
      if (!g) return;
      const info = manifest.groups[g];
      const lm = lightmaps[info.lightmap];
      if (!lm) return;
      lm.colorSpace = NoColorSpace;
      lm.channel = info.kind === "tiling" ? 1 : 0;
      mat.lightMap = lm;
      mat.lightMapIntensity = LIGHTMAP_INTENSITY;
      if (SHEEN_GAIN[mat.name]) mat.color.setScalar(SHEEN_GAIN[mat.name]); // tiled materials are white
      if (OFF.has("albedo")) {
        // ?off=albedo -> 50% grey everywhere so you only see the baked lighting
        mat.map = null;
        mat.color.setScalar(0.5);
      }
      if (info.kind === "atlas" && mat.metalnessMap && !OFF.has("ao")) {
        // ORM red = baked AO. lightmap already has occlusion so half strength here,
        // mostly to keep reflections out of the cracks
        mat.aoMap = mat.metalnessMap;
        mat.aoMapIntensity = 0.5;
      }
      mat.envMapIntensity = 1; // env map is the room itself (RoomProbe)
      patchShader(mat, {
        rgbmRange: info.rgbmRange,
        macro: info.kind === "tiling" && !!mat.map && !OFF.has("macro") && !lite,
        room: OFF.has("shine") || lite ? null : roomOfGroup(g),
      });
      mat.needsUpdate = true;
    });
  });
}

/**
 * baked material but lit live (no lightmap, no AO) for things whose bake is wrong once they move,
 * like the case folder cover which baked dark underneath. direct light from the baked lights
 * (shine.ts, diffuse too), indirect from RoomProbe. `extra` can patch the shader more (paper back side etc)
 */
export function liveLit(
  src: MeshStandardMaterial,
  { room = "office", extra, key = "" }: { room?: Room; extra?: (shader: { fragmentShader: string }) => void; key?: string } = {},
) {
  const m = src.clone();
  m.lightMap = null;
  m.aoMap = null;
  m.envMapIntensity = 1;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SHINE_UNIFORMS[room]);
    shader.defines = { ...shader.defines, SHINE_DIFFUSE: "" };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${SHINE_PARS}`)
      .replace("#include <lights_fragment_end>", `${SHINE_FRAGMENT}\n#include <lights_fragment_end>`);
    extra?.(shader);
  };
  m.customProgramCacheKey = () => `live${key}`;
  return m;
}

/**
 * ink printed on paper in the browser (transcript, verdict label + stamp, evidence tags) sits
 * PRINT_LIFT metres above its sheet with a constant depth offset. slope-only polygon offset is
 * zero when you look at the sheet straight on, and a phone GPU then hid the print behind the
 * paper. the transcript came out blank on an actual phone
 */
export const PRINT_LIFT = 0.0004;
export const PRINT_DEPTH = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 } as const;

const glassCache = new Map<string, Material>();

/** highlights from a room's baked lights on a material without a lightmap */
function withShine<M extends Material>(m: M, room: Room) {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SHINE_UNIFORMS[room]);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
${SHINE_PARS}`)
      .replace("#include <lights_fragment_end>", `${SHINE_FRAGMENT}
#include <lights_fragment_end>`);
  };
  m.customProgramCacheKey = () => `shine-${room}`;
  return m;
}

function glassFor(src: MeshStandardMaterial, room: Room) {
  const key = src.name || "glass";
  const hit = glassCache.get(`${key}|${room}`);
  if (hit) return hit;
  let m: Material;
  if (/frosted/i.test(key)) {
    // door glass, lit from the office behind it. real transmission would re-render the whole scene
    // every frame the door is visible, so it's just a warm, slightly emissive see-through pane
    m = new MeshStandardMaterial({
      color: new Color("#cdbfa6"),
      emissive: new Color("#7a5228"),
      emissiveIntensity: 0.55,
      roughness: 0.45,
      transparent: true,
      opacity: 0.9,
    });
    // frosted glass lets most light through. lit like paper, the torch (right next to the camera)
    // bounced off it as a white disc with lens rings. so a soft knee on the live lights' luminance
    // (doing it per channel turned the warm glass grey). faint glow from far away stays about the same,
    // a beam from a metre away at most doubles the pane's own glow
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <lights_fragment_end>",
        `{
          const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
          reflectedLight.directDiffuse *= 0.06 / (0.06 + dot(reflectedLight.directDiffuse, LUM));
          reflectedLight.directSpecular *= 0.03 / (0.03 + dot(reflectedLight.directSpecular, LUM));
        }
        #include <lights_fragment_end>`,
      );
    };
    m.customProgramCacheKey = () => "frosted";
  } else if (/opal/i.test(key)) {
    // white inner layer of the banker's lamp, lit by the bulb right behind it
    m = new MeshStandardMaterial({ color: new Color("#f4ead6"), emissive: new Color("#ffd9a0"), emissiveIntensity: 1.4, roughness: 0.3 });
  } else if (/green|shade/i.test(key)) {
    // cased green glass, opaque (any transmission = full extra scene render). in cycles the bulb glows
    // through, a faint emerald emission fakes that
    m = new MeshPhysicalMaterial({
      color: new Color("#08441a"),
      emissive: new Color("#0e6a24"),
      emissiveIntensity: 0.16,
      roughness: 0.06,
      clearcoat: 1,
    });
  } else if (/picture_frame.*glass/i.test(key)) {
    // picture glass - artwork shows through, just a faint sheen on top
    m = new MeshPhysicalMaterial({ color: "#ffffff", transparent: true, opacity: 0.06, roughness: 0.05, depthWrite: false });
  } else if (/window_glass/i.test(key)) {
    // placeholder until RainGlass takes over, just a faint reflection
    m = new MeshPhysicalMaterial({ color: "#ffffff", transparent: true, opacity: 0.05, roughness: 0.02, depthWrite: false });
  } else if (/evidence_bag/i.test(key)) {
    // clear plastic bag: contents show at full brightness, only reflections, lamp glints on the
    // wrinkles and a bit of milkiness. only ever adds light, no transmission pass
    m = withShine(
      new MeshStandardMaterial({
        color: new Color().setScalar(0.05),
        roughness: 0.12,
        metalness: 0,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        envMapIntensity: 1.3,
      }),
      room,
    );
  } else {
    m = new MeshPhysicalMaterial({
      color: src.color ?? "#ffffff",
      map: src.map ?? null,
      transparent: true,
      opacity: 0.25,
      roughness: 0.04,
      metalness: 0,
      depthWrite: false,
    });
  }
  m.name = key;
  glassCache.set(`${key}|${room}`, m);
  return m;
}
