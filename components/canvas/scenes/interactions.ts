import { Box3, type Object3D, type Vector3 } from "three";

// clickable props register here by mesh name pattern. CaseFile puts one handler on each GLB root and
// dispatches by the hit mesh's name (no re-parenting loaded objects). props merged into a static batch
// (fedora, ESP32 board) don't have their own mesh anymore so they're found by where the hit lands,
// inside the bounds they had before batching
type Handler = { pattern: RegExp; click: () => void };
const handlers: Handler[] = [];
const regions = new Map<string, Box3>();

export function registerClick(pattern: RegExp, click: () => void) {
  const h = { pattern, click };
  handlers.push(h);
  return () => {
    const i = handlers.indexOf(h);
    if (i >= 0) handlers.splice(i, 1);
  };
}

/** remember a piece's world bounds before batching merges it away (CaseFile) */
export function recordRegion(object: Object3D, margin = 0.01) {
  object.updateWorldMatrix(true, true);
  regions.set(object.name, new Box3().setFromObject(object).expandByScalar(margin));
}

export function handlerFor(name: string, point?: Vector3) {
  const byName = handlers.find((h) => h.pattern.test(name));
  if (byName || !point) return byName;
  for (const [region, box] of regions) {
    if (!box.containsPoint(point)) continue;
    const h = handlers.find((x) => x.pattern.test(region));
    if (h) return h;
  }
  return undefined;
}
