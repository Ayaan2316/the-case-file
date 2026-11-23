// screenshots of the live site at given scroll positions with the real GPU (headed chrome).
// usage: node scripts/shots.mjs [--url http://localhost:3000] [--out screenshots/phase-3] [--gpu nvidia|intel]
//        [--p 0.04,0.12,0.20] [--tier ultra|medium|low] [--size 1280x720] [--fps]
//        [--cam establishing|desk|window|...]  (a cameras.py review shot, UI hidden)
//        [--settle 2500]  (ms to wait at each point before the shot and the fps window)
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const url = arg("--url", "http://localhost:3000");
const out = arg("--out", "screenshots/phase-3");
const points = arg("--p", "0.04,0.12,0.20").split(",").map(Number);
const tier = arg("--tier", "ultra");
const [w, h] = arg("--size", "1280x720").split("x").map(Number);
// my laptop runs windows at 125%, so --size 1536x864 --dpr 1.25 = a maximised chrome window
const dpr = Number(arg("--dpr", "1"));
const fps = process.argv.includes("--fps");
const cam = arg("--cam", "");
let extra = arg("--query", "");
if (cam) {
  // same numbers as the cycles stills, read the shot straight from cameras.py
  const m = readFileSync("blender/cameras.py", "utf8").match(
    new RegExp(String.raw`"${cam}": dict\(pos=\(([^)]*)\), target=\(([^)]*)\), fov=([\d.]+), focus=([\d.]+)`),
  );
  if (!m) throw new Error(`no camera "${cam}" in blender/cameras.py`);
  extra = [`cam=${[m[1], m[2], m[3], m[4]].join(",").replace(/\s/g, "")}`, extra].filter(Boolean).join("&");
}
mkdirSync(out, { recursive: true });

// laptops run chrome on the integrated GPU by default, --gpu nvidia forces the dedicated one
const gpu = arg("--gpu", "nvidia");
// windows can pin chrome to the dedicated GPU (settings > graphics > high performance) and then
// nothing brings the iGPU back except its adapter LUID (from chrome://gpu, changes every boot)
async function intelLuid() {
  const probe = await chromium.launch({ channel: "chrome", headless: false });
  const page = await probe.newPage();
  await page.goto("chrome://gpu");
  await page.waitForTimeout(2000);
  const text = await page.evaluate(() => (document.querySelector("info-view")?.shadowRoot ?? document).textContent ?? "");
  await probe.close();
  const m = text.match(/VENDOR= 0x8086[^\n]*?LUID=\{(\d+),(\d+)\}/);
  if (!m) throw new Error("no Intel adapter in chrome://gpu");
  return `${m[1]},${m[2]}`;
}
const luid = gpu === "intel" ? await intelLuid() : "";
const browser = await chromium.launch({
  channel: "chrome",
  headless: false,
  // covered/background windows stop compositing (css transitions freeze in the shots)
  args: [
    "--window-position=0,0",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    ...(gpu === "nvidia" ? ["--force_high_performance_gpu"] : [`--use-adapter-luid=${luid}`]),
  ],
});
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
page.on("pageerror", (e) => console.error("pageerror:", e.message));
// --tier auto: no pin, the site guesses the tier and the monitor can drop it like for a real visitor
const params = [tier === "auto" ? "" : `tier=${tier}`, extra].filter(Boolean).join("&");
await page.goto(`${url}/${params ? `?${params}` : ""}`, { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 120_000 });
const renderer = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const i = gl?.getExtension("WEBGL_debug_renderer_info");
  return i ? String(gl.getParameter(i.UNMASKED_RENDERER_WEBGL)).replace(/^ANGLE \(\w+, (.*?) \(0x.*/, "$1") : "?";
});
console.log(`renderer: ${renderer}`);
for (const p of points) {
  await page.evaluate((v) => window.__caseFile.scrollTo(v), p);
  // later rooms load lazily, wait until the one at `p` has loaded and captured its probe
  const probe = p >= 0.665 ? "interroProbe" : p >= 0.58 ? "evidenceProbe" : "";
  if (probe) await page.waitForFunction((k) => window.__caseFile.store.getState()[k] === true, probe, { timeout: 60_000 });
  // --settle <ms>: wait longer first (lets the render scale step down like for someone who stays on a view)
  await page.waitForTimeout(Number(arg("--settle", "2500")));
  const ev = arg("--event", "");
  if (ev) {
    await page.evaluate((e) => dispatchEvent(new Event(e)), ev);
    await page.waitForTimeout(Number(arg("--event-wait", "60")));
  }
  if (cam) await page.addStyleTag({ content: "body{visibility:hidden}canvas{visibility:visible}" });
  // let the compositor catch up (first frame after a big scroll jump can lag behind the DOM)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(300);
  const tag = cam ? `cam-${cam}` : `p${p.toFixed(2)}`;
  const rest = extra.replace(/(^|&)cam=[^&]*/, "");
  const file = `${out}/${tag}-${tier}${rest ? `-${rest.replace(/[^a-z0-9]+/gi, "")}` : ""}.png`;
  await page.screenshot({ path: file });
  let line = `shot ${file}`;
  if (fps) {
    const r = await page.evaluate(() => window.__caseFile.measure(4000));
    const { renderScale: scale, trim, tier: live } = await page.evaluate(() => window.__caseFile.store.getState());
    line += `  fps=${r.fps.toFixed(1)} p95frame=${r.p95.toFixed(1)}ms long=${(r.long * 100).toFixed(0)}% max=${r.max.toFixed(0)}ms drawCalls=${r.calls} (peak ${r.maxCalls}) sceneDraws=${r.sceneCalls} tris=${r.tris} scale=${scale} trim=${trim} tier=${live}`;
  }
  console.log(line);
}
await browser.close();
