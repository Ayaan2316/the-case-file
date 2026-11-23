// compresses the blender export (assets-src/export) into the runtime assets: dedup/prune/weld,
// error bounded simplify, texture resize, KTX2 (UASTC for normal maps, ETC1S for colour/ORM),
// meshopt geometry compression and UASTC KTX2 lightmaps. every model and lightmap also gets a
// `.low` version (half size textures) for phones. usage: pnpm assets:optimize
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";

const SRC = "assets-src/export";
const TMP = "assets-src/export/.tmp";
const MODELS = "public/models";
const LIGHTMAPS = "public/textures/lightmaps";

// KTX-Software isn't on my PATH, so point the child processes at it without touching the system PATH
const KTX_BIN = process.env.KTX_BIN ?? "C:\\Program Files\\KTX-Software\\bin";
const env = { ...process.env, PATH: [KTX_BIN, process.env.PATH].join(delimiter) };
const cli = ["node_modules/@gltf-transform/cli/bin/cli.js"];

function run(cmd, args) {
  const r = spawnSync(cmd, args, { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    throw new Error(`${cmd} ${args.join(" ")} failed`);
  }
  return r.stdout;
}

const gt = (...args) => run(process.execPath, [...cli, ...args]);
const mb = (f) => (statSync(f).size / 1e6).toFixed(2);

if (!existsSync(SRC)) {
  console.error("No assets-src/export. Run `pnpm blender bake.py` then `pnpm blender export.py`.");
  process.exit(1);
}
mkdirSync(TMP, { recursive: true });
// delete outputs from the old layout (per room static/dynamic split)
for (const f of readdirSync(MODELS).filter((f) => /_(static|dynamic).glb$/.test(f))) rmSync(join(MODELS, f));
mkdirSync(MODELS, { recursive: true });
mkdirSync(LIGHTMAPS, { recursive: true });

const NORMALS = "*{nor,normal}*";
// two sets: full, and `.low` for phones (low tier) with every texture cap halved
const VARIANTS = [
  { suffix: "", scale: 1 },
  { suffix: ".low", scale: 0.5 },
];
for (const file of readdirSync(SRC).filter((f) => f.endsWith(".glb"))) for (const { suffix, scale } of VARIANTS) {
  const name = file.replace(/\.glb$/, "");
  const px = (n) => String(Math.max(64, Math.round(n * scale)));
  const resize = (n, pattern) => ["resize", "--width", px(n), "--height", px(n), ...(pattern ? ["--pattern", pattern] : [])];
  const steps = [
    ["dedup"],
    // tiling surfaces keep their lightmap UV in TEXCOORD_1, which no gltf texture points to
    ["prune", "--keep-attributes", "true"],
    ["weld"],
    // error bound as a fraction of each mesh's radius. the joined room meshes are ~3.5m across so
    // 0.02% = 0.7mm, thin stuff (board yarn, glasses wire) survives
    ["simplify", "--ratio", "0.5", "--error", "0.0002", "--lock-border", "true"],
    // scanned poly haven pieces come with 2K maps, nothing in the room needs more than 1K except atlases
    resize(1024, "*_2k*"),
    resize(2048),
    // normal maps are the heaviest KTX2 data (UASTC): 1K for atlases, 512 for tiling surfaces
    resize(1024, NORMALS),
    resize(512, "tile_*{nor,normal}*"),
    // low frequency stuff (AO, roughness, metal) and things only ever seen small or far away
    resize(1024, "*_orm"),
    resize(256, "tile_office_{ceiling,plaster}_normal"),
    resize(256, "tile_facade_*"),
    resize(256, "{round_spectacles,retro_multimeter,magnifying_glass,wall_clock_glass,pocket_watch_glass,lightbulb_01}*"),
    ["uastc", "--pattern", NORMALS, "--level", "2", "--rdo", "--zstd", "18"],
    // ETC1S shares colour endpoints across channels so the AO contact shadows bleed into roughness in
    // 4x4 blocks, and a lamp reflected in the evidence room's steel table shows every single one.
    // the lazy rooms (not in the corridor + office budget) have big metal tables so their ORM gets UASTC
    ...(name === "evidence" || name === "interrogation"
      ? [["uastc", "--pattern", `${name === "evidence" ? "evidence" : "interro"}_props_orm*`, "--level", "2", "--zstd", "18"]]
      : []),
    ["etc1s", "--quality", "200"],
    ["meshopt", "--level", "medium"],
  ];
  let input = join(SRC, file);
  steps.forEach((step, i) => {
    const out = join(TMP, `${name}${suffix}.${i}.glb`);
    gt(step[0], input, out, ...step.slice(1));
    input = out;
  });
  const dest = join(MODELS, `${name}${suffix}.glb`);
  copyFileSync(input, dest);
  console.log(`model     ${`${name}${suffix}.glb`.padEnd(24)} ${mb(join(SRC, file))} MB -> ${mb(dest)} MB`);
}

/** width + height from a png's IHDR */
const pngSize = (path) => {
  const b = readFileSync(path);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

for (const file of readdirSync(join(SRC, "lightmaps")).filter((f) => f.endsWith(".png"))) {
  const out = join(LIGHTMAPS, file.replace(/\.png$/, ".ktx2"));
  // RGBM isn't colour data: linear transfer, keep alpha (the multiplier), UASTC for precision
  run("ktx", ["create", "--format", "R8G8B8A8_UNORM", "--assign-tf", "linear", "--encode", "uastc",
    "--uastc-quality", "2", "--uastc-rdo", "--uastc-rdo-l", "2.0", "--zstd", "18", "--generate-mipmap", join(SRC, "lightmaps", file), out]);
  console.log(`lightmap  ${file.padEnd(24)} ${mb(join(SRC, "lightmaps", file))} MB -> ${mb(out)} MB`);
  // half size for phones. averaging RGBM texels is what the GPU's own mip 1 does anyway
  const [w, h] = pngSize(join(SRC, "lightmaps", file));
  const low = out.replace(/\.ktx2$/, ".low.ktx2");
  run("toktx", ["--t2", "--target_type", "RGBA", "--assign_oetf", "linear", "--encode", "uastc", "--uastc_quality", "2",
    "--uastc_rdo_l", "2.0", "--zcmp", "18", "--genmipmap", "--resize", `${w >> 1}x${h >> 1}`, low, join(SRC, "lightmaps", file)]);
  console.log(`lightmap  ${file.replace(/\.png$/, ".low").padEnd(24)} -> ${mb(low)} MB`);
}

// night sky behind the window (sky.py), already sRGB, UASTC so the dark gradients don't band
const sky = join(SRC, "sky", "city_night_sky.png");
if (existsSync(sky)) {
  const out = "public/hdri/city_night_sky.ktx2";
  run("ktx", ["create", "--format", "R8G8B8_SRGB", "--assign-tf", "srgb", "--assign-primaries", "bt709",
    "--encode", "uastc", "--uastc-quality", "2", "--uastc-rdo", "--uastc-rdo-l", "2.0", "--zstd", "18", sky, out]);
  console.log(`sky       ${"city_night_sky.png".padEnd(24)} ${mb(sky)} MB -> ${mb(out)} MB`);
}

const scene = JSON.parse(readFileSync(join(SRC, "scene.json"), "utf8"));
copyFileSync(join(SRC, "scene.json"), join(MODELS, "scene.json"));
console.log(`scene.json: ${Object.keys(scene.groups).length} groups`);
rmSync(TMP, { recursive: true, force: true });
