"use client";

import { createPortal, type ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CylinderGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  type Object3D,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { caveat, specialElite } from "@/app/fonts";
import { caseFile } from "@/content/case";
import { BOARD, boardLocal, POLAROID, polaroidSpot } from "@/lib/board";
import { BEATS, CUTS, camera as shot, within } from "@/lib/cameraPath";
import { liveLit } from "@/lib/materials";
import { seeded } from "@/lib/random";
import { useStore } from "@/lib/store";

// the evidence board. cork, frame and title card are baked. polaroids, pins and yarn are baked too
// (for the contact shadows) but exported as `dyn_board_pieces`, hidden here and rebuilt live so they
// can lift, flip and sway. the board is visible from the office shot onwards so it's built to cost
// ~13 draws: one per polaroid (back only while turning), one for all the yarn, one for all tags,
// two for all pins, two for the dressing

const PIN_DROP = POLAROID.h / 2 - 0.012; // pin sits below the polaroid's top edge
const ROPE_POINTS = 14;
const YARN_RADIUS = 0.0012;
const TUBE_SEGMENTS = 48;
const TUBE_SIDES = 5;
const TAG = { w: 0.06, h: 0.024, px: [256, 104] as const };

type Polaroid = { id: string; anchor: Group; swing: Group; body: Group; back: Mesh; lift: number; flip: number };
type Rope = { from: string; to: string; pts: Vector3[]; prev: Vector3[]; rest: number; glow: number; drawn?: boolean };

export default function EvidenceBoard({ roots }: { roots: Object3D[] }) {
  const built = useMemo(() => build(), []);

  // into the office, replacing the baked pieces
  useEffect(() => {
    let baked: Object3D | undefined;
    let office: Object3D | undefined;
    for (const r of roots)
      r.traverse((o) => {
        if (o.name === "dyn_board_pieces") baked = o;
        if (o.name === "dyn_case_folder_front") office = r;
      });
    if (!office) return;
    office.add(built.group);
    built.baked = baked ?? null;
    return () => {
      office!.remove(built.group);
      if (baked) baked.visible = true;
      built.baked = null;
    };
  }, [roots, built]);

  // fonts first, then the paper
  useEffect(() => {
    let cancelled = false;
    const typed = specialElite.style.fontFamily;
    const hand = caveat.style.fontFamily;
    Promise.all([document.fonts.load(`40px ${typed}`, "A"), document.fonts.load(`40px ${hand}`, "A")])
      .catch(() => undefined)
      .then(() => !cancelled && built.draw(typed, hand));
    return () => {
      cancelled = true;
    };
  }, [built]);

  useFrame((state, delta) => {
    const { progress, hoverExhibit, openExhibit, reducedMotion, budget } = useStore.getState();
    const onBoard = within(progress, BEATS.board) > 0 && within(progress, BEATS.board) < 1;
    // from across the room (office shot, and back at the desk for contact) the baked polaroids, pins
    // and yarn are used instead - one draw instead of ~13 and no rope physics. the live ones take over
    // while the camera looks down at the dossier, out of sight of the wall
    const live = (progress > BEATS.pageFlip[0] && progress < CUTS.contact - 0.004) || openExhibit !== null;
    if (built.baked) built.baked.visible = !live;
    for (const o of built.liveOnly) o.visible = live;
    // in the store room the office is hidden, no rope physics to run
    if (!live || shot.space === "evidence" || shot.space === "interrogation") return;
    const dt = Math.min(delta, 1 / 30);
    const hovered = onBoard ? hoverExhibit : null;
    for (const p of built.polaroids) {
      const isOpen = openExhibit === p.id;
      p.lift = MathUtils.damp(p.lift, hovered === p.id || isOpen ? 1 : 0, 10, dt);
      p.flip = MathUtils.damp(p.flip, isOpen ? 1 : 0, 5, dt);
      // pinned at the top. hover twists it on the pin and lifts it off the cork (tilting up turned it
      // into the overhead spot and blew it out). opening pulls it off and flips it
      p.swing.rotation.y = p.lift * 0.14;
      p.body.position.x = p.lift * 0.008 + p.flip * 0.07;
      p.body.rotation.y = p.flip * Math.PI;
      p.body.scale.setScalar(1 + p.lift * 0.03);
      p.back.visible = p.flip > 0.005;
    }
    // the draught keeps the strings swaying so they get rebuilt every frame. budget phones (CPU bound)
    // get no draught, the strings settle quickly and then cost nothing. a string only rebuilds once
    // it's moved or its glow changed
    const t = reducedMotion || budget ? 0 : state.clock.elapsedTime;
    let changed = false;
    built.ropes.forEach((r, i) => {
      const lit = hovered === null || hovered === r.from || hovered === r.to;
      const hot = hovered !== null && lit;
      const glow = MathUtils.damp(r.glow, hot ? 1 : lit ? 0 : -1, 8, dt);
      const moved = simulate(r, dt, t, hot);
      if (moved < 2e-5 && Math.abs(glow - r.glow) < 1e-3 && r.drawn) return;
      r.glow = glow;
      r.drawn = true;
      built.yarn.write(i, r);
      changed = true;
    });
    if (changed) built.yarn.commit();
  });

  const handlers = useMemo(() => {
    const idOf = (e: ThreeEvent<PointerEvent>) => {
      for (let o: Object3D | null = e.object; o; o = o.parent) if (o.userData.exhibit) return o.userData.exhibit as string;
      return null;
    };
    const live = () => within(useStore.getState().progress, BEATS.board) > 0;
    return {
      onPointerOver: (e: ThreeEvent<PointerEvent>) => {
        const id = idOf(e);
        if (!id || !live()) return;
        e.stopPropagation();
        useStore.getState().set({ hoverExhibit: id });
      },
      onPointerOut: (e: ThreeEvent<PointerEvent>) => {
        const id = idOf(e);
        if (id && useStore.getState().hoverExhibit === id) useStore.getState().set({ hoverExhibit: null });
      },
      onClick: (e: ThreeEvent<MouseEvent>) => {
        const id = idOf(e as unknown as ThreeEvent<PointerEvent>);
        if (!id || !live()) return;
        e.stopPropagation();
        useStore.getState().set({ openExhibit: id, reading: true, hoverExhibit: null });
      },
    };
  }, []);

  // portal keeps the polaroids in the board's frame (a plain <primitive> would re-parent them)
  // while R3F still sends their pointer events
  return createPortal(<primitive object={built.hitArea} {...handlers} />, built.group);
}

// ---------------------------------------------------------------- build

function build() {
  const group = new Group();
  group.name = "evidence_board";
  group.position.copy(BOARD.position);
  group.quaternion.copy(BOARD.quaternion);
  // pointer events only for the polaroids (dressing and yarn shouldn't catch the cursor),
  // the component portals it into `group`
  const hitArea = new Group();
  let fonts: { typed: string; hand: string } | null = null;

  const canvasTex = (w: number, h: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    return { canvas, texture };
  };
  // every pin is one instance of two meshes (head + needle)
  const pinSpots: Matrix4[] = [];
  const pinAtLocal = (m: Matrix4, local: Vector3) => pinSpots.push(new Matrix4().makeTranslation(local).premultiply(m));

  // ---- polaroids: photo printed on the front card, back only draws while turning
  const polaroids: Polaroid[] = [];
  const fronts: { canvas: HTMLCanvasElement; texture: CanvasTexture; id: string; title: string; img: HTMLImageElement }[] = [];
  const backs: { canvas: HTMLCanvasElement; texture: CanvasTexture; note: string; id: string }[] = [];
  const pinAt: Record<string, Vector3> = {};
  const card = new PlaneGeometry(POLAROID.w, POLAROID.h);
  const frontGeo = card.clone().rotateY(Math.PI / 2).translate(0.0004, 0, 0);
  const backGeo = card.clone().rotateY(-Math.PI / 2).translate(-0.0004, 0, 0);
  const paintFront = (f: (typeof fronts)[number]) => {
    if (!fonts) return;
    drawFront(f.canvas, f.id, f.title, fonts.hand, f.img);
    f.texture.needsUpdate = true;
  };
  caseFile.exhibits.forEach((ex, i) => {
    const spot = polaroidSpot(ex.id, i);
    const anchor = new Group();
    anchor.position.copy(boardLocal(spot.across, spot.up + PIN_DROP, 0.0008));
    anchor.rotation.x = spot.tilt;
    anchor.userData.exhibit = ex.id;
    const swing = new Group();
    const body = new Group();
    body.position.y = -PIN_DROP;
    anchor.add(swing);
    swing.add(body);
    const img = new Image();
    const front = { ...canvasTex(512, 624), id: ex.id, title: ex.board ?? ex.title, img };
    img.onload = () => paintFront(front);
    img.src = ex.photo;
    const back = canvasTex(512, 624);
    fronts.push(front);
    backs.push({ ...back, note: ex.backNote, id: ex.id });
    const backMesh = new Mesh(backGeo, liveLit(new MeshStandardMaterial({ map: back.texture, roughness: 0.85 }), { key: "polaroid" }));
    backMesh.visible = false;
    body.add(new Mesh(frontGeo, liveLit(new MeshStandardMaterial({ map: front.texture, roughness: 0.62 }), { key: "polaroid" })), backMesh);
    hitArea.add(anchor);
    anchor.updateMatrix();
    pinAtLocal(anchor.matrix, new Vector3(0.012, 0, 0));
    polaroids.push({ id: ex.id, anchor, swing, body, back: backMesh, lift: 0, flip: 0 });
    pinAt[ex.id] = boardLocal(spot.across, spot.up + PIN_DROP, 0.008);
  });

  // ---- yarn: all strings in one mesh (vertex colour does the hover glow and dimming)
  const fibre = canvasTex(64, 16);
  {
    const g = fibre.canvas.getContext("2d")!;
    for (let x = -16; x < 80; x += 8) {
      const grad = g.createLinearGradient(x, 0, x + 8, 16);
      grad.addColorStop(0, "rgb(70,128,255)");
      grad.addColorStop(0.5, "rgb(128,128,255)");
      grad.addColorStop(1, "rgb(186,128,255)");
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x, 16);
      g.lineTo(x + 8, 16);
      g.lineTo(x + 16, 0);
      g.lineTo(x + 8, 0);
      g.fill();
    }
    fibre.texture.colorSpace = NoColorSpace;
    fibre.texture.wrapS = fibre.texture.wrapT = RepeatWrapping;
    fibre.texture.repeat.set(60, 1);
  }
  const ropes: Rope[] = [];
  const labels: string[] = [];
  for (const c of caseFile.connections) {
    const a = pinAt[c.from];
    const b = pinAt[c.to];
    if (!a || !b) continue;
    const pts = Array.from({ length: ROPE_POINTS }, (_, i) => {
      const t = i / (ROPE_POINTS - 1);
      return a.clone().lerp(b, t).add(new Vector3(0, -0.06 * Math.sin(Math.PI * t) * a.distanceTo(b), 0));
    });
    ropes.push({ from: c.from, to: c.to, pts, prev: pts.map((p) => p.clone()), rest: (a.distanceTo(b) * 1.05) / (ROPE_POINTS - 1), glow: 0 });
    labels.push(c.label);
  }
  const yarn = yarnMesh(ropes.length, fibre.texture);
  const tagAtlas = canvasTex(TAG.px[0] * 2, TAG.px[1] * Math.ceil(ropes.length / 2));
  const tags = tagMesh(ropes.length, tagAtlas.texture, tagAtlas.canvas.height);
  yarn.tags = tags;
  group.add(yarn.mesh, tags.mesh);

  // ---- dressing (not clickable): map, clippings, index cards, sticky notes. all drawn into one atlas
  // and merged into one mesh, plus one mesh of soft drop shadows (the bake doesn't know about them)
  const ATLAS_W = 2048;
  const ATLAS_H = 1536;
  const atlas = canvasTex(ATLAS_W, ATLAS_H);
  const items = [
    { key: "map", px: [0, 0, 1024, 720], size: [0.33, 0.232], at: [0.72, 0.73], tilt: 0.03, pinned: true },
    { key: "clip1", px: [1024, 0, 720, 560], size: [0.24, 0.187], at: [-0.76, -0.75], tilt: -0.05, pinned: true },
    { key: "clip2", px: [1024, 560, 640, 500], size: [0.2, 0.156], at: [0.25, -0.78], tilt: 0.04, pinned: true },
    { key: "card1", px: [0, 720, 640, 384], size: [0.15, 0.09], at: [-0.2, -0.8], tilt: -0.02, pinned: true },
    { key: "card2", px: [0, 1104, 640, 384], size: [0.15, 0.09], at: [0.74, -0.42], tilt: 0.06, pinned: true },
    { key: "note1", px: [640, 720, 320, 320], size: [0.075, 0.075], at: [-0.18, 0.8], tilt: 0.08, pinned: false },
    { key: "note2", px: [640, 1040, 320, 320], size: [0.075, 0.075], at: [0.12, 0.79], tilt: -0.07, pinned: false },
    { key: "note3", px: [1664, 0, 320, 320], size: [0.075, 0.075], at: [-0.93, 0.08], tilt: 0.05, pinned: false },
  ] as const;
  const [W, H] = BOARD.size;
  const faces: PlaneGeometry[] = [];
  const drops: PlaneGeometry[] = [];
  for (const it of items) {
    const [w, h] = it.size;
    const m = new Matrix4().compose(
      boardLocal(it.at[0] * (W / 2), it.at[1] * (H / 2), 0.0006),
      new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), it.tilt),
      new Vector3(1, 1, 1),
    );
    const face = new PlaneGeometry(w, h).rotateY(Math.PI / 2);
    const [x, y, pw, ph] = it.px;
    const uv = face.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (x + uv.getX(k) * pw) / ATLAS_W, 1 - (y + (1 - uv.getY(k)) * ph) / ATLAS_H);
    faces.push(face.applyMatrix4(m));
    drops.push(new PlaneGeometry(w * 1.12, h * 1.15).rotateY(Math.PI / 2).translate(-0.0004, -0.008, -0.004).applyMatrix4(m));
    if (it.pinned) pinAtLocal(m, new Vector3(0.0004, h / 2 - 0.012, 0));
  }
  const shadow = canvasTex(128, 128);
  {
    const g = shadow.canvas.getContext("2d")!;
    const grad = g.createRadialGradient(64, 64, 20, 64, 64, 64);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  group.add(
    new Mesh(mergeGeometries(drops), new MeshStandardMaterial({ map: shadow.texture, transparent: true, depthWrite: false, color: "#000000" })),
    new Mesh(mergeGeometries(faces), liveLit(new MeshStandardMaterial({ map: atlas.texture, roughness: 0.85 }), { key: "card" })),
  );

  // ---- pins
  const pinHead = new LatheGeometry(
    [new Vector2(0, 0), new Vector2(0.0065, 0.002), new Vector2(0.0072, 0.008), new Vector2(0.005, 0.013), new Vector2(0, 0.014)],
    20,
  ).rotateZ(-Math.PI / 2);
  const needle = new CylinderGeometry(0.0006, 0.0006, 0.012, 8).rotateZ(-Math.PI / 2).translate(-0.006, 0, 0);
  const heads = new InstancedMesh(pinHead, liveLit(new MeshStandardMaterial({ color: "#8f0d10", roughness: 0.25 }), { key: "pin" }), pinSpots.length);
  const needles = new InstancedMesh(
    needle,
    liveLit(new MeshStandardMaterial({ color: "#c7c9cc", metalness: 1, roughness: 0.3 }), { key: "needle" }),
    pinSpots.length,
  );
  pinSpots.forEach((m, i) => {
    heads.setMatrixAt(i, m);
    needles.setMatrixAt(i, m);
  });
  group.add(heads, needles);

  const draw = (typed: string, hand: string) => {
    fonts = { typed, hand };
    fronts.forEach(paintFront);
    for (const b of backs) {
      drawBack(b.canvas, b.id, b.note, hand);
      b.texture.needsUpdate = true;
    }
    const tg = tagAtlas.canvas.getContext("2d")!;
    labels.forEach((label, i) => {
      const c = document.createElement("canvas");
      [c.width, c.height] = TAG.px;
      drawTag(c, label, typed);
      tg.drawImage(c, (i % 2) * TAG.px[0], Math.floor(i / 2) * TAG.px[1]);
    });
    tagAtlas.texture.needsUpdate = true;
    const g = atlas.canvas.getContext("2d")!;
    const paint = (key: string, fn: (c: HTMLCanvasElement) => void) => {
      const it = items.find((i) => i.key === key)!;
      const c = document.createElement("canvas");
      c.width = it.px[2];
      c.height = it.px[3];
      fn(c);
      g.drawImage(c, it.px[0], it.px[1]);
    };
    paint("map", (c) => drawMap(c, typed, hand));
    paint("clip1", (c) => drawClipping(c, "RAIN FLOODS OUTER RING ROAD AGAIN", 1));
    paint("clip2", (c) => drawClipping(c, "THE CITY'S NIGHT SHIFT: WHO KEEPS THE LIGHTS ON?", 2));
    paint("card1", (c) =>
      drawCard(c, typed, [
        `SUBJECT: ${caseFile.subject.name.toUpperCase()}`,
        `LAST SEEN: ${caseFile.subject.location}`,
        `STATUS: ${caseFile.subject.status}`,
      ]),
    );
    paint("card2", (c) => drawCard(c, typed, ["TOOLS FOUND:", ...caseFile.tools.slice(0, 3).map((t) => `- ${t.name}`)]));
    paint("note1", (c) => drawNote(c, hand, "who is he?", "#f2df6b"));
    paint("note2", (c) => drawNote(c, hand, "follow the string", "#f4c96b"));
    paint("note3", (c) => drawNote(c, hand, `${caseFile.exhibits.length} exhibits`, "#efe17a"));
    atlas.texture.needsUpdate = true;
  };

  return { group, hitArea, polaroids, ropes, yarn, draw, liveOnly: [hitArea, yarn.mesh, tags.mesh, heads, needles], baked: null as Object3D | null };
}

// ---------------------------------------------------------------- yarn

const GRAVITY = new Vector3(0, -9.8, 0);
const tmp = new Vector3();

/**
 * verlet rope: gravity sag, damping, slow draught, a nudge on hover. returns how far its points
 * moved this step (m) so a rope at rest doesn't get rebuilt
 */
function simulate(r: Rope, dt: number, t: number, hot: boolean) {
  const n = r.pts.length;
  let moved = 0;
  for (let i = 1; i < n - 1; i++) {
    const p = r.pts[i];
    const v = tmp.copy(p).sub(r.prev[i]).multiplyScalar(0.985);
    moved = Math.max(moved, v.lengthSq());
    r.prev[i].copy(p);
    const draught = Math.sin(t * 0.7 + i * 0.5 + r.from.charCodeAt(0)) * 0.012 + (hot ? Math.sin(t * 9 + i) * 0.05 : 0);
    p.add(v).addScaledVector(GRAVITY, dt * dt);
    p.x += draught * dt * dt * 60;
  }
  for (let k = 0; k < 14; k++) {
    for (let i = 0; i < n - 1; i++) {
      const a = r.pts[i];
      const b = r.pts[i + 1];
      const d = tmp.copy(b).sub(a);
      const len = d.length() || 1e-6;
      const diff = (len - r.rest) / len;
      if (i > 0) a.addScaledVector(d, diff * 0.5);
      if (i + 1 < n - 1) b.addScaledVector(d, -diff * 0.5);
    }
    // yarn sits over the cork, never through it
    for (let i = 1; i < n - 1; i++) r.pts[i].x = Math.max(r.pts[i].x, BOARD.face + 0.003);
  }
  return Math.sqrt(moved);
}

/** one mesh for all strings, tubes rebuilt every frame into a preallocated buffer */
function yarnMesh(count: number, fibre: CanvasTexture) {
  const template = new TubeGeometry(new CatmullRomCurve3([new Vector3(), new Vector3(0, 0, 1)]), TUBE_SEGMENTS, YARN_RADIUS, TUBE_SIDES);
  const per = template.attributes.position.count;
  const geo = new BufferGeometry();
  const position = new BufferAttribute(new Float32Array(per * count * 3), 3);
  const normal = new BufferAttribute(new Float32Array(per * count * 3), 3);
  const color = new BufferAttribute(new Float32Array(per * count * 4), 4);
  const uv = new BufferAttribute(new Float32Array(per * count * 2), 2);
  const tIndex = template.index!.array;
  const index: number[] = [];
  for (let r = 0; r < count; r++) {
    uv.array.set(template.attributes.uv.array, r * per * 2);
    for (const i of tIndex) index.push(i + r * per);
  }
  geo.setAttribute("position", position);
  geo.setAttribute("normal", normal);
  geo.setAttribute("color", color);
  geo.setAttribute("uv", uv);
  geo.setIndex(index);
  const material = liveLit(
    new MeshStandardMaterial({ color: "#8c0c10", roughness: 0.82, normalMap: fibre, vertexColors: true, transparent: true }),
    { key: "yarn" },
  );
  const mesh = new Mesh(geo, material);
  mesh.frustumCulled = false;
  const out = {
    mesh,
    tags: null as ReturnType<typeof tagMesh> | null,
    write(i: number, r: Rope) {
      const tube = new TubeGeometry(new CatmullRomCurve3(r.pts), TUBE_SEGMENTS, YARN_RADIUS, TUBE_SIDES);
      position.array.set(tube.attributes.position.array, i * per * 3);
      normal.array.set(tube.attributes.normal.array, i * per * 3);
      tube.dispose();
      // hovered connections glow (brighter than albedo), the rest fade back
      const k = 1 + Math.max(0, r.glow) * 1.4;
      const a = 1 + Math.min(0, r.glow) * 0.65;
      for (let v = 0; v < per; v++) color.setXYZW(i * per + v, k, k, k, a);
      const mid = r.pts[Math.floor(r.pts.length / 2)];
      out.tags?.place(i, mid, a);
    },
    commit() {
      position.needsUpdate = normal.needsUpdate = color.needsUpdate = true;
      out.tags?.commit();
    },
  };
  return out;
}

/** one mesh for every string's paper tag, hanging just under the middle of the string */
function tagMesh(count: number, atlas: CanvasTexture, atlasH: number) {
  const geo = new BufferGeometry();
  const position = new BufferAttribute(new Float32Array(count * 4 * 3), 3);
  const normal = new BufferAttribute(new Float32Array(count * 4 * 3), 3);
  const color = new BufferAttribute(new Float32Array(count * 4 * 4), 4);
  const uv = new BufferAttribute(new Float32Array(count * 4 * 2), 2);
  const index: number[] = [];
  const [pw, ph] = TAG.px;
  for (let i = 0; i < count; i++) {
    const u0 = ((i % 2) * pw) / (pw * 2);
    const u1 = u0 + 0.5;
    const v1 = 1 - (Math.floor(i / 2) * ph) / atlasH;
    const v0 = v1 - ph / atlasH;
    // TL, TR, BL, BR (seen from the room)
    uv.array.set([u0, v1, u1, v1, u0, v0, u1, v0], i * 8);
    for (let k = 0; k < 4; k++) normal.setXYZ(i * 4 + k, 1, 0, 0);
    index.push(i * 4, i * 4 + 2, i * 4 + 1, i * 4 + 2, i * 4 + 3, i * 4 + 1);
  }
  geo.setAttribute("position", position);
  geo.setAttribute("normal", normal);
  geo.setAttribute("color", color);
  geo.setAttribute("uv", uv);
  geo.setIndex(index);
  const mesh = new Mesh(
    geo,
    liveLit(new MeshStandardMaterial({ map: atlas, roughness: 0.85, vertexColors: true, transparent: true }), { key: "tag" }),
  );
  mesh.frustumCulled = false;
  return {
    mesh,
    place(i: number, mid: Vector3, alpha: number) {
      const x = mid.x + 0.002;
      const y = mid.y - 0.016;
      const z = mid.z;
      const hw = TAG.w / 2;
      const hh = TAG.h / 2;
      // across runs along -z in board space, so the tag's left edge is +z
      position.array.set([x, y + hh, z + hw, x, y + hh, z - hw, x, y - hh, z + hw, x, y - hh, z - hw], i * 12);
      for (let k = 0; k < 4; k++) color.setXYZW(i * 4 + k, 1, 1, 1, alpha);
    },
    commit() {
      position.needsUpdate = color.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- paper

function drawFront(c: HTMLCanvasElement, id: string, title: string, hand: string, img: HTMLImageElement) {
  const g = c.getContext("2d")!;
  g.fillStyle = "#f1eee6";
  g.fillRect(0, 0, c.width, c.height);
  agePaper(g, c.width, c.height, id.charCodeAt(0));
  // the print: centred square crop in the window (POLAROID.img, POLAROID.imgUp above centre)
  const scale = c.width / POLAROID.w;
  const side = POLAROID.img * scale;
  const x0 = (c.width - side) / 2;
  const y0 = c.height / 2 - POLAROID.imgUp * scale - side / 2;
  g.fillStyle = "#16130f";
  g.fillRect(x0, y0, side, side);
  if (img.complete && img.naturalWidth) {
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, x0, y0, side, side);
    // faint gloss across the print
    const sheen = g.createLinearGradient(x0, y0, x0 + side, y0 + side);
    sheen.addColorStop(0, "rgba(255,255,255,0.08)");
    sheen.addColorStop(0.5, "rgba(255,255,255,0)");
    g.fillStyle = sheen;
    g.fillRect(x0, y0, side, side);
  }
  // handwritten label in the bottom margin, smaller if it's long, never off the card
  const label = `${id} — ${title}`;
  let size = 56;
  g.font = `${size}px ${hand}`;
  while (g.measureText(label).width > c.width - 56 && size > 34) g.font = `${(size -= 2)}px ${hand}`;
  g.fillStyle = "#1d2440";
  g.textAlign = "center";
  g.fillText(label, c.width / 2, c.height - 38);
}

function drawBack(c: HTMLCanvasElement, id: string, note: string, hand: string) {
  const g = c.getContext("2d")!;
  g.fillStyle = "#e4e0d6";
  g.fillRect(0, 0, c.width, c.height);
  agePaper(g, c.width, c.height, id.charCodeAt(0) + 50);
  g.fillStyle = "#1d2440";
  g.textAlign = "center";
  g.font = `64px ${hand}`;
  g.fillText(`Exhibit ${id}`, c.width / 2, 130);
  g.font = `60px ${hand}`;
  const words = note.split(" ");
  let line = "";
  let y = 280;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > c.width - 80 && line) {
      g.fillText(line, c.width / 2, y);
      line = w;
      y += 74;
    } else line = next;
  }
  g.fillText(line, c.width / 2, y);
}

function agePaper(g: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const rand = seeded(seed);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(110, 90, 60, ${0.02 + rand() * 0.04})`;
    g.fillRect(rand() * w, rand() * h, 1 + rand() * 4, 1 + rand() * 1.5);
  }
}

function drawTag(c: HTMLCanvasElement, label: string, typed: string) {
  const g = c.getContext("2d")!;
  g.fillStyle = "#e8dcc0";
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "rgba(60, 45, 30, 0.5)";
  g.lineWidth = 3;
  g.strokeRect(2, 2, c.width - 4, c.height - 4);
  g.fillStyle = "#1a1612";
  g.textAlign = "center";
  let size = 34;
  g.font = `${size}px ${typed}`;
  while (g.measureText(label).width > c.width - 24 && size > 18) g.font = `${--size}px ${typed}`;
  g.fillText(label, c.width / 2, c.height / 2 + size / 3);
}

function drawCard(c: HTMLCanvasElement, typed: string, lines: string[]) {
  const g = c.getContext("2d")!;
  g.fillStyle = "#ece5d2";
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "rgba(170, 60, 60, 0.45)";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, 70);
  g.lineTo(c.width, 70);
  g.stroke();
  g.strokeStyle = "rgba(90, 120, 170, 0.3)";
  g.lineWidth = 2;
  for (let y = 118; y < c.height; y += 48) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(c.width, y);
    g.stroke();
  }
  g.fillStyle = "#1a1612";
  lines.forEach((l, i) => {
    let size = 30;
    g.font = `${size}px ${typed}`;
    while (g.measureText(l).width > c.width - 50 && size > 18) g.font = `${--size}px ${typed}`;
    g.fillText(l, 26, i === 0 ? 52 : 108 + i * 48);
  });
}

function drawNote(c: HTMLCanvasElement, hand: string, text: string, color: string) {
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, "rgba(0,0,0,0.08)");
  grad.addColorStop(0.2, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "#1d2440";
  g.font = `64px ${hand}`;
  g.textAlign = "center";
  const words = text.split(" ");
  const mid = Math.ceil(words.length / 2);
  const lines = words.length > 2 ? [words.slice(0, mid).join(" "), words.slice(mid).join(" ")] : [text];
  lines.forEach((l, i) => g.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * 70 + 20));
}

function drawClipping(c: HTMLCanvasElement, headline: string, seed: number) {
  const g = c.getContext("2d")!;
  const rand = seeded(seed * 31);
  g.fillStyle = "#ddd5c0";
  g.fillRect(0, 0, c.width, c.height);
  agePaper(g, c.width, c.height, seed);
  g.fillStyle = "#14110e";
  g.font = `bold 30px Georgia, serif`;
  g.fillText("THE CITY DAILY", 24, 44);
  g.fillRect(24, 56, c.width - 48, 3);
  let size = 52;
  g.font = `bold ${size}px Georgia, serif`;
  const words = headline.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (g.measureText(next).width > c.width - 48 && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  lines.push(line);
  if (lines.length > 3) g.font = `bold ${(size = 42)}px Georgia, serif`;
  lines.forEach((l, i) => g.fillText(l, 24, 120 + i * size * 1.1));
  // body columns are just greeked lines, nothing to actually read
  const top = 120 + lines.length * size * 1.1 + 10;
  const colW = (c.width - 72) / 2;
  for (let col = 0; col < 2; col++)
    for (let y = top; y < c.height - 20; y += 16) {
      g.fillStyle = `rgba(30, 26, 22, ${0.35 + rand() * 0.2})`;
      g.fillRect(24 + col * (colW + 24), y, colW * (0.7 + rand() * 0.3), 6);
    }
}

function drawMap(c: HTMLCanvasElement, typed: string, hand: string) {
  // hand drawn sketch of bengaluru (my own drawing, no map tiles or real geometry)
  const g = c.getContext("2d")!;
  const rand = seeded(560);
  g.fillStyle = "#e3dcc4";
  g.fillRect(0, 0, c.width, c.height);
  agePaper(g, c.width, c.height, 9);
  const cx = c.width / 2;
  const cy = c.height / 2 + 20;
  g.strokeStyle = "rgba(60, 50, 40, 0.55)";
  g.lineWidth = 3;
  // ring road + a few highways going out
  g.beginPath();
  g.ellipse(cx, cy, 330, 250, 0.1, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 2;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + rand() * 0.3;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * 40, cy + Math.sin(a) * 30);
    g.quadraticCurveTo(cx + Math.cos(a + 0.2) * 260, cy + Math.sin(a + 0.2) * 200, cx + Math.cos(a) * 480, cy + Math.sin(a) * 360);
    g.stroke();
  }
  // lakes
  g.fillStyle = "rgba(90, 120, 140, 0.45)";
  for (const [x, y, rx, ry] of [
    [cx + 70, cy - 40, 28, 18],
    [cx + 230, cy + 120, 46, 22],
    [cx - 20, cy - 210, 30, 16],
  ] as const) {
    g.beginPath();
    g.ellipse(x, y, rx, ry, rand(), 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#2a241c";
  g.font = `36px ${typed}`;
  g.textAlign = "center";
  g.fillText("BENGALURU", cx, 60);
  g.font = `34px ${hand}`;
  g.fillStyle = "#3a3226";
  for (const [label, x, y] of [
    ["Hebbal", cx - 10, cy - 250],
    ["Whitefield", cx + 380, cy - 20],
    ["Indiranagar", cx + 150, cy - 70],
    ["Koramangala", cx + 90, cy + 80],
    ["Jayanagar", cx - 120, cy + 140],
    ["Rajajinagar", cx - 260, cy - 60],
    ["Electronic City", cx + 160, cy + 290],
  ] as const)
    g.fillText(label, x, y);
  // red circle in the middle, "somewhere in here"
  g.strokeStyle = "rgba(160, 20, 20, 0.85)";
  g.lineWidth = 6;
  g.beginPath();
  g.ellipse(cx - 10, cy + 20, 70, 52, -0.2, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "rgba(160, 20, 20, 0.9)";
  g.font = `40px ${hand}`;
  g.fillText("?", cx + 80, cy - 20);
}
