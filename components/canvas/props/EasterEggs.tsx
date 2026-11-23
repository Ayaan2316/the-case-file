"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Color, MathUtils, type Mesh, type MeshStandardMaterial, type Object3D, SpotLight, Vector3 } from "three";
import { useStore } from "@/lib/store";
import { blackbody } from "../effects/grading";
import { registerClick } from "../scenes/interactions";

const find = (roots: Object3D[], name: string) => {
  for (const r of roots) {
    const o = r.getObjectByName(name);
    if (o) return o;
  }
  return undefined;
};

/** every mesh under `o` gets its own material copy (otherwise the lamp glass is shared) */
function ownMaterials(o: Object3D | undefined) {
  const out: MeshStandardMaterial[] = [];
  o?.traverse((c) => {
    const m = c as Mesh;
    if (!m.isMesh) return;
    if (!m.userData.ownMaterial) {
      m.material = (m.material as MeshStandardMaterial).clone();
      m.userData.ownMaterial = true;
    }
    out.push(m.material as MeshStandardMaterial);
  });
  return out;
}

const warm = (k: number) => {
  const [r, g, b] = blackbody(k);
  return new Color(r, g, b).multiplyScalar(1 / (0.2126 * r + 0.7152 * g + 0.0722 * b));
};

/**
 * banker's lamp: off by default, konami code turns it on. warm pool on the desk, bulb and opal
 * liner glowing, green glass lit from inside. the light exists from the start at zero (adding one
 * later recompiles every shader) and casts no shadow
 */
export function BankersLamp({ roots }: { roots: Object3D[] }) {
  const scene = useThree((s) => s.scene);
  const rig = useMemo(() => {
    const bulb = find(roots, "dyn_lamp_bulb");
    const shade = find(roots, "dyn_lamp_shade");
    const glass = ownMaterials(shade);
    const bulbMats = ownMaterials(bulb);
    for (const m of bulbMats) m.emissive = warm(2700);
    const at = new Vector3(1.7856, 1.06, -2.6204);
    bulb?.getWorldPosition(at).add(new Vector3(0, -0.02, 0));
    const light = new SpotLight(warm(2500), 0, 4, 1.15, 0.7, 2);
    light.name = "live_bankers_lamp";
    light.position.copy(at);
    light.target.position.copy(at).add(new Vector3(0, -1, 0.12));
    return {
      light,
      bulbMats,
      glass: glass.map((m) => ({ m, rest: m.emissiveIntensity })),
      level: 0,
    };
  }, [roots]);

  useEffect(() => {
    // konami code needs a keyboard, phones never light the lamp so they don't get the light at all
    // (one less in every lit draw on the devices that can least afford it)
    if (!useStore.getState().phone) scene.add(rig.light, rig.light.target);
    return () => {
      scene.remove(rig.light, rig.light.target);
      rig.light.dispose();
    };
  }, [scene, rig]);

  useFrame((state, delta) => {
    const on = useStore.getState().lampOn;
    // filament warming up, quick with a little stutter
    rig.level = MathUtils.damp(rig.level, on ? 1 : 0, on ? 6 : 9, delta);
    const stutter = on && rig.level < 0.85 ? 0.75 + 0.25 * Math.sin(state.clock.elapsedTime * 60) : 1;
    const l = rig.level * stutter;
    // 30W in blender units (W/4PI like shine.ts). next to the 120W spot over the desk that's a pool
    // you notice, 4W just disappeared
    rig.light.intensity = (30 / (4 * Math.PI)) * l;
    for (const m of rig.bulbMats) m.emissiveIntensity = 9 * l;
    // green glass glows dimly, the white liner right by the bulb glows bright
    for (const { m, rest } of rig.glass) m.emissiveIntensity = rest + (m.color.g > m.color.r ? 0.3 : 2.2) * l;
  });
  return null;
}

// "HIRE ME" in morse: 1 = dit, 3 = dah, letters split by 0 (3 units), word by -1 (7 units)
const HIRE_ME = [1, 1, 1, 1, 0, 1, 1, 0, 1, 3, 1, 0, 1, -1, 3, 3, 0, 1];
const UNIT = 0.16;

function morse() {
  // [start, end] in units of every "on" stretch
  const on: [number, number][] = [];
  let t = 0;
  for (const s of HIRE_ME) {
    if (s > 0) {
      on.push([t, t + s]);
      t += s + 1;
    } else t += s === 0 ? 2 : 6; // the 1 unit gap after the last symbol is already counted
  }
  return { on, length: t };
}
const SEQUENCE = morse();

/** ESP32 board on the desk - click it and the LED blinks "HIRE ME" in morse */
export function Esp32Led({ roots }: { roots: Object3D[] }) {
  const rig = useMemo(() => {
    const led = find(roots, "dyn_esp32_led");
    const mats = ownMaterials(led);
    for (const m of mats) m.emissive = new Color("#3d7bff"); // the devkit's blue GPIO2 LED
    return { mats, from: -1 };
  }, [roots]);

  useEffect(
    () =>
      registerClick(/^dyn_esp32/, () => {
        rig.from = performance.now() / 1000;
      }),
    [rig],
  );

  useFrame(() => {
    if (rig.from < 0) return;
    const u = (performance.now() / 1000 - rig.from) / UNIT;
    const lit = SEQUENCE.on.some(([a, b]) => u >= a && u < b);
    for (const m of rig.mats) m.emissiveIntensity = lit ? 6 : 0;
    if (u > SEQUENCE.length) rig.from = -1;
  });
  return null;
}

/** fedora on the coat rack - click to put it on (brim over the view for 5s) */
export function Fedora() {
  useEffect(() => registerClick(/^dyn_fedora$/, () => useStore.getState().set({ hatUntil: performance.now() + 5000 })), []);
  return null;
}
