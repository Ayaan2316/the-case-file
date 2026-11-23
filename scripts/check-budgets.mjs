// exits 1 if we go over budget. run after `pnpm build`.
// only checks static stuff (initial JS per route, 3D download sizes). fps and draw calls
// are runtime numbers so they're measured separately
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const OUT = "out";
const KB = 1024;
const MB = 1024 * 1024;

const budgets = {
  initialJsGzip: 250 * KB, // per route, excluding three.js chunks
  sceneAB: 18 * MB, // corridor + office GLB/KTX2/HDRI
  allScenes: 45 * MB,
};

// routes whose initial JS gets checked
const routes = ["index.html", "resume/index.html", "404.html"];

// asset folders and which scene each file belongs to (by filename prefix)
const assetDirs = ["public/models", "public/textures", "public/hdri"];
// corridor + office: their GLBs and lightmaps, the HDRI and scene.json
const sceneABPrefixes = ["corridor", "office", "scene.json"];
const sceneABDirs = ["public/hdri"];

if (!existsSync(OUT)) {
  console.error("No out/ folder. Run `pnpm build` first.");
  process.exit(1);
}

const fmt = (n) => (n >= MB ? `${(n / MB).toFixed(2)} MB` : `${(n / KB).toFixed(1)} KB`);
const isThreeChunk = (src) => /REVISION\s*=\s*"\d+"|three\.module|WebGLRenderer/.test(src);

let failed = false;
const rows = [];
const report = (name, value, limit) => {
  const ok = value <= limit;
  if (!ok) failed = true;
  rows.push({ budget: name, actual: fmt(value), limit: fmt(limit), status: ok ? "ok" : "OVER" });
};

for (const route of routes) {
  const htmlPath = join(OUT, route);
  if (!existsSync(htmlPath)) continue;
  const html = readFileSync(htmlPath, "utf8");
  // modern browsers skip `noModule` polyfills so they don't count
  const srcs = [...html.matchAll(/<script([^>]+)>/g)]
    .filter((m) => !/\bnoModule\b/i.test(m[1]))
    .map((m) => m[1].match(/src="([^"]+\.js)"/)?.[1])
    .filter(Boolean);
  let total = 0;
  for (const src of new Set(srcs)) {
    const file = join(OUT, src.replace(/^\//, ""));
    if (!existsSync(file)) continue;
    const code = readFileSync(file);
    if (isThreeChunk(code.toString("utf8"))) continue;
    total += gzipSync(code, { level: 9 }).length;
  }
  report(`Initial JS (gz) /${route.replace(/index\.html$/, "")}`, total, budgets.initialJsGzip);
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const all = assetDirs.flatMap(walk).filter((f) => !f.endsWith(".md"));
const size = (files) => files.reduce((sum, f) => sum + statSync(f).size, 0);
// two asset sets, full and `.low` (phones). a visitor only downloads one so check each on its own.
// low = its `.low` files plus anything without a low version (HDRI, scene.json)
const isLow = (f) => /\.low\.[^.]+$/.test(f);
const lowOf = (f) => f.replace(/(\.[^.]+)$/, ".low$1");
for (const [label, assets] of [
  ["", all.filter((f) => !isLow(f))],
  [" (phones)", all.filter((f) => isLow(f) || !all.includes(lowOf(f)))],
]) {
  const sceneAB = assets.filter(
    (f) =>
      sceneABDirs.some((d) => f.replaceAll("\\", "/").startsWith(d)) ||
      sceneABPrefixes.some((p) => relative("public", f).split(/[\\/]/).pop().startsWith(p)),
  );
  report(`Scene A+B assets${label}`, size(sceneAB), budgets.sceneAB);
  report(`All scene assets${label}`, size(assets), budgets.allScenes);
}

console.table(rows);
if (failed) {
  console.error("Budget check failed (spec §11).");
  process.exit(1);
}
console.log("All budgets OK.");
