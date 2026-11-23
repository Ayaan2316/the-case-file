"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { camera as shot } from "@/lib/cameraPath";
import { useEffect, useMemo } from "react";
import {
  HalfFloatType,
  type Mesh,
  type PerspectiveCamera,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
} from "three";

const OUTSIDE_LAYER = 1;
const EXTERIOR = /exterior|facade|neon/;

/**
 * rain on the office window. my own shader: static beads plus drops that slide in stop-go bursts
 * leaving a trail, all refracting a low res render of the street. `refraction=false` (low tier)
 * skips the extra render and only draws the water
 */
export default function RainGlass({ refraction, scale }: { refraction: boolean; scale: number }) {
  const { gl, scene, camera, size } = useThree();
  const rt = useMemo(() => new WebGLRenderTarget(16, 16, { type: HalfFloatType }), []);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          tView: { value: rt.texture },
          uRes: { value: new Vector2(1, 1) },
          uTime: { value: 0 },
          uRefract: { value: refraction ? 1 : 0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vWorld; varying vec4 vClip;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vWorld = w.xyz;
            vClip = projectionMatrix * viewMatrix * w;
            gl_Position = vClip;
          }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D tView; uniform vec2 uRes; uniform float uTime; uniform float uRefract;
          varying vec3 vWorld; varying vec4 vClip;

          float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

          // beads sitting still on the glass: xy = lens normal, z = coverage
          vec3 beads(vec2 uv, float density, float seed) {
            vec2 g = uv * density; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
            float h = hash12(id + seed);
            vec2 c = vec2(hash12(id + seed + 3.1), hash12(id + seed + 7.7)) - 0.5;
            float r = mix(0.12, 0.3, h * h);
            vec2 d = (f - c * 0.55) / r;
            d.y *= 1.15;
            float m = smoothstep(1.0, 0.7, length(d)) * step(0.6, h);
            return vec3(d * m, m);
          }

          // drops running down in columns, pausing and lurching, beaded trail above
          vec3 runners(vec2 uv, float t) {
            float cols = 7.0;
            float col = floor(uv.x * cols);
            float h = hash12(vec2(col, 9.1));
            float x = (fract(uv.x * cols) - 0.5) / cols + sin(uv.y * 9.0 + h * 6.28) * 0.012;
            float phase = t * (0.05 + h * 0.07) + h * 10.0;
            float lurch = floor(phase) + smoothstep(0.55, 1.0, fract(phase));
            float headY = 3.2 - mod(lurch * 0.55, 3.6);
            vec2 d = vec2(x, uv.y - headY) / vec2(0.011, 0.014);
            float head = smoothstep(1.0, 0.6, length(d));
            float above = uv.y - headY;
            float trail = smoothstep(0.0, 0.02, above) * (1.0 - smoothstep(0.05, 0.45, above))
                        * smoothstep(0.004, 0.0, abs(x)) * 0.55;
            float beadsInTrail = step(0.6, fract(above * 40.0 + h)) * trail;
            vec2 n = d * head + vec2(x * 60.0, 0.0) * trail;
            return vec3(n, max(head, beadsInTrail));
          }

          void main() {
            // glass coords in metres: across the window (-z) and up (y)
            vec2 uv = vec2(-vWorld.z, vWorld.y);
            vec3 a = beads(uv, 22.0, 0.0);
            vec3 b = beads(uv + 0.37, 41.0, 5.0);
            vec3 r = runners(uv, uTime);
            vec2 n = a.xy * a.z + b.xy * b.z * 0.5 + r.xy;
            float cover = clamp(a.z + b.z * 0.6 + r.z, 0.0, 1.0);
            vec2 screen = (vClip.xy / vClip.w) * 0.5 + 0.5;
            // water lenses flip and magnify what's behind them, glass in between stays clear.
            // at night a drop is only as bright as the street it refracts, plus a thin catch light rim
            vec3 seen = texture2D(tView, screen - n * 0.035).rgb;
            float rim = smoothstep(0.55, 1.0, length(n)) * cover;
            vec3 water = seen * 0.9 + rim * 0.015;
            float alpha = cover * (uRefract > 0.5 ? 0.95 : 0.35) + 0.03;
            gl_FragColor = vec4(mix(vec3(0.02, 0.025, 0.03), water, cover), alpha);
            #include <colorspace_fragment>
          }`,
      }),
    [rt, refraction],
  );

  useEffect(() => {
    let glass: Mesh | undefined;
    scene.traverse((o) => {
      if (o.name.startsWith("fx_window_glass")) glass = o as Mesh;
      if (EXTERIOR.test(o.name)) o.layers.enable(OUTSIDE_LAYER);
    });
    if (!glass) return;
    const previous = glass.material;
    glass.material = material;
    glass.renderOrder = 2;
    return () => {
      glass!.material = previous;
    };
  }, [scene, material]);

  useEffect(() => {
    rt.setSize(Math.max(1, Math.floor(size.width * scale * 0.5)), Math.max(1, Math.floor(size.height * scale * 0.5)));
    material.uniforms.uRes.value.set(size.width, size.height);
  }, [rt, size, scale, material]);

  useEffect(() => () => {
    rt.dispose();
    material.dispose();
  }, [rt, material]);

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    if (!refraction || shot.space !== "office") return; // only from inside the office
    // street view for the drops: exterior layer + city sky from the same camera
    const cam = camera as PerspectiveCamera;
    const mask = cam.layers.mask;
    cam.layers.set(OUTSIDE_LAYER);
    const target = gl.getRenderTarget();
    gl.setRenderTarget(rt);
    gl.clear();
    gl.render(scene, cam);
    gl.setRenderTarget(target);
    cam.layers.mask = mask;
  }, -1);
  return null;
}
