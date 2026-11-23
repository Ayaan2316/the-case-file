/**
 * lite file or 3D? phones, older computers and browsers that can't handle it get the lite file
 * (components/lite) - the case on paper, plain html, loads fast and never downloads the 3D.
 * laptops that can run medium or ultra get the 3D. MODE_SCRIPT runs inline at the top of
 * app/page.tsx's body and decides before anything paints, so nothing flashes. no JS = lite file
 * (.lite-only / .three-only in globals.css)
 *
 * `?3d`, a pinned `?tier=` or "Open the 3D case file" force the 3D for the rest of the visit
 * (sessionStorage). `?gpu=` fakes the gpu name for testing
 */

/** software rendering (SwiftShader, llvmpipe, Microsoft Basic Render Driver) */
export const SOFTWARE_GPU = /SwiftShader|llvmpipe|softpipe|Basic Render|Software/i;

/**
 * laptop gpus too old for medium: intel HD/UHD (most cheap laptops before Iris Xe, about a tenth of
 * an Arc iGPU's fill rate) and Iris Plus/Pro, AMD HD + R-series APUs, NVIDIA 2010s laptop chips
 * (GeForce 7xxM-9xxM, 9xxMX, MX100-300). if they force the 3D they start on low (guessTier)
 */
export const OLD_GPU = [
  /Intel.*\bU?HD Graphics|Iris\S* (Plus|Pro)/i,
  /Radeon\S* (HD|R[2-7])\b/i,
  /GeForce (GT |GTX )?\d{3}MX?\b|GeForce MX[1-3]\d{2}\b/i,
];

/** sessionStorage key for "visitor asked for 3D" (force3d in quality.ts) */
export const FORCE_3D = "case-file:3d";

/** why the lite file is showing (`data-lite` on <html>, picks which note to show) */
export type LiteReason = "phone" | "old" | "software" | "none" | "slow" | "lost";

declare global {
  interface Window {
    /** gpu name the mode script found, so quality.ts doesn't have to ask again */
    __gpu?: { name: string; support: "ok" | "software" | "none" };
  }
}

/**
 * runs inline before first paint. it's sent as its own source text so it can't use anything from
 * outside (patterns come in as args) and has to be syntax old phones can parse. if it throws
 * the page just stays on the lite file. phones skip the gpu probe completely
 */
function decide(soft: string, old: string[], key: string) {
  const root = document.documentElement;
  const search = new URLSearchParams(location.search);
  let forced = search.has("3d") || search.has("tier");
  try {
    if (forced) sessionStorage.setItem(key, "1");
    else forced = sessionStorage.getItem(key) === "1";
  } catch {
    // storage blocked, choice only lasts for this page
  }
  if (search.has("3d")) {
    search.delete("3d");
    const rest = search.toString();
    history.replaceState(history.state, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
  }
  let reason = "";
  const phone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || matchMedia("(pointer: coarse)").matches;
  if (phone && !forced) reason = "phone";
  else {
    let name = "";
    let support: "ok" | "software" | "none" = "none";
    try {
      let gl = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
      if (gl) {
        support = "ok";
        const info = gl.getExtension("WEBGL_debug_renderer_info");
        if (info) name = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
      } else {
        gl = document.createElement("canvas").getContext("webgl2");
        if (gl) support = "software";
      }
      const lose = gl && gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    } catch {
      support = "none";
    }
    const fake = search.get("gpu");
    if (fake !== null) name = fake;
    if (support === "ok" && new RegExp(soft, "i").test(name)) support = "software";
    window.__gpu = { name: name, support: support };
    if (support === "none") reason = "none";
    else if (!forced && support === "software") reason = "software";
    else if (
      !forced &&
      old.some(function (r) {
        return new RegExp(r, "i").test(name);
      })
    )
      reason = "old";
  }
  root.setAttribute("data-mode", reason ? "lite" : "3d");
  if (reason) root.setAttribute("data-lite", reason);
}

/** the inline script for app/page.tsx */
export const MODE_SCRIPT = `(${decide.toString()})(${JSON.stringify(SOFTWARE_GPU.source)},${JSON.stringify(
  OLD_GPU.map((r) => r.source),
)},${JSON.stringify(FORCE_3D)})`;

/** 3D bailed mid visit (too slow, driver lost it, no webgl2 after all) -> lite file */
export function toLite(reason: LiteReason) {
  const root = document.documentElement;
  root.setAttribute("data-mode", "lite");
  root.setAttribute("data-lite", reason);
  window.dispatchEvent(new Event("case:lite"));
}

/** is the 3D showing? (ThreeGate) */
export const isThree = () => typeof document !== "undefined" && document.documentElement.getAttribute("data-mode") === "3d";
