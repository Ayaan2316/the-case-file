"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { easing } from "maath";
import { useEffect, useMemo } from "react";
import {
  AdditiveBlending,
  CanvasTexture,
  ConeGeometry,
  Mesh,
  Object3D,
  Ray,
  ShaderMaterial,
  SpotLight,
  Vector2,
  Vector3,
} from "three";
import { BEATS } from "@/lib/cameraPath";
import { useStore } from "@/lib/store";

// rooms as boxes for a cheap stable aim point, no triangle raycasts every frame
const OFFICE = { min: new Vector3(0, 0, -4), max: new Vector3(5, 3.2, 0) };
const CORRIDOR = { min: new Vector3(0, 0, 0), max: new Vector3(1.8, 3.0, 8) };
const DESK_TOP = { y: 0.75, min: new Vector2(1.6, -2.8), max: new Vector2(3.2, -2.0) };

function exitPoint(ray: Ray, box: { min: Vector3; max: Vector3 }, out: Vector3) {
  // ray starts inside the room so the far wall is the exit of the slab test
  let tmax = Infinity;
  for (const ax of ["x", "y", "z"] as const) {
    const d = ray.direction[ax];
    if (Math.abs(d) < 1e-6) continue;
    const t = ((d > 0 ? box.max[ax] : box.min[ax]) - ray.origin[ax]) / d;
    if (t > 0) tmax = Math.min(tmax, t);
  }
  return ray.at(Number.isFinite(tmax) ? tmax : 4, out);
}

function cookie() {
  // real torches throw rings and a darker hole in the middle, my own pattern
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const img = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const r = Math.hypot(x - 128, y - 128) / 128;
      const falloff = Math.max(0, 1 - Math.pow(r, 2.4));
      const rings = 0.82 + 0.18 * Math.cos(r * 38) * (1 - r);
      const hole = 1 - 0.35 * Math.exp(-Math.pow(r / 0.07, 2));
      const v = Math.min(1, falloff * rings * hole * 1.1) * 255;
      const i = (y * 256 + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v * 0.96;
      img.data[i + 2] = v * 0.88;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return new CanvasTexture(c);
}

/** the visitor's flashlight */
export default function Flashlight({ shadows, halfRate = false }: { shadows: boolean; halfRate?: boolean }) {
  const { camera, scene } = useThree();
  const rig = useMemo(() => {
    const light = new SpotLight("#fff0d6", 0, 6, 0.3, 0.55, 1.5);
    light.map = cookie();
    light.castShadow = shadows;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.0005;
    light.shadow.normalBias = 0.02;
    light.shadow.camera.near = 0.1;
    light.shadow.camera.far = 6;
    light.shadow.needsUpdate = true; // see BusHeadlights, the map has to exist before auto updates stop
    const target = new Object3D();
    light.target = target;
    const cone = new Mesh(
      new ConeGeometry(1, 1, 32, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2),
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uOpacity: { value: 0 } },
        vertexShader: /* glsl */ `
          varying float vAlong; varying vec3 vNormalV; varying vec3 vViewDir;
          void main() {
            vAlong = position.z; // 0 at the lens, 1 at the far end
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vNormalV = normalize(normalMatrix * normal);
            vViewDir = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uOpacity; varying float vAlong; varying vec3 vNormalV; varying vec3 vViewDir;
          void main() {
            float edge = pow(1.0 - abs(dot(vNormalV, vViewDir)), 1.5);
            float fade = (1.0 - smoothstep(0.0, 1.0, vAlong)) * smoothstep(0.0, 0.08, vAlong);
            gl_FragColor = vec4(vec3(1.0, 0.94, 0.84) * uOpacity * fade * (1.0 - edge * 0.6), 1.0);
          }`,
      }),
    );
    cone.frustumCulled = false;
    return { light, target, cone, ndc: new Vector2(0, -0.1), touch: false, aim: new Vector3(2.4, 0.8, -2.4), level: 0, frame: 0 };
  }, [shadows]);

  useEffect(() => {
    scene.add(rig.light, rig.target, rig.cone);
    const move = (e: PointerEvent) => {
      rig.touch = e.pointerType === "touch";
      rig.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerdown", move);
    return () => {
      scene.remove(rig.light, rig.target, rig.cone);
      removeEventListener("pointermove", move);
      removeEventListener("pointerdown", move);
      rig.light.map?.dispose();
      rig.light.dispose();
    };
  }, [rig, scene]);

  const ray = useMemo(() => new Ray(), []);
  const tmp = useMemo(() => ({ hit: new Vector3(), desk: new Vector3(), right: new Vector3(), up: new Vector3(), ndc: new Vector2() }), []);

  useFrame((state, delta) => {
    const { progress, reading, reducedMotion } = useStore.getState();
    // on in the corridor and office, off while a DOM panel is open. goes off when the camera dives to
    // the desk - it's tuned for the room and at half a metre from the folder it blows out the page
    const want = progress < BEATS.dossier[0] && !reading ? 1 : 0;
    easing.damp(rig, "level", want, 0.4, delta);
    const t = state.clock.elapsedTime;
    const ndc = tmp.ndc.copy(rig.ndc);
    if (rig.touch && !reducedMotion) ndc.set(Math.sin(t * 0.35) * 0.45, Math.sin(t * 0.23) * 0.2 - 0.1);
    ray.origin.copy(camera.position);
    ray.direction.set(ndc.x, ndc.y, 0.5).unproject(camera).sub(camera.position).normalize();
    const box = camera.position.z > 0.05 ? CORRIDOR : OFFICE;
    exitPoint(ray, box, tmp.hit);
    // desk top catches the beam before the floor
    if (ray.direction.y < 0) {
      const s = (DESK_TOP.y - ray.origin.y) / ray.direction.y;
      const p = ray.at(s, tmp.desk);
      if (s > 0 && p.x > DESK_TOP.min.x && p.x < DESK_TOP.max.x && p.z > DESK_TOP.min.y && p.z < DESK_TOP.max.y && s < ray.origin.distanceTo(tmp.hit))
        tmp.hit.copy(p);
    }
    easing.damp3(rig.aim, tmp.hit, 0.12, delta);
    // held a bit below and right of the eye
    tmp.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    tmp.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    rig.light.position.copy(camera.position).addScaledVector(tmp.right, 0.14).addScaledVector(tmp.up, -0.16);
    rig.target.position.copy(rig.aim);
    const flicker = 0.97 + 0.03 * Math.sin(t * 61.0) * Math.sin(t * 17.3);
    // stays "visible" at zero intensity, toggling light visibility recompiles every shader
    rig.light.intensity = rig.level * 9 * flicker;
    // shadow map only renders while the torch is on, every other frame (map already exists so stopping
    // auto updates is fine). this used to set autoUpdate twice a frame, the second time always,
    // so "half rate" was actually full rate
    const on = rig.level > 0.01;
    rig.light.shadow.autoUpdate = on && !halfRate;
    if (on && halfRate) rig.light.shadow.needsUpdate = (rig.frame = (rig.frame + 1) & 1) === 0;
    // faint volumetric cone along the beam
    const len = Math.min(rig.light.position.distanceTo(rig.aim), 6);
    rig.cone.position.copy(rig.light.position);
    rig.cone.lookAt(rig.aim);
    rig.cone.scale.set(len * Math.tan(rig.light.angle), len * Math.tan(rig.light.angle), len);
    (rig.cone.material as ShaderMaterial).uniforms.uOpacity.value = 0.022 * rig.level;
    rig.cone.visible = rig.level > 0.01;
  });
  return null;
}
