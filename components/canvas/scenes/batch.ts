import { type BufferGeometry, DoubleSide, type Material, Mesh, MeshBasicMaterial, type Object3D } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { toFloat } from "./geometry";

/**
 * draw call budget (under 150): merge static meshes that share a material into one. moving pieces
 * (`dyn_*` and anything under them) are left alone unless `alsoMerge` names them
 * (props that exist as pieces but don't move yet)
 */
export function batchStatics(root: Object3D, alsoMerge?: RegExp) {
  const groups = new Map<string, Mesh[]>();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    for (let p: Object3D | null = mesh; p; p = p.parent)
      if (p.name.startsWith("dyn_") && !alsoMerge?.test(p.name)) return;
    const g = mesh.geometry;
    const sig = Object.keys(g.attributes).sort().join(",") + (g.index ? "|i" : "");
    const key = `${(mesh.material as Material).uuid}|${sig}`;
    const list = groups.get(key) ?? [];
    list.push(mesh);
    groups.set(key, list);
  });
  let merged = 0;
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const geos: BufferGeometry[] = meshes.map((m) => toFloat(m.geometry.clone()).applyMatrix4(m.matrixWorld));
    const geo = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!geo) continue;
    const out = new Mesh(geo, meshes[0].material);
    out.name = `${meshes[0].name}__batch`;
    out.castShadow = meshes.some((m) => m.castShadow);
    out.receiveShadow = meshes.some((m) => m.receiveShadow);
    root.add(out);
    for (const m of meshes) m.removeFromParent();
    merged += meshes.length - 1;
  }
  return merged;
}

/**
 * things that never move skip three's matrix update every frame (budget phones are CPU bound before
 * GPU bound): baked statics plus the batches and depth copies made from them. moving pieces
 * (`dyn_*`) under a static parent still update against its fixed world matrix
 */
export function freezeStatics(root: Object3D) {
  root.traverse((o) => {
    if (!/^static_|__batch$|__depth$/.test(o.name)) return;
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  });
}

/**
 * fill rate (want 45+ fps on an iGPU). three draws opaque stuff grouped by material, not nearest
 * first, so in a close up the floor and walls under the desk got fully shaded and then painted over
 * - at the folder the desk props batch alone took 8.6 of 23ms on an Arc 140T. a depth only copy of
 * a big occluder drawn first lets the GPU throw away what it hides before shading. one extra draw
 * each, pushed back a hair so the real surface still passes the depth test (the copy uses a
 * different shader whose depth won't match to the bit)
 */
const depthOnly = (side: Material["side"]) =>
  new MeshBasicMaterial({ colorWrite: false, side, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
const DEPTH_ONLY = { front: depthOnly(0), double: depthOnly(DoubleSide) };

export function depthFirst(mesh: Mesh) {
  const m = mesh.material as Material;
  if (Array.isArray(mesh.material) || m.transparent || m.alphaTest > 0) return null;
  const pre = new Mesh(mesh.geometry, m.side === DoubleSide ? DEPTH_ONLY.double : DEPTH_ONLY.front);
  pre.name = `${mesh.name}__depth`;
  pre.renderOrder = -10;
  pre.castShadow = pre.receiveShadow = false;
  pre.raycast = () => {};
  mesh.add(pre);
  return pre;
}
