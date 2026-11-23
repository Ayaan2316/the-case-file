// per draw GPU time (EXT_disjoint_timer_query_webgl2) on the iGPU - which objects and post passes
// cost what at a scroll position. usage: node gpuprof.mjs <query> <p,p,...>
import { chromium, devices } from "@playwright/test";

const query = process.argv[2] ?? "tier=medium&scale=1";
const points = (process.argv[3] ?? "0.12,0.30,0.33,0.92").split(",").map(Number);
// optional viewport, e.g. 412x839 for a phone in portrait (css px)
const [vw, vh] = (process.argv[4] ?? "1536x864").split("x").map(Number);

const probe = await chromium.launch({ channel: "chrome", headless: false });
const pg = await probe.newPage();
await pg.goto("chrome://gpu");
await pg.waitForTimeout(2000);
const text = await pg.evaluate(() => (document.querySelector("info-view")?.shadowRoot ?? document).textContent ?? "");
await probe.close();
const m = text.match(/VENDOR= 0x8086[^\n]*?LUID=\{(\d+),(\d+)\}/);
const browser = await chromium.launch({
  channel: "chrome",
  headless: false,
  args: [
    "--window-position=0,0",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    `--use-adapter-luid=${m[1]},${m[2]}`,
  ],
});
// "phone" as a 5th arg: pixel 7 touch screen, mobile browser and screen density (the site's phone
// path - PHONE_DPR, no magnifier, no depth pre-pass) at the given viewport
const phone = process.argv[5] === "phone";
const page = phone
  ? await (await browser.newContext({ ...devices["Pixel 7"], viewport: { width: vw, height: vh } })).newPage()
  : await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1.25 });
page.on("pageerror", (e) => console.error("pageerror:", e.message));
await page.goto(`http://localhost:4173/?${query}`);
await page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 120_000 });

const ok = await page.evaluate(() => {
  const canvas = document.querySelector("canvas.experience-canvas") ?? document.querySelector("canvas");
  const gl = canvas.getContext("webgl2");
  const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  if (!ext) return false;
  const scene = window.__caseFile.scene;
  let mesh;
  scene.traverse((o) => (mesh ??= o.isMesh ? o : undefined));
  const O3D = Object.getPrototypeOf(Object.getPrototypeOf(mesh));
  const pending = [];
  const totals = new Map();
  let active = null;
  let recording = false;
  const free = [];
  const label = (o) => {
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    // post passes draw one fullscreen triangle, name them by their material class
    return o.name || mat?.name || (mat?.type === "ShaderMaterial" && mat.constructor?.name !== "ShaderMaterial" ? mat.constructor.name : mat?.type) || o.type;
  };
  const before = O3D.onBeforeRender;
  const after = O3D.onAfterRender;
  O3D.onBeforeRender = function (...a) {
    // a scene's own hook would wrap everything up to its first draw, so time the draws instead
    if (recording && !active && !this.isScene) {
      const q = free.pop() ?? gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      active = { q, key: label(this) };
    }
    return before.apply(this, a);
  };
  O3D.onAfterRender = function (...a) {
    if (active) {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(active);
      active = null;
    }
    return after.apply(this, a);
  };
  // shadow passes don't call onBeforeRender, time them through the shadow hooks
  const beforeShadow = O3D.onBeforeShadow;
  const afterShadow = O3D.onAfterShadow;
  O3D.onBeforeShadow = function (...a) {
    if (recording && !active) {
      const q = free.pop() ?? gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      active = { q, key: "shadow: " + label(this) };
    }
    return beforeShadow.apply(this, a);
  };
  O3D.onAfterShadow = function (...a) {
    if (active) {
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(active);
      active = null;
    }
    return afterShadow.apply(this, a);
  };
  let frames = 0;
  const poll = () => {
    while (pending.length && gl.getQueryParameter(pending[0].q, gl.QUERY_RESULT_AVAILABLE)) {
      const { q, key } = pending.shift();
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) totals.set(key, (totals.get(key) ?? 0) + gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      free.push(q);
    }
    if (recording) frames++;
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
  window.__gpu = {
    start() {
      totals.clear();
      frames = 0;
      recording = true;
    },
    stop() {
      recording = false;
      return { frames, rows: [...totals].map(([k, v]) => [k, v / Math.max(frames, 1)]).sort((a, b) => b[1] - a[1]) };
    },
  };
  return true;
});
if (!ok) {
  console.log("no EXT_disjoint_timer_query_webgl2");
  process.exit(1);
}
for (const p of points) {
  await page.evaluate((v) => window.__caseFile.scrollTo(v), p);
  const probeKey = p >= 0.665 ? "interroProbe" : p >= 0.58 ? "evidenceProbe" : "";
  if (probeKey) await page.waitForFunction((k) => window.__caseFile.store.getState()[k] === true, probeKey, { timeout: 60_000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__gpu.start());
  await page.waitForTimeout(3000);
  const { frames, rows } = await page.evaluate(() => window.__gpu.stop());
  const total = rows.reduce((a, r) => a + r[1], 0);
  console.log(`p${p}: ${frames} frames, timed GPU ${total.toFixed(2)} ms/frame`);
  for (const [k, v] of rows.slice(0, 18)) console.log(`   ${v.toFixed(2).padStart(6)}  ${k}`);
}
await browser.close();
