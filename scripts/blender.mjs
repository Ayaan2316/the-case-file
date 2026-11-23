// runs a blender script headless: `pnpm blender build_scene.py -- office`
// blender isn't on my PATH so it comes from BLENDER_BIN or the default install folder
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

function envLocal(key) {
  if (!existsSync(".env.local")) return undefined;
  const line = readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${key}=`));
  return line
    ?.slice(key.length + 1)
    .trim()
    .replace(/^"|"$/g, "");
}

const candidates = [
  process.env.BLENDER_BIN,
  envLocal("BLENDER_BIN"),
  "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe",
  "/Applications/Blender.app/Contents/MacOS/Blender",
  "/usr/bin/blender",
].filter(Boolean);
const bin = candidates.find((c) => existsSync(c));
if (!bin) {
  console.error("Blender not found. Set BLENDER_BIN in .env.local.");
  process.exit(1);
}

const [script, ...rest] = process.argv.slice(2);
if (!script) {
  console.error("Usage: pnpm blender <script.py> [-- args]");
  process.exit(1);
}
const scriptPath = isAbsolute(script) ? script : resolve(join("blender", script));
// pnpm sometimes eats the `--`, blender needs it or it reads script args as .blend files
const scriptArgs = rest[0] === "--" ? rest : rest.length ? ["--", ...rest] : [];
// --factory-startup ignores user addons/prefs, so scripts have to pick the cycles device themselves
const args = ["-b", "--factory-startup", "-P", scriptPath, ...scriptArgs];

const child = spawn(bin, args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
