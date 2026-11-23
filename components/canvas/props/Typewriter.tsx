"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  CanvasTexture,
  type Material,
  Mesh,
  type MeshStandardMaterial,
  type Object3D,
  SRGBColorSpace,
  type WebGLProgramParametersWithUniforms,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { specialElite } from "@/app/fonts";
import { caseFile } from "@/content/case";
import { play } from "@/lib/audio";
import { BEATS, within } from "@/lib/cameraPath";
import { useStore } from "@/lib/store";
import { toFloat } from "../scenes/geometry";
import { planarUV } from "../scenes/uv";

// rough key layout for the four modelled rows, front (r=0) to back (r=3)
const ROWS = ["1234567890", "ZXCVBNM,.?-", "PASDFGHJKL", "QWERTYUIO"];
const HEADLINE = caseFile.hero.headline.toUpperCase();
const PAPER_W = 1024;
const PAPER_H = 1024;

function keyFor(ch: string): [number, number] | null {
  for (let r = 0; r < ROWS.length; r++) {
    const k = ROWS[r].indexOf(ch);
    if (k >= 0) return [r, k];
  }
  return null;
}

/** types the headline onto the paper while you scroll through the office */
export default function Typewriter({ roots }: { roots: Object3D[] }) {
  const rig = useMemo(() => {
    const find = (n: string) => {
      for (const r of roots) {
        const o = r.getObjectByName(n);
        if (o) return o;
      }
    };
    // merge all 40 keys into one mesh, a per vertex key id lets one key press down in the shader
    const keys: { mesh: Mesh; r: number; k: number }[] = [];
    for (const r of roots)
      r.traverse((o) => {
        const m = /^dyn_typewriter_key_(\d+)_(\d+)$/.exec(o.name);
        if (m && (o as Mesh).isMesh) keys.push({ mesh: o as Mesh, r: +m[1], k: +m[2] });
      });
    const press = new Float32Array(64);
    let keyMesh: Mesh | null = null;
    const index = new Map<string, number>();
    if (keys.length) {
      const geos = keys.map(({ mesh, r, k }, i) => {
        index.set(`${r}_${k}`, i);
        // bake each key's transform in so the merged mesh can sit at identity under the parent
        mesh.updateMatrix();
        const g = toFloat(mesh.geometry.clone()).applyMatrix4(mesh.matrix);
        g.setAttribute("keyId", new BufferAttribute(new Float32Array(g.attributes.position.count).fill(i), 1));
        return g;
      });
      const merged = mergeGeometries(geos, false);
      const first = keys[0].mesh;
      const base = first.material as MeshStandardMaterial;
      const mat = base.clone();
      const inner = base.onBeforeCompile.bind(base);
      mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer) => {
        inner(shader, renderer);
        shader.uniforms.uPress = { value: press };
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nattribute float keyId;\nuniform float uPress[64];")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed.y -= uPress[int(keyId + 0.5)] * 0.0045;");
      };
      mat.customProgramCacheKey = () => `${base.customProgramCacheKey()}keys`;
      keyMesh = new Mesh(merged!, mat);
      keyMesh.name = "dyn_typewriter_keys";
      first.parent?.add(keyMesh);
      for (const { mesh } of keys) mesh.removeFromParent();
    }
    const paper = find("dyn_typewriter_paper") as Mesh | undefined;
    const carriage = find("dyn_typewriter_carriage");
    return { press, index, keyMesh, paper, carriage, carriageRest: carriage?.position.clone(), typed: -1 };
  }, [roots]);

  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = PAPER_W;
    c.height = PAPER_H;
    return c;
  }, []);
  const texture = useMemo(() => {
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.channel = 1;
    t.anisotropy = 8;
    return t;
  }, [canvas]);

  useEffect(() => {
    const paper = rig.paper;
    if (!paper) return;
    planarUV(paper.geometry, "uv1");
    const mat = (paper.material as MeshStandardMaterial).clone();
    const base = paper.material as MeshStandardMaterial;
    mat.onBeforeCompile = base.onBeforeCompile.bind(base);
    mat.customProgramCacheKey = base.customProgramCacheKey.bind(base);
    mat.map = texture;
    mat.color.set("#ffffff");
    paper.material = mat as Material;
    return () => texture.dispose();
  }, [rig, texture]);

  const draw = (n: number) => {
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#e8e0cc";
    g.fillRect(0, 0, PAPER_W, PAPER_H);
    g.font = `54px ${specialElite.style.fontFamily}`;
    g.textBaseline = "alphabetic";
    let x = 96;
    for (let i = 0; i < n; i++) {
      const ch = HEADLINE[i];
      // ink jitter, every strike lands a bit differently
      const j = Math.sin(i * 12.9898) * 43758.5453;
      const jitter = j - Math.floor(j);
      g.globalAlpha = 0.78 + jitter * 0.22;
      g.fillStyle = "#16120f";
      g.fillText(ch, x + (jitter - 0.5) * 2, 300 + (jitter - 0.5) * 3);
      x += 33;
    }
    g.globalAlpha = 1;
    texture.needsUpdate = true;
  };

  useFrame((_, delta) => {
    const p = useStore.getState().progress;
    const n = Math.round(within(p, BEATS.typewriter) * HEADLINE.length);
    if (n !== rig.typed) {
      if (n > rig.typed && rig.typed >= 0) {
        const key = keyFor(HEADLINE[n - 1]);
        const i = key ? rig.index.get(`${key[0]}_${key[1]}`) : undefined;
        if (i !== undefined) rig.press[i] = 1;
        play(n === HEADLINE.length ? "ding" : "key");
      }
      rig.typed = n;
      draw(n);
      if (rig.carriage && rig.carriageRest) {
        rig.carriage.position.copy(rig.carriageRest);
        rig.carriage.translateX(-n * 0.0042);
      }
    }
    for (let i = 0; i < rig.press.length; i++) rig.press[i] = Math.max(0, rig.press[i] - delta * 9);
  });
  return null;
}
