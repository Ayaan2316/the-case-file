"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
  Vector3,
} from "three";
import manifestJson from "@/public/models/scene.json";
import { seeded } from "@/lib/random";
import { useStore } from "@/lib/store";

// blind geometry from office_shell.py, in three coords
const BLINDS_X = 4.93;
const Z0 = -0.76;
const Z1 = -3.24;
const TOP = 2.98 - 0.14;
const PITCH = 0.046;
const BOTTOM = 0.95;
/** where the shaft fade hits zero, as a fraction of the way to the floor */
const FADE_END = 0.55;

const moon = (manifestJson as { lights: { name: string; direction: number[] }[] }).lights.find(
  (l) => l.name === "live_moonlight",
);
const DIR = new Vector3(...((moon?.direction as [number, number, number]) ?? [-0.73, -0.68, 0.05])).normalize();

/**
 * moonlight through the venetian blinds: one additive sheet per slat gap, swept along the moon
 * direction to the floor with slow noise. plus the open band under the blinds
 */
export function LightShafts() {
  const { geometry, material } = useMemo(() => {
    const pos: number[] = [];
    const along: number[] = [];
    const sheet = (y: number, weight: number) => {
      // each sheet stops where its fade hits zero (FADE_END). ~49 overlapping additive sheets are
      // fill bound on an iGPU and the far half was black anyway
      const len = (y / -DIR.y) * FADE_END;
      const a = new Vector3(BLINDS_X, y, Z0);
      const b = new Vector3(BLINDS_X, y, Z1);
      const c = b.clone().addScaledVector(DIR, len);
      const d = a.clone().addScaledVector(DIR, len);
      for (const [p, s] of [[a, 0], [b, 0], [c, FADE_END], [a, 0], [c, FADE_END], [d, FADE_END]] as const) {
        pos.push(p.x, p.y, p.z);
        along.push(s, weight);
      }
    };
    for (let y = TOP - PITCH / 2; y > BOTTOM; y -= PITCH) sheet(y, 0.5);
    for (let y = BOTTOM - 0.06; y > 0.08; y -= 0.11) sheet(y, 0.45);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute("aAlong", new BufferAttribute(new Float32Array(along), 2));
    g.computeBoundingSphere();
    const m = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: 2,
      uniforms: { uTime: { value: 0 }, uIntensity: { value: 1 }, uColor: { value: new Color("#9fb6e0") } },
      vertexShader: /* glsl */ `
        attribute vec2 aAlong; varying vec2 vAlong; varying vec3 vWorld; varying float vCam;
        void main() {
          vAlong = aAlong;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          vec4 mv = viewMatrix * w;
          vCam = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uIntensity; uniform vec3 uColor;
        varying vec2 vAlong; varying vec3 vWorld; varying float vCam;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float noise(vec3 x) {
          vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        void main() {
          float s = vAlong.x;
          // haze is thickest by the window (like the cycles stills), beams fade out across the room
          float fade = smoothstep(0.0, 0.08, s) * (1.0 - smoothstep(0.12, ${FADE_END.toFixed(2)}, s));
          float n = noise(vWorld * 2.2 + vec3(0.0, -uTime * 0.05, uTime * 0.03)) * 0.6
                  + noise(vWorld * 6.0 + vec3(uTime * 0.08, 0.0, 0.0)) * 0.4;
          float nearCam = smoothstep(0.3, 1.2, vCam);
          float a = fade * (0.35 + n * 0.65) * vAlong.y * nearCam * uIntensity * 0.01;
          gl_FragColor = vec4(uColor * a, 1.0);
        }`,
    });
    return { geometry: g, material: m };
  }, []);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uIntensity.value = 1 + useStore.getState().flash * 5;
  });

  return <mesh geometry={geometry} material={material} renderOrder={3} />;
}

/** dust floating in the shafts (instanced soft sprites, roughly brownian drift) */
export function DustMotes({ count }: { count: number }) {
  const points = useMemo(() => {
    const rand = seeded(2316);
    const seed = new Float32Array(count * 4);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos.set([1.6 + rand() * 3.3, rand() * 2.9, -0.8 - rand() * 2.5], i * 3);
      seed.set([rand(), rand(), rand(), rand()], i * 4);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new BufferAttribute(seed, 4));
    const m = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPixel: { value: 1 }, uFlash: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed; uniform float uTime; uniform float uPixel; varying float vBright;
        void main() {
          vec3 p = position;
          float t = uTime * (0.05 + aSeed.w * 0.06);
          p += vec3(sin(t * 1.3 + aSeed.x * 40.0), sin(t * 0.9 + aSeed.y * 40.0) - t * 0.15, sin(t * 1.1 + aSeed.z * 40.0)) * 0.12;
          p.y = mod(p.y, 2.9);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uPixel * (1.5 + aSeed.x * 2.5) * (2.0 / -mv.z);
          // brighter towards the window where the moonlight is
          vBright = smoothstep(2.0, 4.8, p.x) * (0.4 + aSeed.y * 0.6);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uFlash; varying float vBright;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vBright * (0.5 + uFlash * 3.0);
          gl_FragColor = vec4(vec3(0.75, 0.82, 1.0) * a, 1.0);
        }`,
    });
    const p = new Points(g, m);
    p.frustumCulled = false;
    return p;
  }, [count]);

  useFrame((state) => {
    const m = points.material as ShaderMaterial;
    m.uniforms.uTime.value = state.clock.elapsedTime;
    m.uniforms.uPixel.value = state.gl.getPixelRatio();
    m.uniforms.uFlash.value = useStore.getState().flash;
  });
  return <primitive object={points} />;
}
