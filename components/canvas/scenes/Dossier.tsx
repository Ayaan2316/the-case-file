"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  TextureLoader,
  TubeGeometry,
  Vector3,
} from "three";
import { caveat, specialElite } from "@/app/fonts";
import { caseFile } from "@/content/case";
import { play } from "@/lib/audio";
import { BEATS, within } from "@/lib/cameraPath";
import { liveLit } from "@/lib/materials";
import { seeded } from "@/lib/random";
import { useStore } from "@/lib/store";
import manifestJson from "@/public/models/scene.json";

// the dossier: case folder on the desk opens like a book and two typed pages flip as you scroll.
// everything lives in the folder's own space (case_folder in props.py, three axes: x along the
// folder, y up, z towards the visitor)

const PAGE_W = 0.29;
const PAGE_H = 0.222;
const PX_PER_M = 2048 / PAGE_W;
const TEX_W = 2048;
const TEX_H = Math.round(PAGE_H * PX_PER_M);
const COVER_HINGE = new Vector3(-0.155, 0.0034, 0); // left edge of dyn_case_folder_front
const PAGE_HINGE = new Vector3(-0.149, 0.0036, 0);
const COLUMNS = 48;

const pivots = (manifestJson as { pivots: Record<string, { position: number[]; quaternion: number[] }> }).pivots;

/**
 * cover opens to just short of flat (it rests on its spine). page 1 turns to the same angle so it
 * ends up ~0.6mm above the cover - turned fully flat (PI) it went under the cover
 */
const COVER_OPEN = Math.PI - 0.025;

/** paper bending as it turns (t 0-1): hinge edge leads, free edge trails */
function curlAngle(t: number, s: number) {
  return t * COVER_OPEN - 1.15 * Math.sin(Math.PI * t) * Math.pow(s / PAGE_W, 1.25);
}

export default function Dossier({ roots }: { roots: Object3D[] }) {
  const rig = useMemo(() => {
    const frame = new Group();
    frame.name = "dossier";
    const hinge = new Group();
    hinge.position.copy(COVER_HINGE);
    frame.add(hinge);
    return { frame, hinge, front: null as Object3D | null, open: 0, flip: 0 };
  }, []);

  const pages = useMemo(() => {
    const make = () => {
      const canvas = document.createElement("canvas");
      canvas.width = TEX_W;
      canvas.height = TEX_H;
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      texture.anisotropy = 8;
      return { canvas, texture };
    };
    return { one: make(), two: make() };
  }, []);

  // pages, the clipped polaroid and its paperclip, built once and parented to the folder
  const parts = useMemo(() => {
    const paper = (map: CanvasTexture) =>
      liveLit(new MeshStandardMaterial({ map, roughness: 0.86, side: DoubleSide }), {
        key: "page",
        // back of a sheet is plain paper with the typing faintly showing through, mirrored
        extra: (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <map_fragment>",
            `#include <map_fragment>
            if (!gl_FrontFacing) {
              float through = dot(texture2D(map, vec2(1.0 - vMapUv.x, vMapUv.y)).rgb, vec3(0.333));
              diffuseColor.rgb = vec3(0.86, 0.82, 0.72) * mix(0.94, 1.0, through);
            }`,
          );
        },
      });
    const sheet = (map: CanvasTexture, y: number, yaw: number) => {
      const geo = new PlaneGeometry(PAGE_W, PAGE_H, COLUMNS, 6).rotateX(-Math.PI / 2).translate(PAGE_W / 2, 0, 0);
      const mesh = new Mesh(geo, paper(map));
      mesh.position.copy(PAGE_HINGE);
      mesh.rotation.y = yaw;
      mesh.userData.restY = y - PAGE_HINGE.y;
      mesh.geometry.translate(0, mesh.userData.restY, 0);
      mesh.geometry.userData.base = Float32Array.from(geo.attributes.position.array);
      return mesh;
    };
    const page1 = sheet(pages.one.texture, 0.00305, -0.01);
    const page2 = sheet(pages.two.texture, 0.003, 0.014);

    // polaroid in the photo box, paperclip over its top edge
    const polaroid = new Group();
    const card = new Mesh(new BoxGeometry(0.0745, 0.0006, 0.0905), liveLit(new MeshStandardMaterial({ color: "#e2ddd2", roughness: 0.8 })));
    const photoTex = new TextureLoader().load(caseFile.subject.photo, (t) => {
      const img = t.image as HTMLImageElement;
      const aspect = img.width / img.height;
      // centred square crop
      if (aspect > 1) {
        t.repeat.set(1 / aspect, 1);
        t.offset.set((1 - 1 / aspect) / 2, 0);
      } else {
        t.repeat.set(1, aspect);
        t.offset.set(0, (1 - aspect) / 2);
      }
    });
    photoTex.colorSpace = SRGBColorSpace;
    photoTex.anisotropy = 8;
    const photo = new Mesh(
      new PlaneGeometry(0.0655, 0.0655).rotateX(-Math.PI / 2),
      liveLit(new MeshStandardMaterial({ map: photoTex, roughness: 0.32 }), { key: "photo" }),
    );
    photo.position.set(0, 0.00032, -0.0085);
    polaroid.add(card, photo);
    const clipPath = new CatmullRomCurve3(
      [
        [-0.006, 0.0007, -0.058],
        [-0.006, 0.0007, -0.026],
        [0.0, 0.0007, -0.021],
        [0.006, 0.0007, -0.026],
        [0.006, 0.0007, -0.052],
        [0.001, 0.0007, -0.057],
        [-0.003, 0.0007, -0.052],
        [-0.003, 0.0007, -0.031],
      ].map(([x, y, z]) => new Vector3(x, y, z)),
    );
    const clip = new Mesh(
      new TubeGeometry(clipPath, 64, 0.00045, 6),
      liveLit(new MeshStandardMaterial({ color: "#c9ccd0", metalness: 1, roughness: 0.22 }), { key: "clip" }),
    );
    clip.position.set(-0.012, 0, 0);
    polaroid.add(clip);
    polaroid.userData.s = 360 / PX_PER_M; // its centre, measured from the hinge
    polaroid.userData.z = -PAGE_H / 2 + 560 / PX_PER_M;
    return { page1, page2, polaroid };
  }, [pages]);

  // typed pages, drawn once the typewriter + handwriting fonts have loaded
  useEffect(() => {
    let cancelled = false;
    const typed = specialElite.style.fontFamily;
    const hand = caveat.style.fontFamily;
    Promise.all([document.fonts.load(`40px ${typed}`, "A"), document.fonts.load(`40px ${hand}`, "A")])
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return;
        drawProfile(pages.one.canvas, typed);
        drawModusOperandi(pages.two.canvas, typed, hand);
        pages.one.texture.needsUpdate = true;
        pages.two.texture.needsUpdate = true;
      });
    return () => {
      cancelled = true;
    };
  }, [pages]);

  // into the folder's space, cover swings on its left edge
  useEffect(() => {
    let front: Object3D | undefined;
    for (const r of roots) r.traverse((o) => o.name === "dyn_case_folder_front" && (front = o));
    const pivot = pivots.dyn_case_folder;
    if (!front || !front.parent || !pivot) return;
    const { frame, hinge } = rig;
    const home = front.parent;
    frame.position.fromArray(pivot.position);
    frame.quaternion.fromArray(pivot.quaternion);
    home.add(frame);
    frame.updateMatrixWorld(true);
    hinge.rotation.z = 0;
    hinge.attach(front);
    const baked = new Map<Mesh, Mesh["material"]>();
    front.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      baked.set(m, m.material);
      m.material = liveLit(m.material as MeshStandardMaterial, { key: "cover" });
    });
    const { page1, page2, polaroid } = parts;
    frame.add(page1, page2);
    page1.add(polaroid);
    rig.front = front;
    rig.open = rig.flip = -1; // re-pose next frame
    bendPage(page1, 0, polaroid);
    // undo everything (effects run twice in dev), cover goes back closed and baked
    return () => {
      rig.front = null;
      hinge.rotation.z = 0;
      hinge.updateMatrixWorld(true);
      home.attach(front!);
      for (const [m, mat] of baked) m.material = mat;
      home.remove(frame);
    };
  }, [roots, rig, parts]);

  useFrame(() => {
    if (!rig.front) return;
    const p = useStore.getState().progress;
    const open = within(p, BEATS.folderOpen);
    const flip = within(p, BEATS.pageFlip);
    const ease = (x: number) => x * x * (3 - 2 * x);
    if (open !== rig.open) {
      if (rig.open < 0.03 && open >= 0.03) play("rustle");
      rig.hinge.rotation.z = ease(open) * COVER_OPEN;
      rig.open = open;
    }
    if (flip !== rig.flip) {
      if ((rig.flip < 0.03 && flip >= 0.03) || (rig.flip > 0.97 && flip <= 0.97)) play("rustle");
      bendPage(parts.page1, ease(flip), parts.polaroid);
      rig.flip = flip;
    }
    // hidden while closed, the baked folder already shows them where it matters
    parts.page1.visible = parts.page2.visible = open > 0.001;
  });

  return null;
}

/** bend page 1 to `t` (0 = lying on the stack, 1 = turned over onto the open cover) */
function bendPage(page: Mesh, t: number, polaroid: Group) {
  const geo = page.geometry;
  const pos = geo.attributes.position;
  const base = geo.userData.base as Float32Array;
  const rest = page.userData.restY as number;
  const step = PAGE_W / COLUMNS;
  const xs: number[] = [0];
  const ys: number[] = [0];
  for (let i = 1; i <= COLUMNS; i++) {
    const a = curlAngle(t, (i - 0.5) * step);
    xs.push(xs[i - 1] + Math.cos(a) * step);
    ys.push(ys[i - 1] + Math.sin(a) * step);
  }
  for (let v = 0; v < pos.count; v++) {
    const s = base[v * 3];
    const col = Math.round(s / step);
    const a = curlAngle(t, s);
    // the sheet's thickness offset under the pivot turns with it
    pos.setXYZ(v, xs[col] - rest * Math.sin(a), ys[col] + rest * Math.cos(a), base[v * 3 + 2]);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  // polaroid rides along with the page at its spot on the curl
  const s = polaroid.userData.s as number;
  const col = Math.min(COLUMNS, Math.round(s / step));
  const a = curlAngle(t, s);
  // keep it off the page's front face (coplanar faces flicker through the turned page),
  // which ends up underneath once the page turns
  const off = rest + 0.0004;
  polaroid.position.set(xs[col] - off * Math.sin(a), ys[col] + off * Math.cos(a), polaroid.userData.z);
  polaroid.quaternion.setFromAxisAngle(Z_AXIS, a).multiply(TILT);
}

const Z_AXIS = new Vector3(0, 0, 1);
const TILT = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.07);

// ---------------------------------------------------------------- page artwork

function paperBase(g: CanvasRenderingContext2D, seed: number) {
  const rand = seeded(seed);
  g.fillStyle = "#e6dcc6";
  g.fillRect(0, 0, TEX_W, TEX_H);
  // fibres and foxing - tiny strokes and spots, a bit darker towards the edges
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${90 + rand() * 60}, ${70 + rand() * 40}, ${40 + rand() * 30}, ${0.025 + rand() * 0.05})`;
    const x = rand() * TEX_W;
    const y = rand() * TEX_H;
    g.fillRect(x, y, 1 + rand() * 6, 1 + rand() * 1.5);
  }
  const edge = g.createRadialGradient(TEX_W / 2, TEX_H / 2, TEX_H * 0.45, TEX_W / 2, TEX_H / 2, TEX_W * 0.62);
  edge.addColorStop(0, "rgba(120, 90, 50, 0)");
  edge.addColorStop(1, "rgba(120, 90, 50, 0.16)");
  g.fillStyle = edge;
  g.fillRect(0, 0, TEX_W, TEX_H);
}

/** typewriter strike, slight jitter per letter in position and ink */
function type(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, family: string, seed = 1) {
  const rand = seeded(seed + text.length * 7);
  g.font = `${size}px ${family}`;
  g.fillStyle = "#1a1612";
  let cx = x;
  for (const ch of text) {
    g.globalAlpha = 0.72 + rand() * 0.28;
    g.fillText(ch, cx + (rand() - 0.5) * 1.6, y + (rand() - 0.5) * 2.2);
    cx += g.measureText(ch).width;
  }
  g.globalAlpha = 1;
}

/** word wrap `text` into lines no wider than `width` with the current font */
function wrap(g: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function typeBlock(g: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, size: number, family: string, lead = 1.3) {
  g.font = `${size}px ${family}`;
  const lines = wrap(g, text, width);
  lines.forEach((l, i) => type(g, l, x, y + i * size * lead, size, family, i + 3));
  return y + lines.length * size * lead;
}

function rule(g: CanvasRenderingContext2D, x0: number, x1: number, y: number) {
  g.strokeStyle = "rgba(30, 25, 20, 0.55)";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x0, y);
  g.lineTo(x1, y);
  g.stroke();
}

function stamp(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, angle: number, family: string) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.font = `${size}px ${family}`;
  const w = g.measureText(text).width;
  g.strokeStyle = "rgba(150, 22, 18, 0.7)";
  g.lineWidth = 6;
  g.strokeRect(-w / 2 - 24, -size * 0.95, w + 48, size * 1.3);
  g.fillStyle = "rgba(150, 22, 18, 0.72)";
  g.fillText(text, -w / 2, 0);
  // uneven ink, knock small holes out of the letters
  const rand = seeded(91);
  g.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 420; i++) {
    g.fillStyle = `rgba(0, 0, 0, ${0.25 + rand() * 0.6})`;
    g.fillRect(-w / 2 - 30 + rand() * (w + 60), -size + rand() * size * 1.4, 2 + rand() * 7, 2 + rand() * 4);
  }
  g.restore();
}

function drawProfile(canvas: HTMLCanvasElement, typed: string) {
  const g = canvas.getContext("2d")!;
  const s = caseFile.subject;
  const job = caseFile.experience[0];
  paperBase(g, 11);
  g.textBaseline = "alphabetic";
  type(g, "SUBJECT PROFILE", 110, 150, 72, typed, 1);
  type(g, `CASE No. ${caseFile.caseNumber}`, 1540, 150, 46, typed, 2);
  rule(g, 110, TEX_W - 110, 190);
  // photo box (the 3D polaroid sits in it)
  g.strokeStyle = "rgba(30, 25, 20, 0.4)";
  g.lineWidth = 2;
  g.strokeRect(80, 230, 560, 660);
  type(g, "PHOTOGRAPH", 250, 930, 30, typed, 4);
  // fields
  const fields: [string, string][] = [
    ["NAME", s.name],
    ["TRADE", s.trade],
    ["OCCUPATION", `${job.org}: ${job.role}`],
    ["INSTITUTION", s.institution],
    ["LOCATION", s.location],
    ["STATUS", s.status],
  ];
  let y = 290;
  for (const [label, value] of fields) {
    type(g, `${label}:`, 720, y, 34, typed, label.length);
    y = typeBlock(g, value, 1040, y, TEX_W - 1040 - 110, 42, typed) + 22;
    rule(g, 1030, TEX_W - 110, y - 52);
  }
  // two lists along the bottom
  const top = Math.max(y + 20, 1000);
  type(g, "KNOWN ASSOCIATES", 110, top, 38, typed, 5);
  type(g, "PRIOR RECORD", 1060, top, 38, typed, 6);
  let ly = top + 64;
  for (const item of caseFile.knownAssociates) ly = typeBlock(g, `- ${item}`, 110, ly, 880, 32, typed, 1.25) + 10;
  ly = top + 64;
  for (const item of caseFile.priorRecord) ly = typeBlock(g, `- ${item}`, 1060, ly, 880, 32, typed, 1.25) + 10;
  stamp(g, "CONFIDENTIAL", 1560, Math.min(Math.max(y + 110, 760), top - 90), 64, -0.16, typed);
}

function drawModusOperandi(canvas: HTMLCanvasElement, typed: string, hand: string) {
  const g = canvas.getContext("2d")!;
  paperBase(g, 23);
  type(g, "MODUS OPERANDI", 110, 150, 72, typed, 7);
  type(g, `CASE No. ${caseFile.caseNumber}`, 1540, 150, 46, typed, 2);
  rule(g, 110, TEX_W - 110, 190);
  let y = typeBlock(g, `"${caseFile.modusOperandi}"`, 160, 300, 1150, 56, typed, 1.35);
  const listTop = y + 70;
  type(g, "PATTERN OF ACTIVITY:", 110, listTop, 38, typed, 8);
  y = listTop + 70;
  for (const e of caseFile.exhibits) {
    type(g, `EXHIBIT ${e.id} - ${e.board ?? e.title}`, 150, y, 34, typed, e.id.charCodeAt(0));
    y = typeBlock(g, e.tag, 200, y + 44, 900, 28, typed, 1.2) + 26;
  }
  // handwritten notes (pencil blue) in the right margin, repeating the file
  const ink = "rgba(38, 52, 96, 0.85)";
  const note = (text: string, x: number, yy: number, size: number, angle: number) => {
    g.save();
    g.translate(x, yy);
    g.rotate(angle);
    g.font = `${size}px ${hand}`;
    g.fillStyle = ink;
    g.fillText(text, 0, 0);
    g.restore();
  };
  g.strokeStyle = ink;
  g.lineWidth = 4;
  g.lineCap = "round";
  note("goes deep underneath", 1430, 330, 58, -0.06);
  g.beginPath();
  g.moveTo(1440, 350);
  g.quadraticCurveTo(1360, 400, 1330, 470);
  g.stroke();
  const mid = listTop + 260;
  note(`${caseFile.exhibits.length} exhibits`, 1300, mid, 62, -0.05);
  note("see the board ->", 1330, mid + 70, 54, -0.05);
  note(caseFile.subject.status.toLowerCase(), 1330, mid + 330, 60, -0.05);
  g.beginPath();
  g.ellipse(1520, mid + 310, 290, 62, -0.05, 0, Math.PI * 2);
  g.stroke();
}
