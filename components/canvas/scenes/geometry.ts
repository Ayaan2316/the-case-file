import { BufferAttribute, type BufferGeometry, Matrix4, type Mesh, type Object3D, Quaternion, Vector3 } from "three";

/**
 * meshopt GLBs store quantized (int16/uint16 normalized) attributes and fold the dequantization
 * into each node's transform. anything that rewrites vertices (merging, re-pivoting) has to
 * work on plain floats first
 */
export function toFloat(geometry: BufferGeometry) {
  for (const [name, attr] of Object.entries(geometry.attributes)) {
    const a = attr as BufferAttribute;
    if (a.array instanceof Float32Array && !a.normalized) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) {
      out[i * a.itemSize] = a.getX(i);
      if (a.itemSize > 1) out[i * a.itemSize + 1] = a.getY(i);
      if (a.itemSize > 2) out[i * a.itemSize + 2] = a.getZ(i);
      if (a.itemSize > 3) out[i * a.itemSize + 3] = a.getW(i);
    }
    geometry.setAttribute(name, new BufferAttribute(out, a.itemSize));
  }
  return geometry;
}

export type Pivots = Record<string, { position: number[]; quaternion: number[] }>;

/**
 * put every moving piece back on its real pivot (door hinge, fan centre, clock axis) from
 * export.py, undoing the offset meshopt added to the node transform
 */
export function restorePivots(root: Object3D, pivots: Pivots) {
  root.updateMatrixWorld(true);
  const inv = new Matrix4();
  root.traverse((o) => {
    const mesh = o as Mesh;
    const pivot = pivots[mesh.name];
    if (!mesh.isMesh || !pivot) return;
    mesh.updateMatrix();
    const geo = toFloat(mesh.geometry.clone()).applyMatrix4(mesh.matrix);
    mesh.position.fromArray(pivot.position);
    mesh.quaternion.copy(new Quaternion().fromArray(pivot.quaternion));
    mesh.scale.set(1, 1, 1);
    mesh.updateMatrix();
    geo.applyMatrix4(inv.copy(mesh.matrix).invert());
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    mesh.geometry = geo;
  });
}

export const _v = new Vector3();
