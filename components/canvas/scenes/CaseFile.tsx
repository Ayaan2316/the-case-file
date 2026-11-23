"use client";

import { useCursor, useGLTF, useKTX2 } from "@react-three/drei";
import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { CanvasTexture, type Material, MathUtils, type Mesh, MeshStandardMaterial, type Object3D, SRGBColorSpace, Vector3 } from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { scrub, setLevel, setTone } from "@/lib/audio";
import { BEATS, CUTS, camera as shot, within } from "@/lib/cameraPath";
import { prepareScene, type SceneManifest } from "@/lib/materials";
import { settingsFor } from "@/lib/quality";
import { updateShine } from "@/lib/shine";
import { OFF } from "@/lib/debug";
import { useStore } from "@/lib/store";
import { SKY_INTENSITY } from "../effects/CitySky";
import manifestJson from "@/public/models/scene.json";
import { BankersLamp, Esp32Led, Fedora } from "../props/EasterEggs";
import Radio from "../props/Radio";
import ResumeDrawer from "../props/ResumeDrawer";
import Telephone from "../props/Telephone";
import Typewriter from "../props/Typewriter";
import { batchStatics, depthFirst, freezeStatics } from "./batch";
import { BUS_SHADOW_LAYER } from "../effects/Weather";
import Dossier from "./Dossier";
import EvidenceBoard from "./EvidenceBoard";
import { restorePivots } from "./geometry";
import { handlerFor, recordRegion } from "./interactions";
import { planarUV } from "./uv";

const manifest = manifestJson as unknown as SceneManifest;
/** overall strength of the baked light highlights (?shine= while matching the cycles stills) */
const SHINE_GAIN =
  (typeof location !== "undefined" && Number(new URLSearchParams(location.search).get("shine"))) || 1;
type Model = "corridor" | "office" | "evidence" | "interrogation";
/** shell pieces (mesh + material name) that block the bus headlights: window wall, ceiling, trim */
const BUS_OCCLUDERS = /^static_office_shell\S* (office_plaster|office_ceiling|black_powder_coat)$/;
/**
 * lightmaps for bake groups starting with `prefix` ("" = corridor + office), from whichever asset
 * set this visit loads (`.low` on phones)
 */
export function lightmapUrls(prefix: "" | "evidence" | "interro") {
  const later = /^(evidence|interro)/;
  const set = useStore.getState().assets;
  return Object.fromEntries(
    Object.entries(manifest.groups)
      .filter(([g]) => (prefix ? g.startsWith(prefix) : !later.test(g)))
      .map(([, g]) => [g.lightmap, `/textures/lightmaps/${g.lightmap}${set}.ktx2`]),
  );
}

let ktx2: KTX2Loader | null = null;

export function useCaseModel(name: Model) {
  const gl = useThree((s) => s.gl);
  return useGLTF(`/models/${name}${useStore.getState().assets}.glb`, false, true, (loader) => {
    if (!ktx2) ktx2 = new KTX2Loader().setTranscoderPath("/basis/").detectSupport(gl);
    (loader as unknown as { setKTX2Loader: (l: KTX2Loader) => void }).setKTX2Loader(ktx2);
  });
}

/** corridor + office, baked in blender, plus all the little moving details */
export default function CaseFile() {
  const corridor = useCaseModel("corridor");
  const office = useCaseModel("office");
  const urls = useMemo(() => lightmapUrls(""), []);
  const lightmaps = useKTX2(urls, "/basis/") as unknown as Record<string, import("three").Texture>;

  const roots = useMemo(() => [corridor.scene, office.scene], [corridor.scene, office.scene]);
  useMemo(() => {
    // once per loaded model (useGLTF caches the scene). this rewrites geometry and materials so it can't
    // run again on a re-render - drei's useKTX2 returns a new object every time and a tier change
    // re-renders the canvas. restorePivots on an open door bakes its angle into the leaf while the
    // glass (a child) swings on its own
    if (roots.every((r) => r.userData.prepared)) return;
    prepareScene(corridor.scene, manifest, lightmaps, "corridor");
    prepareScene(office.scene, manifest, lightmaps, "office");
    restorePivots(corridor.scene, manifest.pivots ?? {});
    restorePivots(office.scene, manifest.pivots ?? {});
    // glass that moves with a dyn piece (door glass, clock glass) is exported flat, re-parent it
    const byName = new Map<string, Object3D>();
    for (const r of roots) r.traverse((o) => byName.set(o.name, o));
    for (const [child, parentName] of Object.entries(manifest.follow)) {
      const c = byName.get(child);
      const p = byName.get(parentName);
      if (c && p && c.parent !== p) p.attach(c);
    }
    // blind cords are basically the slats' near black, one material one draw
    let slats: Material | undefined;
    office.scene.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh && (m.material as Material).name === "blind_slats") slats = m.material as Material;
    });
    office.scene.traverse((o) => {
      const m = o as Mesh;
      if (slats && m.isMesh && (m.material as Material).name === "blind_cord") m.material = slats;
    });
    // easter egg props that get batched stay clickable by where they were
    for (const name of ["dyn_fedora", "dyn_esp32"]) {
      const o = office.scene.getObjectByName(name);
      if (o) recordRegion(o);
    }
    // desk stuff that has its own pieces but doesn't move here
    batchStatics(corridor.scene);
    batchStatics(
      office.scene,
      /^dyn_(davara_tumbler|esp32|soldering_station|rubber_stamp_set|rubber_stamp|magnifying_glass|fountain_pen|iron_cable|drone_evidence|fedora|bankers_lamp|case_folder|ceiling_fan|typewriter)$/,
    );
    // in close ups the desk and everything on it hides most of the room, so their depth goes first
    // (below ultra, see the frame loop)
    const depth: Mesh[] = [];
    if (!OFF.has("prepass"))
      for (const name of ["static_office_furniture__batch", "static_office_props__batch"]) {
        const m = office.scene.getObjectByName(name) as Mesh | undefined;
        const pre = m && depthFirst(m);
        if (pre) depth.push(pre);
      }
    office.scene.userData.depthFirst = depth;
    // live lights (flashlight, bus headlights) cast shadows from props and furniture onto the room
    const scale = new Vector3();
    for (const r of roots) {
      r.updateMatrixWorld(true);
      r.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh || m.name.endsWith("__depth")) return;
        m.receiveShadow = true;
        // only props (and the blinds, for the bus) cast. every shadow pass redraws every caster so nothing
        // under 25cm (clock, phone, radio, typewriter carriage, paper, LEDs), no lettering or bulbs, and not
        // the drawer front (flush with the cabinet and the torch is off by the time it opens).
        // the doorway once hit 151 draws with 20cm, budget is under 150
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        const size = m.geometry.boundingSphere!.radius * m.getWorldScale(scale).x;
        m.castShadow =
          size >= 0.25 &&
          /^dyn_|static_office_props|static_office_blinds/.test(m.name) &&
          !/lettering|bulb|drawer/.test(m.name) &&
          !manifest.special[m.name];
        if (/static_office_blinds/.test(m.name) || BUS_OCCLUDERS.test(`${m.name} ${(m.material as Material).name}`))
          m.layers.enable(BUS_SHADOW_LAYER);
      });
    }
    for (const r of roots) {
      freezeStatics(r);
      r.userData.prepared = true;
    }
  }, [roots, corridor.scene, office.scene, lightmaps]);

  // don't draw rooms you can't see. office hides while the door is shut, corridor hides once you're
  // inside (RoomProbe captures both before this starts)
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const forward = useMemo(() => new Vector3(), []);
  useFrame((_, delta) => {
    const { probesReady, tier, trim } = useStore.getState();
    const t = settingsFor(tier, trim);
    updateShine(camera, t.shineLights, t.liveLights, SHINE_GAIN, shot.focus, delta);
    // depth pre-pass is for fill bound GPUs - laptop iGPUs, mali and adreno phones (the floor under the
    // desk was a third of a mid range phone's frame at the folder). ultra has fill to spare and the two
    // extra draws pushed the doorway to 151 with the bus going by. apple and powervr drop hidden pixels
    // themselves so for them it's just extra vertex work
    const { hsr } = useStore.getState();
    for (const d of (office.scene.userData.depthFirst ?? []) as Mesh[]) d.visible = tier !== "ultra" && !hsr;
    if (!probesReady) return;
    // use the rig's own progress so a room never disappears before the camera has cut away.
    // corridor also goes once you're in the office facing away (it sat in the draw list until 0.16,
    // seven draws for nothing)
    camera.getWorldDirection(forward);
    const showCorridor = shot.p < 0.16 && !(camera.position.z < -0.3 && forward.z < -0.2);
    const showOffice = (shot.p > 0.07 && shot.p < CUTS.table) || shot.p >= CUTS.contact - 0.002;
    corridor.scene.visible = showCorridor;
    office.scene.visible = showOffice;
    // city sky only exists through the office window, the corridor, door gaps and frosted pane
    // shouldn't show it
    scene.backgroundIntensity = showOffice ? SKY_INTENSITY : 0;
  });

  const [hover, setHover] = useState(false);
  useCursor(hover);
  const handlers = {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      const h = handlerFor(e.object.name, e.point);
      if (h) {
        e.stopPropagation();
        h.click();
      }
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => setHover(!!handlerFor(e.object.name, e.point)),
    onPointerOut: () => setHover(false),
  };

  return (
    <group>
      <primitive object={corridor.scene} {...handlers} />
      <primitive object={office.scene} {...handlers} />
      <LivingDetails roots={roots} />
      <Typewriter roots={roots} />
      <Dossier roots={roots} />
      <EvidenceBoard roots={roots} />
      <Radio roots={roots} />
      <Telephone roots={roots} />
      <ResumeDrawer roots={roots} />
      <BankersLamp roots={roots} />
      <Esp32Led roots={roots} />
      <Fedora />
    </group>
  );
}

function find(roots: Object3D[], name: string) {
  for (const r of roots) {
    const o = r.getObjectByName(name);
    if (o) return o;
  }
  return undefined;
}

/** clock face position, where the tick sound comes from */
const CLOCK = new Vector3(2.66, 2.42, -3.97);

/** door swing, fan, real IST clock, today's date on the desk calendar */
function LivingDetails({ roots }: { roots: Object3D[] }) {
  const parts = useMemo(() => {
    const door = find(roots, "dyn_office_door");
    const blades = find(roots, "dyn_ceiling_fan_blades");
    const hour = find(roots, "dyn_wall_clock_hour");
    const minute = find(roots, "dyn_wall_clock_minute");
    const second = find(roots, "dyn_wall_clock_second");
    const calendar = find(roots, "dyn_desk_calendar_face") as Mesh | undefined;
    return {
      door,
      doorRest: door?.rotation.y ?? 0,
      blades,
      hands: [hour, minute, second] as (Object3D | undefined)[],
      handRest: [hour, minute, second].map((h) => h?.rotation.z ?? 0),
      calendar,
    };
  }, [roots]);

  // gold leaf lettering, real metal just in front of the frosted pane (corridor side, +z), swings
  // with the door. behind the pane it looked like a smudge
  useEffect(() => {
    const door = parts.door;
    if (!door) return;
    const gold = new MeshStandardMaterial({ color: "#e0ad55", metalness: 1, roughness: 0.22, emissive: "#3a2408", emissiveIntensity: 0.4 });
    const shade = new MeshStandardMaterial({ color: "#0d0a08", roughness: 0.5 });
    for (const [name, mat, depth] of [
      ["dyn_office_door_lettering", gold, 0.0085],
      ["dyn_office_door_lettering_shade", shade, 0.008],
    ] as const) {
      const m = find(roots, name) as Mesh | undefined;
      if (!m) continue;
      door.attach(m);
      m.material = mat;
      m.userData.restZ ??= m.position.z; // effects run twice in StrictMode
      m.position.z = m.userData.restZ + depth;
      m.renderOrder = 3;
    }
    return () => {
      gold.dispose();
      shade.dispose();
    };
  }, [parts, roots]);

  useEffect(() => {
    const mesh = parts.calendar;
    if (!mesh) return;
    planarUV(mesh.geometry, "uv1");
    const tex = new CanvasTexture(drawCalendar(new Date()));
    tex.colorSpace = SRGBColorSpace;
    tex.channel = 1;
    tex.anisotropy = 4;
    const mat = (mesh.material as import("three").MeshStandardMaterial).clone();
    mat.map = tex;
    mesh.material = mat;
    return () => tex.dispose();
  }, [parts]);

  const camera = useThree((s) => s.camera);
  const sound = useMemo(
    () => ({ door: 0, clock: 0, radio: 0, steps: 0, lastP: 0, wasOn: false, onAt: 0, rain: 1, muffle: 4000, v: new Vector3(), r: new Vector3() }),
    [],
  );
  useFrame((state, delta) => {
    const { progress, reducedMotion } = useStore.getState();
    // opens inward (positive yaw swings it towards -z, into the office), heavy door easing
    const o = within(progress, [BEATS.door[0], BEATS.door[0] + 0.045]);
    if (parts.door) parts.door.rotation.y = parts.doorRest + (1 - Math.pow(1 - o, 3)) * 1.75;
    // creak follows the door, plays while it swings either way and stops with it
    const swinging = Math.abs(o - sound.door) / Math.max(delta, 1e-3) > 0.1;
    scrub("door", swinging, o <= 0 || o >= 1);
    sound.door = o;
    // clock is in the office: silent behind the shut door, heard through it as it opens, gone in the
    // other rooms, back for the contact scene
    const clock = shot.space === "office" ? 1 : shot.space === "corridor" ? 0.6 * o : 0;
    sound.clock += (clock - sound.clock) * Math.min(1, delta * 3);
    // radio is the sound toggle. valves take a sec to warm up after the static, then the music plays
    // in the office (through the door from the corridor)
    const t = state.clock.elapsedTime;
    const { soundOn } = useStore.getState();
    if (soundOn && !sound.wasOn) sound.onAt = t;
    sound.wasOn = soundOn;
    const warm = MathUtils.clamp((t - sound.onAt - 0.5) / 1.8, 0, 1);
    const radio = shot.space === "office" ? 1 : shot.space === "corridor" ? 0.5 * o : 0;
    sound.radio += (radio - sound.radio) * Math.min(1, delta * 3);
    setLevel("radio", sound.radio * warm);
    // footsteps while the camera walks to the door, stop when it stops
    const speed = Math.abs(shot.p - sound.lastP) / Math.max(delta, 1e-3);
    sound.lastP = shot.p;
    const walking = shot.p < BEATS.door[0] + 0.008 && speed > 0.004 ? 1 : 0;
    sound.steps += (walking - sound.steps) * Math.min(1, delta * (walking ? 4 : 8));
    setLevel("footsteps", sound.steps);
    // rain: muffled through the walls in the corridor, louder towards the office window (x = 5m wall),
    // faint deep in the windowless rooms. office level is the one I liked, walls just low-pass it
    const nearWindow = MathUtils.clamp((camera.position.x - 0.8) / 3.6, 0, 1);
    const [rain, muffle] =
      shot.space === "office" ? [1, 3200 + 7000 * nearWindow] : shot.space === "corridor" ? [0.8, 1500] : [0.3, 700];
    const k = Math.min(1, delta * 2.5);
    sound.rain += (rain - sound.rain) * k;
    sound.muffle += (muffle - sound.muffle) * k;
    setLevel("rain", sound.rain);
    setTone("rain", { lowpass: sound.muffle });
    // wall clock, panned to where it hangs and quieter further away
    const toClock = sound.v.copy(CLOCK).sub(camera.position);
    const clockDistance = toClock.length();
    const pan = toClock.normalize().dot(sound.r.set(1, 0, 0).applyQuaternion(camera.quaternion));
    setTone("clock", { pan: pan * 0.7 });
    setLevel("clock", sound.clock * MathUtils.clamp(2.5 / Math.max(clockDistance, 0.5), 0.6, 1));
    if (parts.blades && !reducedMotion) parts.blades.rotation.y += delta * 1.6;
    // real IST time (UTC+5:30), ticking second hand
    const now = new Date();
    const ist = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 5.5 * 3600000);
    const s = ist.getSeconds();
    const m = ist.getMinutes() + s / 60;
    const h = (ist.getHours() % 12) + m / 60;
    const angles = [(h / 12) * Math.PI * 2, (m / 60) * Math.PI * 2, (s / 60) * Math.PI * 2];
    parts.hands.forEach((hand, i) => {
      if (hand) hand.rotation.z = parts.handRest[i] - angles[i];
    });
  });
  return null;
}

function drawCalendar(date: Date) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#d8d2c3";
  g.fillRect(0, 0, 256, 256);
  const opts = { timeZone: "Asia/Kolkata" } as const;
  g.textAlign = "center";
  g.fillStyle = "#7a1418";
  g.font = "42px 'Special Elite', 'Courier New', monospace";
  g.fillText(date.toLocaleString("en-IN", { ...opts, month: "short" }).toUpperCase(), 128, 62);
  g.fillStyle = "#1f1a16";
  g.font = "bold 120px 'Special Elite', 'Courier New', monospace";
  g.fillText(date.toLocaleString("en-IN", { ...opts, day: "numeric" }), 128, 178);
  g.font = "24px 'Special Elite', 'Courier New', monospace";
  g.fillText(date.toLocaleString("en-IN", { ...opts, weekday: "long" }).toUpperCase(), 128, 228);
  return c;
}

