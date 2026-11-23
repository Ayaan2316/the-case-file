/** `?off=shadows,rain,shafts,dust,dof,bloom,flashlight,post,albedo,macro,grain,ca,shine,magnifier,ao,grade,lamp,env` turns features off for profiling */
export const OFF: ReadonlySet<string> = new Set(
  typeof location === "undefined" ? [] : (new URLSearchParams(location.search).get("off") ?? "").split(","),
);

/** `?scale=0.75` locks the render scale (for fps comparisons) */
export const SCALE = (() => {
  const v = typeof location === "undefined" ? NaN : Number(new URLSearchParams(location.search).get("scale") ?? NaN);
  return Number.isFinite(v) && v > 0 ? v : null;
})();

/**
 * `?cam=px,py,pz,tx,ty,tz,fov[,focus]` puts the camera on a blender review shot (blender Z-up,
 * metres, vertical fov) so I can compare 1:1 with the cycles renders
 */
export const CAM = (() => {
  const v = (typeof location === "undefined" ? null : new URLSearchParams(location.search).get("cam"))
    ?.split(",")
    .map(Number);
  if (!v || v.length < 7 || v.some(Number.isNaN)) return null;
  const toThree = (x: number, y: number, z: number) => [x, z, -y] as const;
  const position = toThree(v[0], v[1], v[2]);
  const target = toThree(v[3], v[4], v[5]);
  return { position, target, fov: v[6], focus: v[7] ?? Math.hypot(v[3] - v[0], v[4] - v[1], v[5] - v[2]) };
})();

/** `?aniso=4` overrides texture anisotropic filtering (profiling) */
export const ANISO = (() => {
  const v = typeof location === "undefined" ? NaN : Number(new URLSearchParams(location.search).get("aniso") ?? NaN);
  return Number.isFinite(v) && v >= 1 ? v : null;
})();
