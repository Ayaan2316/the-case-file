"use client";

import { useKTX2 } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  AdditiveBlending,
  type Box3,
  Color,
  ConeGeometry,
  DoubleSide,
  Euler,
  MathUtils,
  Mesh,
  type Object3D,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SpotLight,
  type Texture,
  Vector2,
  Vector3,
} from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { play, setLoop } from "@/lib/audio";
import { BEATS, impact, INTERRO, camera as shot, within } from "@/lib/cameraPath";
import { OFF } from "@/lib/debug";
import { prepareScene, type SceneManifest } from "@/lib/materials";
import { TIERS } from "@/lib/quality";
import { useStore } from "@/lib/store";
import manifestJson from "@/public/models/scene.json";
import { blackbody } from "../effects/grading";
import { batchStatics, freezeStatics } from "./batch";
import { lightmapUrls, useCaseModel } from "./CaseFile";
import { restorePivots, toFloat } from "./geometry";
import { buildTranscript, buildVerdict, type Pose, STAMP_LAND } from "./interroPrint";

type Transcript = Awaited<ReturnType<typeof buildTranscript>>;
type Verdict = ReturnType<typeof buildVerdict>;

const manifest = manifestJson as unknown as SceneManifest;
const poses = ((manifestJson as { interrogation?: Record<string, Pose> }).interrogation ?? {}) as Record<string, Pose>;
const LAMP = (manifest.lights as (SceneManifest["lights"][number] & { spotBlend?: number | null })[]).find(
  (l) => l.name === "live_interro_lamp",
);
/** start loading while the visitor is still at the board, after the store room (0.42) */
const PRELOAD_AT = 0.56;
/** ceiling hook the lamp hangs from (interrogation_room.py, H = 3m) */
const HOOK = new Vector3(INTERRO.x, 3.0, INTERRO.z);
const Y = new Vector3(0, 1, 0);
const smooth = (x: number) => x * x * (3 - 2 * x);

/** swinging lamp, shared by its light (always in the scene) and the lamp model */
const lamp = { q: new Quaternion(), level: 0, entered: -1 };

/**
 * interrogation + verdict: separate room we cut to from the evidence table. the lamp's light is in
 * the scene from the start (adding a shadowed light later recompiles every shader mid scroll),
 * the room itself loads lazily
 */
export default function Interrogation() {
  const [wanted, setWanted] = useState(() => useStore.getState().progress > PRELOAD_AT);
  useEffect(() => {
    if (wanted) return;
    return useStore.subscribe((s) => {
      if (s.progress > PRELOAD_AT) setWanted(true);
    });
  }, [wanted]);
  return (
    <>
      {!OFF.has("lamp") && <LampLight />}
      {wanted && (
        <Suspense fallback={null}>
          <Room />
        </Suspense>
      )}
    </>
  );
}

// bulb flickering on after the cut: [seconds after arriving, level]
const FLICKER: [number, number][] = [
  [0, 0.08],
  [0.14, 1],
  [0.22, 0.2],
  [0.34, 1],
  [0.45, 0.55],
  [0.52, 1],
];
const flicker = (t: number) => FLICKER.reduce((level, [at, l]) => (t >= at ? l : level), 1);

/**
 * the lamp's spot (live_interro_lamp in lighting.py, not baked): blender watts -> W/sr like
 * shine.ts, live shadows on tiers that have them, and the haze it lights in the smoke
 */
function LampLight() {
  const scene = useThree((s) => s.scene);
  const shadows = useStore((s) => TIERS[s.tier].shadows);
  const rig = useMemo(() => {
    const [r, g, b] = blackbody(LAMP?.temperature ?? 3000);
    const tint = new Color(r, g, b).multiplyScalar(1 / (0.2126 * r + 0.7152 * g + 0.0722 * b));
    const angle = (LAMP?.spotAngle ?? MathUtils.degToRad(112)) / 2;
    const light = new SpotLight(tint, 0, 8, angle, LAMP?.spotBlend ?? 0.3, 2);
    light.name = "live_interro_lamp";
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.near = 0.06;
    light.shadow.camera.far = 3.6;
    light.shadow.bias = -0.0003;
    light.shadow.normalBias = 0.012;
    light.shadow.radius = 2;
    // render once now (an unrendered shadow map breaks every lit draw), then only in the room
    light.shadow.autoUpdate = false;
    light.shadow.needsUpdate = true;
    const bulb = new Vector3(...((LAMP?.position ?? [HOOK.x, 1.875, HOOK.z]) as [number, number, number])).sub(HOOK);
    const dir = new Vector3(...((LAMP?.direction ?? [0, -1, 0]) as [number, number, number])).normalize();
    const cone = haze(angle, tint);
    return { light, bulb, dir, cone, power: (LAMP?.energyW ?? 70) / (4 * Math.PI), swing: new Euler(), at: new Vector3() };
  }, []);

  useEffect(() => {
    scene.add(rig.light, rig.light.target, rig.cone);
    return () => {
      scene.remove(rig.light, rig.light.target, rig.cone);
      rig.light.dispose();
      rig.cone.geometry.dispose();
      (rig.cone.material as ShaderMaterial).dispose();
    };
  }, [scene, rig]);
  // a tier that turns shadows on needs this map drawn before any lit shader samples it
  useEffect(() => {
    rig.light.shadow.needsUpdate = true;
  }, [rig, shadows]);

  useFrame((state) => {
    const s = useStore.getState();
    const here = shot.space === "interrogation";
    // room probe takes its one look with the lamp on
    const capturing = s.interroReady && !s.interroProbe;
    const t = state.clock.elapsedTime;
    if (!here) lamp.entered = -1;
    else if (lamp.entered < 0) lamp.entered = t;
    const since = lamp.entered < 0 ? 0 : t - lamp.entered;
    // someone knocked it on the way out - ~1.15m pendulum (2.15s), settling into a slow sway
    const amp = s.reducedMotion ? 0 : MathUtils.degToRad(2 + 5 * Math.exp(-since / 8));
    const w = (2 * Math.PI) / 2.15;
    rig.swing.set(amp * Math.sin(w * t), 0, amp * 0.4 * Math.sin(w * 1.013 * t + 1.2));
    lamp.q.setFromEuler(rig.swing);
    lamp.level = here || capturing ? (here && !s.reducedMotion ? flicker(since) : 1) : 0;

    const { light, cone } = rig;
    // stays "visible" at zero intensity, toggling a light recompiles every shader
    light.intensity = rig.power * lamp.level;
    light.position.copy(rig.bulb).applyQuaternion(lamp.q).add(HOOK);
    light.target.position.copy(rig.dir).applyQuaternion(lamp.q).add(light.position);
    light.target.updateMatrixWorld();
    light.shadow.autoUpdate = (here || capturing) && shadows;
    cone.visible = lamp.level > 0;
    cone.position.copy(light.position);
    cone.quaternion.copy(lamp.q);
    const u = (cone.material as ShaderMaterial).uniforms;
    u.uStrength.value = 0.1 * lamp.level;
    u.uTime.value = t;
  });
  return null;
}

/** lamp light in the smoke: additive cone, bright under the shade, gone by the table */
function haze(angle: number, tint: Color) {
  const len = 1.05;
  const geometry = new ConeGeometry(Math.tan(angle * 0.9) * len, len, 64, 16, true).translate(0, -len / 2, 0);
  const material = new ShaderMaterial({
    uniforms: { uColor: { value: tint.clone() }, uStrength: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vAlong;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vAlong = 1.0 - uv.y;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uStrength;
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vAlong;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float noise(vec3 x) {
        vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }
      void main() {
        vec3 V = normalize(cameraPosition - vWorld);
        // looking through the middle of the cone crosses more smoke than grazing the edge
        float facing = abs(dot(normalize(vNormalW), V));
        float fall = (1.0 - vAlong) * (1.0 - vAlong);
        float smoke = 0.55 + 0.9 * noise(vWorld * 2.4 + vec3(0.0, uTime * 0.06, uTime * 0.035));
        float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
        gl_FragColor = vec4(uColor * uStrength * facing * facing * fall * smoke + dither, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    fog: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = "fx_interro_lamp_haze";
  mesh.renderOrder = 3;
  mesh.visible = false;
  return mesh;
}

/**
 * one-way mirror glass: reflection darkened like half silvered glass, with wipe smears and grime
 * near the frame, like nobody cleans it properly
 */
const MIRROR_SHADER = {
  name: "OneWayMirror",
  uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null } },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec2 vPlane;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vPlane = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    varying vec4 vUv;
    varying vec2 vPlane;
    #include <logdepthbuf_pars_fragment>
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    void main() {
      #include <logdepthbuf_fragment>
      vec3 base = texture2DProj(tDiffuse, vUv).rgb;
      float smear = noise(vPlane * vec2(7.0, 4.0)) * 0.65 + noise(vPlane * vec2(29.0, 16.0)) * 0.35;
      float edge = smoothstep(0.0, 0.06, min(min(vPlane.x, 1.0 - vPlane.x), min(vPlane.y, 1.0 - vPlane.y)));
      gl_FragColor = vec4(base * color * mix(0.7, 1.0, smear) * mix(0.75, 1.0, edge), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

/** reflection resolution as a share of the canvas buffer */
const MIRROR_SCALE = { ultra: 0.6, medium: 0.4, low: 0.3 } as const;

/** move a piece's origin to a point on its bounds (reel axle, stamp rubber face) */
function recentre(mesh: Mesh, pick: (box: Box3, out: Vector3) => Vector3) {
  const g = toFloat(mesh.geometry.clone());
  g.computeBoundingBox();
  const c = pick(g.boundingBox!, new Vector3());
  g.translate(-c.x, -c.y, -c.z);
  g.computeBoundingSphere();
  mesh.geometry = g;
  mesh.position.add(c.multiply(mesh.scale).applyQuaternion(mesh.quaternion));
}

// stamp flight (scroll progress), lands at BEATS.stamp
const CARRY: [number, number] = [0.812, 0.832];
const RETURN: [number, number] = [0.858, 0.878];
const HOVER = 0.15;
const WIND_UP = 0.19;
/** seconds from the top of the wind up to the cover, no matter how fast you scroll */
const FALL = 0.12;

function Room() {
  const model = useCaseModel("interrogation");
  const urls = useMemo(() => lightmapUrls("interro"), []);
  const lightmaps = useKTX2(urls, "/basis/") as unknown as Record<string, Texture>;
  const root = model.scene as Object3D;
  const gl = useThree((s) => s.gl);
  const tier = useStore((s) => s.tier);

  const parts = useMemo(() => {
    // once per loaded model like CaseFile, this rewrites geometry and materials
    if (!root.userData.prepared) {
      prepareScene(root, manifest, lightmaps, "interrogation");
      restorePivots(root, manifest.pivots ?? {});
      // bulb and the glow inside the shade swing with the lamp
      const byName = new Map<string, Object3D>();
      root.traverse((o) => byName.set(o.name, o));
      for (const [child, parentName] of Object.entries(manifest.follow)) {
        const c = byName.get(child);
        const p = byName.get(parentName);
        if (c && p && c.parent !== p) p.attach(c);
      }
      for (const name of ["dyn_interro_reel_l", "dyn_interro_reel_r"]) {
        const reel = root.getObjectByName(name) as Mesh | undefined;
        if (reel?.isMesh) recentre(reel, (b, out) => b.getCenter(out).setY(0));
      }
      const stamp = root.getObjectByName("dyn_interro_stamp") as Mesh | undefined;
      if (stamp?.isMesh) recentre(stamp, (b, out) => b.getCenter(out).setY(b.min.y));
      // lamp shadows: props and furniture cast (not the lamp, nothing under 4cm)
      root.updateMatrixWorld(true);
      const scale = new Vector3();
      root.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        m.receiveShadow = true;
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        const size = m.geometry.boundingSphere!.radius * m.getWorldScale(scale).x;
        m.castShadow =
          size >= 0.04 && /^(dyn_interro|static_interro_props)/.test(m.name) && !/^dyn_interro_lamp/.test(m.name) && !manifest.special[m.name];
      });
      batchStatics(root);
      freezeStatics(root);
      root.userData.prepared = true;
    }
    const mesh = (name: string) => {
      const o = root.getObjectByName(name) as Mesh | undefined;
      return o?.isMesh ? o : undefined;
    };
    const lampMesh = mesh("dyn_interro_lamp");
    const stamp = mesh("dyn_interro_stamp");
    const reels = [mesh("dyn_interro_reel_l"), mesh("dyn_interro_reel_r")];
    const glows: Object3D[] = [];
    root.traverse((o) => {
      if (/^fx_interro_lamp/.test(o.name)) glows.push(o);
    });
    const yaw = (q: Quaternion) => new Euler().setFromQuaternion(q, "YXZ").y;
    const verdict = poses.verdict;
    const qV = new Quaternion().fromArray(verdict?.quaternion ?? [0, 0, 0, 1]);
    const land = new Vector3(...((verdict?.position ?? [0, 0, 0]) as [number, number, number]));
    // cover's own space (blender x, y) -> three (x, -z) under the cover's rotation
    land.add(new Vector3(STAMP_LAND.x, 0, -STAMP_LAND.y).applyQuaternion(qV));
    land.y -= 0.0004; // marker floats just above the cover, the rubber sits on it
    return {
      lampMesh,
      lampRest: lampMesh && { position: lampMesh.position.clone(), quaternion: lampMesh.quaternion.clone() },
      stamp,
      stampRest: stamp && { position: stamp.position.clone(), yaw: yaw(stamp.quaternion) },
      land,
      landYaw: yaw(qV) + STAMP_LAND.yaw,
      reels: reels.map((r) => r && { mesh: r, rest: r.quaternion.clone() }),
      glows,
      led: mesh("fx_interro_cctv_led"),
    };
  }, [root, lightmaps]);

  // printing on the paper: transcript from content/case.ts, the case file label and stamp
  const prints = useMemo(() => ({ transcript: null as Transcript | null, verdict: null as Verdict | null }), []);
  useEffect(() => {
    let live = true;
    const verdict = poses.verdict ? buildVerdict(poses.verdict) : null;
    if (verdict) root.add(...verdict.meshes);
    prints.verdict = verdict;
    Promise.all([poses.transcript ? buildTranscript(poses.transcript) : null, verdict?.ready]).then(([transcript]) => {
      if (!live) return transcript?.dispose();
      if (transcript) root.add(transcript.mesh);
      prints.transcript = transcript;
      useStore.getState().set({ interroReady: true });
    });
    return () => {
      live = false;
      if (prints.transcript) {
        root.remove(prints.transcript.mesh);
        prints.transcript.dispose();
      }
      if (verdict) {
        root.remove(...verdict.meshes);
        verdict.dispose();
      }
      prints.transcript = prints.verdict = null;
      useStore.getState().set({ interroReady: false });
    };
  }, [root, prints]);

  // one-way mirror, live reflection where interrogation_room.py left its marker
  const mirror = useMemo(() => {
    const pose = poses.mirror;
    if (!pose) return null;
    const glass = new Reflector(new PlaneGeometry(pose.size[0], pose.size[1]), {
      color: new Color(0.52, 0.54, 0.53),
      textureWidth: 512,
      textureHeight: 288,
      clipBias: 0.002,
      multisample: tier === "ultra" ? 4 : 0,
      shader: MIRROR_SHADER,
    });
    glass.name = "interro_mirror_glass";
    // marker's local Z faces into the room, the plane's normal is its own +Z. sits 6mm in front of the
    // baked dark backing (1mm lost to it after quantization)
    glass.quaternion.fromArray(pose.quaternion).multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2));
    glass.position.fromArray(pose.position).add(new Vector3(0, 0, 0.006).applyQuaternion(glass.quaternion));
    glass.visible = false;
    return { glass, size: new Vector2() };
  }, [tier]);
  useEffect(() => {
    if (!mirror) return;
    root.add(mirror.glass);
    return () => {
      root.remove(mirror.glass);
      mirror.glass.dispose();
    };
  }, [root, mirror]);

  const anim = useMemo(
    () => ({
      reel: 0,
      lastP: shot.p,
      down: false,
      fallStart: 0,
      impactAt: -10,
      inked: false,
      typed: 0,
      lastKey: 0,
      tape: false,
      q: new Quaternion(),
      e: new Euler(0, 0, 0, "YXZ"),
    }),
    [],
  );

  useFrame((state, delta) => {
    const s = useStore.getState();
    const here = shot.space === "interrogation";
    // drawn for the probe once, then only while the camera is in the room
    root.visible = here || !s.interroProbe;
    // never during the cube capture, the reflector would send the probe's faces to face 0
    if (mirror) mirror.glass.visible = here && s.interroProbe;
    if (!root.visible) {
      if (anim.tape) setLoop("tape", (anim.tape = false));
      return;
    }
    const p = shot.p;
    const t = state.clock.elapsedTime;
    const dp = p - anim.lastP;
    anim.lastP = p;

    // lamp swings from its hook (LampLight drives the light), bulb flickers with it
    if (parts.lampMesh && parts.lampRest) {
      parts.lampMesh.position.copy(parts.lampRest.position).sub(HOOK).applyQuaternion(lamp.q).add(HOOK);
      parts.lampMesh.quaternion.copy(lamp.q).multiply(parts.lampRest.quaternion);
    }
    for (const g of parts.glows) g.visible = lamp.level > 0.5;
    // CCTV recording light, short red blink every 1.4s
    if (parts.led) parts.led.visible = t % 1.4 < 0.18;

    // recorder runs while the transcript types, the take-up reel (smaller) spins faster
    const typing = within(p, BEATS.transcript);
    const running = here && p > BEATS.transcript[0] && p < BEATS.transcript[1] + 0.01;
    anim.reel += (running && !s.reducedMotion ? delta * 2.4 : 0) + dp * 300;
    parts.reels.forEach((r, i) => {
      if (!r) return;
      r.mesh.quaternion.copy(r.rest).multiply(anim.q.setFromAxisAngle(Y, -anim.reel * (i === 0 ? 0.72 : 1)));
    });
    if (running !== anim.tape) setLoop("tape", (anim.tape = running));
    if (prints.transcript) {
      prints.transcript.set(typing);
      // key strike every few characters (typewriter sound, rate limited)
      const keys = Math.floor(typing * 400);
      if (keys < anim.typed) anim.typed = keys;
      else if (running && keys - anim.typed >= 3 && t - anim.lastKey > 0.07) {
        play("key");
        anim.lastKey = t;
        anim.typed = keys;
      }
    }

    // verdict: stamp gets carried from the pad over the case file, wind up, then falls in FALL seconds
    // however fast you scroll. ink, thud and a jolt the moment it lands
    const { stamp, stampRest, land } = parts;
    if (stamp && stampRest) {
      let e: number; // 0 on the pad, 1 over the landing spot
      let h: number; // height above the line between them
      let tilt = 0;
      if (p < BEATS.verdict[0]) anim.inked = false;
      if (p < BEATS.stamp[0]) {
        anim.down = false;
        const carry = smooth(within(p, CARRY));
        e = carry;
        h = HOVER * Math.sin((carry * Math.PI) / 2) + (WIND_UP - HOVER) * smooth(within(p, [CARRY[1], BEATS.stamp[0]]));
        tilt = 0.14 * Math.sin(carry * Math.PI);
      } else {
        if (!anim.down) {
          anim.down = true;
          anim.fallStart = t;
        }
        const f = s.reducedMotion ? 1 : Math.min(1, (t - anim.fallStart) / FALL);
        if (f < 1) {
          e = 1;
          h = WIND_UP * (1 - f * f);
        } else {
          if (anim.impactAt < anim.fallStart) {
            anim.impactAt = t;
            anim.inked = true;
            play("stamp");
            impact.at = t;
            impact.strength = 1;
          }
          const back = smooth(within(p, RETURN));
          e = 1 - back;
          h = 0.07 * Math.sin(back * Math.PI);
          const since = t - anim.impactAt;
          tilt = 0.02 * Math.exp(-since * 18) * Math.sin(since * 60);
        }
      }
      stamp.position.lerpVectors(stampRest.position, land, e);
      stamp.position.y += h;
      anim.e.set(tilt, MathUtils.lerp(stampRest.yaw, parts.landYaw, e), 0);
      stamp.quaternion.setFromEuler(anim.e);
    }
    prints.verdict?.set(anim.inked ? 1 : 0, t - anim.impactAt);

    // reflection resolution follows the canvas
    if (mirror?.glass.visible) {
      gl.getDrawingBufferSize(mirror.size);
      const rt = mirror.glass.getRenderTarget();
      const k = MIRROR_SCALE[s.tier];
      const w = Math.max(64, Math.round(mirror.size.x * k));
      const hh = Math.max(64, Math.round(mirror.size.y * k));
      if (rt.width !== w || rt.height !== hh) rt.setSize(w, hh);
    }
  });

  return <primitive object={root} />;
}
