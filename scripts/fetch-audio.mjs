// downloads the sounds in assets/audio.json (CC0 recordings from freesound, their HQ previews) into
// assets-src/audio/ (git ignored), checks each page still says CC0, logs every sound in
// assets/manifest.json + CREDITS.md. safe to re-run, existing files get skipped.
// usage: pnpm audio:fetch [--only slot,slot]  then  pnpm blender audio.py
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const UA = "Mozilla/5.0 (compatible; case-file-portfolio/1.0)";
const OUT = join("assets-src", "audio");
const CC0 = "creativecommons.org/publicdomain/zero/1.0";
const list = JSON.parse(readFileSync("assets/audio.json", "utf8")).sounds;
const only = process.argv.includes("--only") ? new Set(process.argv[process.argv.indexOf("--only") + 1].split(",")) : null;

async function get(url, as = "text") {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA } });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return as === "text" ? r.text() : Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

const manifest = JSON.parse(readFileSync("assets/manifest.json", "utf8"));
const upsert = (record) => {
  const i = manifest.assets.findIndex((a) => a.id === record.id);
  if (i >= 0) manifest.assets[i] = { ...manifest.assets[i], ...record };
  else manifest.assets.push(record);
};

mkdirSync(OUT, { recursive: true });
let bytes = 0;
for (const s of list) {
  if (only && !only.has(s.slot)) continue;
  const page = `https://freesound.org/people/${s.user}/sounds/${s.freesound}/`;
  const html = await get(page);
  // licence has to still be CC0 on the day we download it
  if (!html.includes(CC0)) throw new Error(`${s.slot}: ${page} is no longer CC0`);
  const preview = /(https:\/\/cdn\.freesound\.org\/previews\/[^"]+-hq\.mp3)/.exec(html)?.[1];
  if (!preview) throw new Error(`${s.slot}: no HQ preview on ${page}`);
  const dest = join(OUT, `${s.slot}.mp3`);
  if (!existsSync(dest)) {
    const buf = await get(preview, "buffer");
    writeFileSync(dest, buf);
    bytes += buf.length;
  }
  upsert({
    id: `freesound-${s.freesound}`,
    kind: "audio",
    source: "Freesound",
    url: page,
    name: s.title,
    author: s.user,
    licence: "CC0-1.0",
    file: `public/audio/${s.slot}.ogg`,
    usedIn: [s.usedIn],
  });
  console.log(`ok  ${s.slot.padEnd(16)} ${s.user} / ${s.title}`);
}

manifest.assets.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync("assets/manifest.json", JSON.stringify(manifest, null, 2) + "\n");

// rebuild the audio table in CREDITS.md from the manifest
const sounds = manifest.assets.filter((a) => a.kind === "audio");
const table = [
  "| Sound | File | Author | Licence | Used for |",
  "|---|---|---|---|---|",
  ...sounds.map((a) => `| [${a.name}](${a.url}) | \`${a.file.replace("public/", "")}\` | ${a.author} | CC0 | ${a.usedIn.join("; ")} |`),
].join("\n");
const credits = readFileSync("CREDITS.md", "utf8");
const start = "<!-- audio:start -->";
const end = "<!-- audio:end -->";
const block = `${start}\nCC0 recordings from [Freesound](https://freesound.org), cut and encoded by \`blender/audio.py\`.\n\n${table}\n${end}`;
const next = credits.includes(start)
  ? credits.replace(new RegExp(`${start}[\\s\\S]*?${end}`), block)
  : credits.replace("_None yet. See `public/audio/README.md` (Phase 3)._", block);
writeFileSync("CREDITS.md", next);

console.log(`Done. Downloaded ${(bytes / 1024 / 1024).toFixed(1)} MB.`);
