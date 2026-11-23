import { BufferGeometry, CanvasTexture, Mesh, MeshStandardMaterial, PlaneGeometry, Quaternion, SRGBColorSpace } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { caveat, specialElite } from "@/app/fonts";
import { caseFile } from "@/content/case";
import { liveLit, PRINT_DEPTH, PRINT_LIFT } from "@/lib/materials";

/** where export.py says each piece of paper's printing goes (three coords) */
export type Decal = { kind: "panel" | "tag" | "log"; index: number; position: number[]; quaternion: number[]; size: number[] };

const ATLAS = 2048;
// slots (px): bag panels 3x3 top left, tags 3x3 below, the log down the right
const PANEL = { w: 512, h: 218 };
const TAG = { w: 512, h: 254 };
const LOG = { x: 1536, w: 512, h: 683 };
const INK = "#121014";
const PENCIL = "#121a3a";

/** fill + thicken, small canvas type goes grey once the GPU minifies it */
function ink(g: CanvasRenderingContext2D, text: string, x: number, y: number, weight: number) {
  g.lineWidth = weight;
  g.strokeStyle = g.fillStyle as string;
  g.lineJoin = "round";
  g.strokeText(text, x, y);
  g.fillText(text, x, y);
}

function slot(d: Decal) {
  if (d.kind === "log") return { x: LOG.x, y: 0, w: LOG.w, h: LOG.h };
  const c = d.index % 3;
  const r = Math.floor(d.index / 3);
  if (d.kind === "panel") return { x: c * PANEL.w, y: r * PANEL.h, w: PANEL.w, h: PANEL.h };
  return { x: c * TAG.w, y: 3 * PANEL.h + r * TAG.h, w: TAG.w, h: TAG.h };
}

/**
 * evidence room printing: each bag's panel (EVIDENCE header, case, item, description in pen),
 * each tag (tool typed, confidence handwritten) and the clipboard log. drawn from content/case.ts
 * onto one canvas and laid as one mesh just above the baked blank paper
 */
export function buildPrint(decals: Decal[]) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = ATLAS;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;

  const parts: BufferGeometry[] = [];
  const q = new Quaternion();
  for (const d of decals) {
    const s = slot(d);
    const g = new PlaneGeometry(d.size[0], d.size[1]).rotateX(-Math.PI / 2).translate(0, PRINT_LIFT, 0);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (s.x + uv.getX(i) * s.w) / ATLAS, 1 - (s.y + (1 - uv.getY(i)) * s.h) / ATLAS);
    }
    g.applyQuaternion(q.fromArray(d.quaternion)).translate(...(d.position as [number, number, number]));
    parts.push(g);
  }
  const geometry = parts.length ? mergeGeometries(parts) : new BufferGeometry();
  parts.forEach((g) => g.dispose());
  const material = liveLit(
    new MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false, roughness: 0.8, ...PRINT_DEPTH }),
    { room: "evidence", key: "print" },
  );
  const mesh = new Mesh(geometry, material);
  mesh.name = "evidence_print";
  mesh.renderOrder = 2;

  const typed = specialElite.style.fontFamily;
  const hand = caveat.style.fontFamily;
  const ready = Promise.all([document.fonts.load(`40px ${typed}`, "A"), document.fonts.load(`40px ${hand}`, "A")]).then(() => {
    const g = canvas.getContext("2d")!;
    g.clearRect(0, 0, ATLAS, ATLAS);
    for (const d of decals) {
      const s = slot(d);
      g.save();
      g.translate(s.x, s.y);
      if (d.kind === "panel") drawPanel(g, s.w, s.h, d.index, typed, hand);
      else if (d.kind === "tag") drawTag(g, s.w, s.h, d.index, typed, hand);
      else drawLog(g, s.w, s.h, typed);
      g.restore();
    }
    texture.needsUpdate = true;
  });
  return { mesh, texture, ready };
}

/** px per metre of a slot so type sizes are in real mm */
const mm = (w: number, metres: number) => w / (metres * 1000);

function drawPanel(g: CanvasRenderingContext2D, w: number, _h: number, i: number, typed: string, hand: string) {
  const k = mm(w, 0.2);
  const tool = caseFile.tools[i];
  // red header is baked, the word on it is white print
  g.fillStyle = "rgb(246 240 230 / 0.96)";
  g.font = `${8 * k}px ${typed}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  ink(g, "E V I D E N C E", w / 2, 9.5 * k, 0.25 * k);
  const fields: [string, string, number][] = [
    ["CASE No.", caseFile.caseNumber, 30],
    ["ITEM No.", String(i + 1).padStart(2, "0"), 45],
    ["DESCRIPTION", tool?.name ?? "", 60],
    ["SEIZED", new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }), 75],
  ];
  g.textAlign = "left";
  for (const [label, value, y] of fields) {
    g.fillStyle = INK;
    g.font = `${4.3 * k}px ${typed}`;
    ink(g, label, 5 * k, y * k, 0.22 * k);
    g.globalAlpha = 0.55;
    g.fillRect(33 * k, y * k + 2.4 * k, w - 38 * k, Math.max(1, 0.3 * k));
    g.globalAlpha = 1;
    g.fillStyle = PENCIL;
    g.font = `${(label === "DESCRIPTION" && value.length > 18 ? 5.6 : 7.4) * k}px ${hand}`;
    ink(g, value, 35 * k, y * k - 0.4 * k, 0.3 * k);
  }
}

function drawTag(g: CanvasRenderingContext2D, w: number, _h: number, i: number, typed: string, hand: string) {
  const k = mm(w, 0.105);
  const tool = caseFile.tools[i];
  if (!tool) return;
  // left 18mm is the eyelet end
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillStyle = INK;
  let size = 6.4;
  g.font = `${size * k}px ${typed}`;
  while (g.measureText(tool.name.toUpperCase()).width > w - 22 * k && size > 3.5) {
    size -= 0.3;
    g.font = `${size * k}px ${typed}`;
  }
  ink(g, tool.name.toUpperCase(), 18 * k, 22 * k, 0.25 * k);
  g.save();
  g.translate(19 * k, 40 * k);
  g.rotate(-0.035);
  g.fillStyle = PENCIL;
  g.font = `${9 * k}px ${hand}`;
  ink(g, tool.note, 0, 0, 0.3 * k);
  g.restore();
}

function drawLog(g: CanvasRenderingContext2D, w: number, _h: number, typed: string) {
  const k = mm(w, 0.21);
  g.textBaseline = "alphabetic";
  g.fillStyle = INK;
  g.textAlign = "left";
  g.font = `${6.5 * k}px ${typed}`;
  g.fillText("EVIDENCE LOG", 16 * k, 26 * k);
  g.font = `${4.2 * k}px ${typed}`;
  g.fillText(`CASE No. ${caseFile.caseNumber}`, 16 * k, 36 * k);
  g.globalAlpha = 0.5;
  g.fillRect(16 * k, 41 * k, w - 32 * k, Math.max(1, 0.3 * k));
  g.globalAlpha = 1;
  caseFile.tools.forEach((t, i) => {
    const y = (54 + i * 11.5) * k;
    g.fillStyle = INK;
    g.font = `${4.2 * k}px ${typed}`;
    g.fillText(String(i + 1).padStart(2, "0"), 16 * k, y);
    g.fillText(t.name, 28 * k, y);
    // pen tick - logged and bagged
    g.strokeStyle = PENCIL;
    g.lineWidth = 0.6 * k;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(w - 27 * k, y - 2.2 * k);
    g.lineTo(w - 25 * k, y + 0.2 * k);
    g.lineTo(w - 20.5 * k, y - 5 * k);
    g.stroke();
  });
}
