import { BufferAttribute, type BufferGeometry } from "three";

/**
 * adds a 0-1 planar UV set to a flat-ish mesh (typewriter paper, calendar page) so a CanvasTexture
 * can go on it while the atlas UV keeps feeding the lightmap. projects onto the two longest axes of
 * the bounding box, v runs up the longer vertical-ish one
 */
export function planarUV(geometry: BufferGeometry, name = "uv1", flipU = false) {
  if (geometry.getAttribute(name)) return;
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const size = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z];
  const axes = [0, 1, 2].sort((a, b) => size[b] - size[a]).slice(0, 2);
  // use y (up) as v if it's one of the two
  const [ua, va] = axes.includes(1) ? [axes.find((a) => a !== 1)!, 1] : axes;
  const pos = geometry.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  const min = [box.min.x, box.min.y, box.min.z];
  for (let i = 0; i < pos.count; i++) {
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const u = (p[ua] - min[ua]) / (size[ua] || 1);
    uv[i * 2] = flipU ? 1 - u : u;
    uv[i * 2 + 1] = (p[va] - min[va]) / (size[va] || 1);
  }
  geometry.setAttribute(name, new BufferAttribute(uv, 2));
}
