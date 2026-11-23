// downloads the poly haven list (assets/polyhaven.json) and the OFL fonts blender needs into
// assets-src/ (git ignored), checks md5s, and logs every asset in assets/manifest.json + CREDITS.md.
// safe to re-run, files with a matching md5 get skipped. usage: pnpm assets:fetch [--only id,id]
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const UA = "ayaan-case-file-portfolio/1.0 (ayaan.i.bagawan@gmail.com)";
const API = "https://api.polyhaven.com";
const OUT = "assets-src";
const list = JSON.parse(readFileSync("assets/polyhaven.json", "utf8"));
const res = list.resolution;
const only = process.argv.includes("--only")
  ? new Set(process.argv[process.argv.indexOf("--only") + 1].split(","))
  : null;

// fonts for text in the scene (door lettering, neon sign, typed labels), all OFL/Apache
const fonts = [
  {
    id: "font-file-noto-sans-kannada",
    file: "NotoSansKannada.ttf",
    url: "https://github.com/google/fonts/raw/main/ofl/notosanskannada/NotoSansKannada%5Bwdth%2Cwght%5D.ttf",
    author: "Google",
    licence: "OFL-1.1",
    usedIn: "office: Kannada neon sign",
  },
  {
    id: "font-file-playfair-display",
    file: "PlayfairDisplay.ttf",
    url: "https://github.com/google/fonts/raw/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf",
    author: "Claus Eggers Sørensen",
    licence: "OFL-1.1",
    usedIn: "corridor: gold-leaf door lettering",
  },
  {
    id: "font-file-special-elite",
    file: "SpecialElite-Regular.ttf",
    url: "https://github.com/google/fonts/raw/main/apache/specialelite/SpecialElite-Regular.ttf",
    author: "Astigmatic",
    licence: "Apache-2.0",
    usedIn: "office: typed labels on the case folder and props",
  },
  {
    id: "font-file-caveat",
    file: "Caveat.ttf",
    url: "https://github.com/google/fonts/raw/main/ofl/caveat/Caveat%5Bwght%5D.ttf",
    author: "Impallari Type",
    licence: "OFL-1.1",
    usedIn: "office: handwritten notes",
  },
];

const md5 = (buf) => createHash("md5").update(buf).digest("hex");

async function get(url, as = "json") {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return as === "json" ? r.json() : Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

async function download(url, dest, expectedMd5) {
  if (existsSync(dest) && (!expectedMd5 || md5(readFileSync(dest)) === expectedMd5)) return 0;
  const buf = await get(url, "buffer");
  if (expectedMd5 && md5(buf) !== expectedMd5) throw new Error(`md5 mismatch: ${url}`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  return buf.length;
}

// small worker pool so we don't hammer their CDN
async function pool(items, size, fn) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length) await fn(queue.shift());
    }),
  );
}

const manifest = JSON.parse(readFileSync("assets/manifest.json", "utf8"));
const upsert = (record) => {
  const i = manifest.assets.findIndex((a) => a.id === record.id);
  if (i >= 0) manifest.assets[i] = { ...manifest.assets[i], ...record };
  else manifest.assets.push(record);
};

const jobs = [
  ...Object.entries(list.models).map(([id, usedIn]) => ({ id, kind: "model", usedIn })),
  ...Object.entries(list.textures).map(([id, usedIn]) => ({ id, kind: "texture", usedIn })),
  ...Object.entries(list.hdris).map(([id, usedIn]) => ({ id, kind: "hdri", usedIn })),
].filter((j) => !only || only.has(j.id));

let bytes = 0;
await pool(jobs, 4, async ({ id, kind, usedIn }) => {
  const [info, files] = await Promise.all([get(`${API}/info/${id}`), get(`${API}/files/${id}`)]);
  const dir = join(OUT, "polyhaven", `${kind}s`, id);
  if (kind === "hdri") {
    const f = files.hdri[res].hdr;
    bytes += await download(f.url, join(dir, `${id}_${res}.hdr`), f.md5);
  } else {
    const blend = files.blend[res].blend;
    bytes += await download(blend.url, join(dir, `${id}_${res}.blend`), blend.md5);
    for (const [rel, f] of Object.entries(blend.include ?? {})) {
      bytes += await download(f.url, join(dir, rel), f.md5);
    }
  }
  upsert({
    id: `polyhaven-${id}`,
    kind,
    source: "Poly Haven",
    url: `https://polyhaven.com/a/${id}`,
    name: info.name,
    author: Object.keys(info.authors ?? {}).join(", "),
    licence: "CC0-1.0",
    resolution: res,
    usedIn: [usedIn],
  });
  console.log(`ok  ${kind.padEnd(7)} ${id}`);
});

if (!only) {
  await pool(fonts, 4, async (f) => {
    bytes += await download(f.url, join(OUT, "fonts", f.file));
    upsert({
      id: f.id,
      kind: "font",
      source: "Google Fonts (github.com/google/fonts)",
      url: f.url,
      author: f.author,
      licence: f.licence,
      usedIn: [f.usedIn],
    });
    console.log(`ok  font    ${f.file}`);
  });
}

// night sky through the office window (1K is plenty, the rain blurs it anyway).
// sky.py turns it into public/hdri/city_night_sky.ktx2
for (const id of ["modern_buildings_night"]) {
  if (only && !only.has(id)) continue;
  const files = await get(`${API}/files/${id}`);
  const f = files.hdri["1k"].hdr;
  bytes += await download(f.url, join("assets-src", "hdri", `${id}_1k.hdr`), f.md5);
  console.log(`ok  sky     assets-src/hdri/${id}_1k.hdr`);
}

manifest.assets.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync("assets/manifest.json", JSON.stringify(manifest, null, 2) + "\n");

// rebuild the poly haven table in CREDITS.md from the manifest
const ph = manifest.assets.filter((a) => a.source === "Poly Haven");
const table = [
  "| Asset | Type | Author(s) | Licence | Used for |",
  "|---|---|---|---|---|",
  ...ph.map(
    (a) => `| [${a.name}](${a.url}) | ${a.kind} | ${a.author} | CC0 | ${a.usedIn.join("; ")} |`,
  ),
].join("\n");
const credits = readFileSync("CREDITS.md", "utf8");
const start = "<!-- polyhaven:start -->";
const end = "<!-- polyhaven:end -->";
const block = `${start}\n${table}\n${end}`;
const next = credits.includes(start)
  ? credits.replace(new RegExp(`${start}[\\s\\S]*?${end}`), block)
  : credits.replace("_None yet (Phase 2)._", block);
writeFileSync("CREDITS.md", next);

console.log(`Done. Downloaded ${(bytes / 1024 / 1024).toFixed(1)} MB.`);
