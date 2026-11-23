import {
  CanvasTexture,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  NoColorSpace,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  type Texture,
} from "three";
import { specialElite } from "@/app/fonts";
import { caseFile } from "@/content/case";
import { liveLit, PRINT_DEPTH, PRINT_LIFT } from "@/lib/materials";
import { seeded } from "@/lib/random";

/** a piece of paper's pose from export.py (three coords), like the evidence decals */
export type Pose = { position: number[]; quaternion: number[]; size: number[] };

const INK = "#121014";
const QUESTION = "#5e5955";

/** the paper's plane, or just its top `h` metres (for prints that only cover the typed part) */
function plane(pose: Pose, lift = 0, h = pose.size[1]) {
  const g = new PlaneGeometry(pose.size[0], h)
    .translate(0, (pose.size[1] - h) / 2, 0)
    .rotateX(-Math.PI / 2)
    .translate(0, lift, 0);
  g.applyQuaternion(new Quaternion().fromArray(pose.quaternion)).translate(...(pose.position as [number, number, number]));
  return g;
}

/**
 * only the part of the paper between (x0, y0) and (x1, y1), in mm from the top left, with the matching
 * part of the texture. a print covering a small patch shouldn't shade the whole page (the verdict
 * label plane covered the whole folder and filled the screen in the close up for a 10cm label)
 */
function region(pose: Pose, [x0, y0, x1, y1]: [number, number, number, number], lift = 0) {
  const [w, h] = pose.size.map((v) => v * 1000);
  const g = new PlaneGeometry((x1 - x0) / 1000, (y1 - y0) / 1000).translate(((x0 + x1) / 2 - w / 2) / 1000, (h / 2 - (y0 + y1) / 2) / 1000, 0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / w, 1 - (y1 - uv.getY(i) * (y1 - y0)) / h);
  g.rotateX(-Math.PI / 2).translate(0, lift, 0);
  g.applyQuaternion(new Quaternion().fromArray(pose.quaternion)).translate(...(pose.position as [number, number, number]));
  return g;
}

/** typed label on the case file cover, in mm from its top left */
const LABEL: [number, number, number, number] = [70, 22, 170, 50];

const fonts = () => {
  const typed = specialElite.style.fontFamily;
  return document.fonts.load(`40px ${typed}`, "A").then(() => ({ typed }));
};

/**
 * transcript: typed line by line as you scroll, questions in grey, answers in black. the whole text
 * is drawn once and a second texture stores each character's typing order, so revealing it is just
 * a uniform compare in the shader (no canvas upload every frame). typewriter type is ~4mm so the
 * canvas runs at 7px/mm, only covers the typed part, and every glyph is stroked + filled
 * (thin strokes go grey once minified)
 */
export async function buildTranscript(pose: Pose) {
  const { typed } = await fonts();
  const W = 1536;
  const k = W / (pose.size[0] * 1000); // px per mm
  const left = 18 * k;
  const width = W - 36 * k;
  const size = 4.1 * k;
  const lineH = 6.2 * k;

  // lay out every character first, each one gets its spot in the typing order and the canvas only
  // needs to reach the last line
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = `${size}px ${typed}`;
  type Glyph = { ch: string; x: number; y: number; w: number; colour: string };
  const glyphs: Glyph[] = [];
  let y = 44 * k;
  const wrap = (prefix: string, text: string, colour: string) => {
    const indent = measure.measureText(prefix).width;
    let x = left;
    const put = (str: string) => {
      for (const ch of str) {
        const w = measure.measureText(ch).width;
        glyphs.push({ ch, x, y, w, colour });
        x += w;
      }
    };
    put(prefix);
    for (const word of text.split(" ")) {
      if (x + measure.measureText(`${word} `).width > left + width) {
        y += lineH;
        x = left + indent;
      }
      put(`${word} `);
    }
    y += lineH;
  };
  for (const line of caseFile.transcript) {
    wrap("Q: ", line.q, QUESTION);
    wrap("A: ", line.a, INK);
    y += lineH * 0.55;
  }
  const H = Math.min(Math.round(pose.size[1] * 1000 * k), Math.ceil(y + 4 * k));

  const ink = document.createElement("canvas");
  const order = document.createElement("canvas");
  ink.width = order.width = W;
  ink.height = order.height = H;
  const g = ink.getContext("2d")!;
  const o = order.getContext("2d")!;
  // typing order: white (last) everywhere, black (first) over the header, each glyph's box gets its turn
  o.fillStyle = "#ffffff";
  o.fillRect(0, 0, W, H);
  o.fillStyle = "#000000";
  o.fillRect(0, 0, W, 36 * k);
  g.textBaseline = "alphabetic";
  // header, typed before the interview starts
  g.fillStyle = INK;
  g.font = `${4.6 * k}px ${typed}`;
  ink_(g, `TRANSCRIPT · CASE No. ${caseFile.caseNumber}`, left, 22 * k, 0.2 * k);
  g.font = `${3.4 * k}px ${typed}`;
  ink_(g, `Interview with the subject, ${caseFile.subject.name}. Tape 1, side A.`, left, 29 * k, 0.16 * k);
  g.fillRect(left, 33 * k, width, Math.max(1, 0.3 * k));
  g.font = `${size}px ${typed}`;
  const n = Math.max(1, glyphs.length);
  glyphs.forEach((gl, i) => {
    g.fillStyle = gl.colour;
    // every strike lands a little differently, ink and height
    const j = Math.sin(i * 12.9898) * 43758.5453;
    const jitter = j - Math.floor(j);
    g.globalAlpha = 0.9 + jitter * 0.1;
    ink_(g, gl.ch, gl.x, gl.y + (jitter - 0.5) * 0.25 * k, 0.3 * k);
    g.globalAlpha = 1;
    const v = Math.round(((i + 1) / (n + 1)) * 65535);
    o.fillStyle = `rgb(${v >> 8} ${v & 255} 0)`;
    o.fillRect(Math.floor(gl.x) - 1, Math.floor(gl.y - size), Math.ceil(gl.w) + 2, Math.ceil(size * 1.35));
  });

  const inkTex = new CanvasTexture(ink);
  inkTex.colorSpace = SRGBColorSpace;
  inkTex.anisotropy = 8;
  const orderTex = new CanvasTexture(order);
  orderTex.colorSpace = NoColorSpace;
  orderTex.minFilter = orderTex.magFilter = NearestFilter;
  orderTex.generateMipmaps = false;
  const reveal = { value: 0 };
  const material = liveLit(
    new MeshStandardMaterial({ map: inkTex, transparent: true, depthWrite: false, roughness: 0.8, ...PRINT_DEPTH }),
    {
      room: "interrogation",
      key: "transcript",
      extra: (shader) => {
        Object.assign((shader as unknown as { uniforms: Record<string, unknown> }).uniforms, { tOrder: { value: orderTex }, uReveal: reveal });
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nuniform sampler2D tOrder;\nuniform float uReveal;")
          .replace(
            "#include <map_fragment>",
            `#include <map_fragment>
            vec2 ord = texture2D(tOrder, vMapUv).rg;
            if ((ord.r * 255.0 * 256.0 + ord.g * 255.0) / 65535.0 > uReveal) diffuseColor.a = 0.0;`,
          );
      },
    },
  );
  const mesh = new Mesh(plane(pose, PRINT_LIFT, H / (k * 1000)), material);
  mesh.name = "interro_transcript_print";
  mesh.renderOrder = 2;

  return {
    mesh,
    /** 0 = nothing typed yet, 1 = all of it */
    set(t: number) {
      reveal.value = t;
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
      inkTex.dispose();
      orderTex.dispose();
    },
  };
}

/**
 * where the stamp lands on the case file, in the cover's own space (blender metres, x across,
 * y up the cover): a bit under the label, turned a few degrees off square
 */
export const STAMP_LAND = { x: 0, y: -0.035, yaw: -0.07 };
/** rubber face (case_file_ in interrogation_room.py) */
const RUBBER = { w: 0.078, h: 0.042 };

/** case file cover: typed label (always there) and the GUILTY stamp, shown the moment the stamp lands */
export function buildVerdict(pose: Pose) {
  const W = 1024;
  const H = Math.round((W * pose.size[1]) / pose.size[0]);
  const make = () => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 8;
    return { c, t };
  };
  const label = make();
  const stamp = make();
  const mat = (map: Texture, key: string) =>
    liveLit(new MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.75, ...PRINT_DEPTH }), {
      room: "interrogation",
      key,
    });
  const labelMesh = new Mesh(region(pose, LABEL, PRINT_LIFT), mat(label.t, "verdict-label"));
  const stampMat = mat(stamp.t, "verdict-stamp") as MeshStandardMaterial;
  stampMat.opacity = 0;
  const stampMesh = new Mesh(plane(pose, PRINT_LIFT + 0.0002), stampMat);
  stampMesh.visible = false; // until it lands - at opacity 0 it still shaded the whole cover
  labelMesh.name = "interro_casefile_label";
  stampMesh.name = "interro_casefile_stamp";
  labelMesh.renderOrder = stampMesh.renderOrder = 2;

  const ready = fonts().then(({ typed }) => {
    const k = W / (pose.size[0] * 1000); // px per mm
    // typed label on the cover
    const g = label.c.getContext("2d")!;
    g.fillStyle = "rgb(236 230 214 / 0.95)";
    g.fillRect(LABEL[0] * k, LABEL[1] * k, (LABEL[2] - LABEL[0]) * k, (LABEL[3] - LABEL[1]) * k);
    g.fillStyle = INK;
    g.font = `${5 * k}px ${typed}`;
    ink_(g, `CASE No. ${caseFile.caseNumber}`, 76 * k, 33 * k, 0.25 * k);
    g.font = `${4 * k}px ${typed}`;
    ink_(g, `SUBJECT: ${caseFile.subject.name.toUpperCase()}`, 76 * k, 43 * k, 0.22 * k);
    label.t.needsUpdate = true;

    // GUILTY, the size of the rubber: red, uneven ink, double border. rubber yaw is counter clockwise
    // from above, canvas y runs down the cover so it turns the other way
    const s = stamp.c.getContext("2d")!;
    s.translate(W / 2 + STAMP_LAND.x * 1000 * k, H / 2 - STAMP_LAND.y * 1000 * k);
    s.rotate(-STAMP_LAND.yaw);
    s.strokeStyle = s.fillStyle = "#b0161d";
    const bw = (RUBBER.w * 1000 - 3) * k;
    const bh = (RUBBER.h * 1000 - 3) * k;
    s.lineWidth = 1.8 * k;
    s.strokeRect(-bw / 2, -bh / 2, bw, bh);
    s.lineWidth = 0.7 * k;
    s.strokeRect(-bw / 2 + 3 * k, -bh / 2 + 3 * k, bw - 6 * k, bh - 6 * k);
    let size = 22;
    s.font = `bold ${size * k}px ${typed}`;
    while (s.measureText(caseFile.verdict.stamp).width > bw - 12 * k && size > 8) {
      size -= 0.5;
      s.font = `bold ${size * k}px ${typed}`;
    }
    s.textAlign = "center";
    s.textBaseline = "middle";
    ink_(s, caseFile.verdict.stamp, 0, 1 * k, 0.5 * k);
    s.setTransform(1, 0, 0, 1, 0, 0);
    // rubber never inks evenly - speckled gaps, a dry edge, heavier where it hit first
    s.globalCompositeOperation = "destination-out";
    const rand = seeded(2316); // same speckle every visit
    for (let i = 0; i < 1800; i++) {
      const r = rand();
      s.globalAlpha = 0.3 + rand() * 0.6;
      s.beginPath();
      s.arc(W / 2 + (rand() - 0.5) * 90 * k, H / 2 - STAMP_LAND.y * 1000 * k + (rand() - 0.5) * 50 * k, (r * r * 0.9 + 0.08) * k, 0, Math.PI * 2);
      s.fill();
    }
    const dry = s.createLinearGradient(W / 2 - 40 * k, 0, W / 2 + 40 * k, 0);
    dry.addColorStop(0, "rgb(0 0 0 / 0.05)");
    dry.addColorStop(0.75, "rgb(0 0 0 / 0.12)");
    dry.addColorStop(1, "rgb(0 0 0 / 0.45)");
    s.globalAlpha = 1;
    s.fillStyle = dry;
    s.fillRect(0, 0, W, H);
    s.globalCompositeOperation = "source-over";
    stamp.t.needsUpdate = true;
  });

  return {
    meshes: [labelMesh, stampMesh],
    ready,
    /** 0 = no stamp yet, 1 = inked. wet ink shines for a moment then dries matte */
    set(inked: number, sinceImpact: number) {
      stampMat.opacity = inked;
      stampMesh.visible = inked > 0;
      stampMat.roughness = 0.3 + 0.45 * Math.min(1, Math.max(0, sinceImpact) / 1.5);
    },
    dispose() {
      for (const m of [labelMesh, stampMesh]) m.geometry.dispose();
      label.t.dispose();
      stamp.t.dispose();
    },
  };
}

/** fill + thicken like the evidence prints, thin canvas type goes grey once minified */
function ink_(g: CanvasRenderingContext2D, text: string, x: number, y: number, weight: number) {
  g.lineWidth = weight;
  g.strokeStyle = g.fillStyle as string;
  g.lineJoin = "round";
  g.strokeText(text, x, y);
  g.fillText(text, x, y);
}

