"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  Camera,
  DirectionalLight,
  type Mesh,
  type MeshStandardMaterial,
  Object3D,
  PointLight,
  SpotLight,
  Vector3,
} from "three";
import manifestJson from "@/public/models/scene.json";
import { play } from "@/lib/audio";
import { CUTS, camera as shot } from "@/lib/cameraPath";
import { useStore } from "@/lib/store";

type Light = { name: string; position: number[]; direction: number[] };
const lights = (manifestJson as { lights: Light[] }).lights;
const moon = lights.find((l) => l.name === "live_moonlight");
const neonSpill = lights.find((l) => l.name === "live_neon_spill");

/** ಕಾಫಿ / FILTER COFFEE neon - buzzes, stutters now and then, plus its red spill */
export function NeonSign() {
  const scene = useThree((s) => s.scene);
  const rig = useMemo(() => {
    const light = new PointLight("#ff3b1c", 0, 9, 1.6);
    light.position.fromArray(neonSpill?.position ?? [6.6, 2.3, -2.1]);
    return { light, mats: [] as { m: MeshStandardMaterial; base: number }[], stutter: 0, next: 4 };
  }, []);

  useEffect(() => {
    scene.add(rig.light);
    scene.traverse((o) => {
      if (/fx_neon_(kannada|english)/.test(o.name)) {
        const m = (o as Mesh).material as MeshStandardMaterial;
        rig.mats.push({ m, base: m.emissiveIntensity });
      }
    });
    return () => {
      scene.remove(rig.light);
    };
  }, [scene, rig]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    rig.next -= delta;
    if (rig.next <= 0) {
      rig.stutter = 0.35 + Math.random() * 0.5;
      rig.next = 3 + Math.random() * 7;
    }
    rig.stutter = Math.max(0, rig.stutter - delta);
    const buzz = 0.94 + 0.06 * Math.sin(t * 100.0);
    const off = rig.stutter > 0 && Math.sin(t * 47.0) > 0.2 ? 0.08 : 1;
    rig.mats.forEach(({ m, base }, i) => (m.emissiveIntensity = base * buzz * (i === 0 ? off : 1)));
    rig.light.intensity = 0.35 * buzz * off;
  });
  return null;
}

/** lightning every 25-45s: double flash (exposure + moonlight spike), thunder 1-3s later */
export function Lightning() {
  const scene = useThree((s) => s.scene);
  const rig = useMemo(() => {
    const light = new DirectionalLight("#c9d8ff", 0);
    const target = new Object3D();
    const d = new Vector3().fromArray(moon?.direction ?? [-0.73, -0.68, 0.05]);
    light.position.set(2.5, 1.6, -2).addScaledVector(d, -10);
    target.position.set(2.5, 1.6, -2);
    light.target = target;
    return { light, target, t: -1, next: 18, thunder: -1 };
  }, []);

  useEffect(() => {
    scene.add(rig.light, rig.target);
    // window.dispatchEvent(new Event("case:lightning")) forces a strike (screenshots, tests)
    const force = () => (rig.next = 0);
    addEventListener("case:lightning", force);
    return () => {
      scene.remove(rig.light, rig.target);
      removeEventListener("case:lightning", force);
    };
  }, [scene, rig]);

  useFrame((_, delta) => {
    const s = useStore.getState();
    if (s.reducedMotion) return;
    rig.next -= delta;
    if (rig.next <= 0) {
      rig.t = 0;
      rig.next = 25 + Math.random() * 20;
      rig.thunder = 1 + Math.random() * 2;
    }
    let flash = 0;
    if (rig.t >= 0) {
      rig.t += delta;
      const f1 = Math.exp(-Math.pow((rig.t - 0.05) / 0.035, 2));
      const f2 = Math.exp(-Math.max(0, rig.t - 0.22) * 7) * (rig.t > 0.2 ? 1 : 0);
      // store room has no window - you hear the thunder but don't see the flash
      flash = shot.space === "evidence" || shot.space === "interrogation" ? 0 : Math.max(f1 * 0.8, f2);
      if (rig.t > 1.2) rig.t = -1;
    }
    if (rig.thunder > 0) {
      rig.thunder -= delta;
      if (rig.thunder <= 0) play("thunder");
    }
    rig.light.intensity = flash * 6;
    if (Math.abs(s.flash - flash) > 0.001) s.set({ flash });
  });
  return null;
}

/** layer the bus headlights' shadow map renders: blinds + room shell */
export const BUS_SHADOW_LAYER = 3;

/** a BMTC bus goes by every ~40s, headlights sweep the ceiling through the blinds */
export function BusHeadlights({ shadows }: { shadows: boolean }) {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  const rig = useMemo(() => {
    const light = new SpotLight("#fff1d8", 0, 26, 0.32, 0.6, 1.2);
    light.castShadow = shadows;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.0006;
    // the sweep only needs the window, so its map gets its own pass with just BUS_SHADOW_LAYER
    // (CaseFile puts the blinds and shell there) instead of every caster in the room.
    // three filters shadow casters by the *viewing* camera's layers, hence the stand-in camera
    light.shadow.autoUpdate = false;
    const layer = new Camera();
    layer.layers.set(BUS_SHADOW_LAYER);
    const target = new Object3D();
    light.target = target;
    // render the shadow map once up front. a shadow casting light whose map was never rendered binds
    // a non-depth texture to the shadow sampler and every lit draw call fails
    light.shadow.needsUpdate = true;
    return { light, target, layer, casters: [] as Object3D[], t: -1, next: 25, dirty: false };
  }, [shadows]);

  useEffect(() => {
    // the extra pass has to run inside renderer.render (render state only exists there),
    // so it hooks onto the renderer's own shadow step, once a frame
    const shadowMap = gl.shadowMap;
    const render = shadowMap.render;
    shadowMap.render = (lights, s, camera) => {
      render.call(shadowMap, lights, s, camera);
      if (!rig.dirty || s !== scene) return;
      rig.dirty = false;
      // shell only casts here. inside lights would just self-shadow it, but the bus is outside and
      // without the walls the light comes straight through
      for (const o of rig.casters) o.castShadow = true;
      rig.light.shadow.needsUpdate = true;
      render.call(shadowMap, [rig.light], s, rig.layer);
      for (const o of rig.casters) o.castShadow = false;
    };
    return () => {
      shadowMap.render = render;
    };
  }, [gl, scene, rig]);

  useEffect(() => {
    // without its shadow pass the light stays dark (see below), so on that tier it's not added at all,
    // otherwise every lit draw still pays for its uniforms and its turn in the light loop.
    // the pass itself (sound, timing) runs either way
    if (shadows) scene.add(rig.light);
    scene.add(rig.target);
    const force = () => (rig.next = 0);
    addEventListener("case:bus", force);
    return () => {
      scene.remove(rig.light, rig.target);
      removeEventListener("case:bus", force);
      rig.light.dispose();
    };
  }, [scene, rig, shadows]);

  useFrame((_, delta) => {
    const { reducedMotion, progress } = useStore.getState();
    rig.next -= delta;
    if (rig.next <= 0 && !reducedMotion) {
      rig.t = 0;
      rig.casters = [];
      scene.traverse((o) => {
        if ((o as Mesh).isMesh && o.layers.isEnabled(BUS_SHADOW_LAYER) && !o.castShadow) rig.casters.push(o);
      });
      rig.next = 34 + Math.random() * 12;
      // heard where the window is in view - office at the start and back at the desk for contact
      if ((progress > 0.12 && progress < 0.4) || shot.p >= CUTS.contact) play("bus");
    }
    // without the shadow pass (low tier) nothing keeps the light outside, it lit the cabinet, phone
    // and typewriter straight through the walls. so there you only hear the bus
    if (rig.t < 0 || !rig.light.castShadow || shot.space === "evidence" || shot.space === "interrogation") {
      // zero intensity instead of invisible (visibility changes recompile every shader)
      rig.light.intensity = 0;
      rig.dirty = false;
      return;
    }
    rig.t += delta;
    const k = rig.t / 6.5; // how long a pass takes
    if (k > 1) {
      rig.t = -1;
      return;
    }
    // street below the window (office floor y=0, street ~4m down, x~11)
    const z = 9 - k * 22;
    rig.light.position.set(11, -2.6, z);
    rig.target.position.set(2.6, 3.2, -2 + (z + 2) * 0.25);
    rig.light.intensity = Math.sin(Math.PI * k) * 900;
    rig.dirty = rig.light.castShadow;
  });
  return null;
}
