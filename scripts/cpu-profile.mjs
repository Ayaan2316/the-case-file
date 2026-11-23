// CPU profile of a phone (pixel 7 emulation) with CPU throttling: self time per function per frame.
// budget phone cores are 5-7x slower than my laptop so the CPU sets the frame rate, not just the GPU.
// prod code is minified - three's internals keep their method names (upload, setValue,
// renderBufferDirect...), the rest shows up as file:line:col
// usage: node scripts/cpu-profile.mjs ["gpu=Mali-G57%20MC2"] [p] [throttle]
import { chromium, devices } from "@playwright/test";
const [query = "gpu=Mali-G57%20MC2", pos = "0.12", rate = "6"] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome", headless: false, args: ["--force_high_performance_gpu"] });
const ctx = await b.newContext({ ...devices["Pixel 7"] });
const p = await ctx.newPage();
await p.goto(`http://localhost:4173/?${query}`);
await p.waitForFunction(() => document.documentElement.dataset.ready === "true", null, { timeout: 200000 });
await p.evaluate((v) => window.__caseFile.scrollTo(v), Number(pos));
await p.waitForTimeout(2500);
const cdp = await ctx.newCDPSession(p);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: Number(rate) });
await p.waitForTimeout(1000);
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
await cdp.send("Profiler.start");
const m = await p.evaluate(() => window.__caseFile.measure(4000));
const { profile } = await cdp.send("Profiler.stop");
const dt = (profile.endTime - profile.startTime) / 1000 / profile.samples.length;
const self = new Map();
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const counts = new Map();
for (const s of profile.samples) counts.set(s, (counts.get(s) ?? 0) + 1);
for (const [id, c] of counts) {
  const n = byId.get(id);
  const f = n.callFrame;
  const file = f.url.split("/").pop() || f.url || "(native)";
  const key = `${f.functionName || "(anon)"} @ ${file}:${f.lineNumber}:${f.columnNumber}`;
  self.set(key, (self.get(key) ?? 0) + c * dt);
}
const total = [...self.values()].reduce((a, b) => a + b, 0);
const frames = m.fps * 4;
console.log(`p${pos} cpu x${rate}: ${m.fps.toFixed(1)} fps; sampled ${total.toFixed(0)} ms over ${frames.toFixed(0)} frames`);
for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 28)) console.log(`${(v / frames).toFixed(2).padStart(6)} ms/frame  ${k}`);
await b.close();
