// lighthouse on the static export (mobile + desktop), fails if any score is under 95.
// usage: pnpm build && pnpm lighthouse [path]   (default /resume/)
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";

const PORT = 4174;
const path = process.argv[2] ?? "/resume/";
const url = `http://localhost:${PORT}${path}`;
const MIN = 95;

const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 800));

const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless=new"] });
mkdirSync(".lighthouse", { recursive: true });
let failed = false;
const rows = [];

try {
  for (const [name, config] of [
    ["mobile", undefined],
    ["desktop", desktopConfig],
  ]) {
    const result = await lighthouse(url, { port: chrome.port, output: "html" }, config);
    const slug = path.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home";
    writeFileSync(`.lighthouse/${slug}-${name}.html`, result.report);
    const row = { form: name };
    for (const [id, cat] of Object.entries(result.lhr.categories)) {
      const score = Math.round((cat.score ?? 0) * 100);
      row[id] = score;
      if (score < MIN) failed = true;
    }
    const audits = result.lhr.audits;
    row.FCP = audits["first-contentful-paint"].displayValue;
    row.LCP = audits["largest-contentful-paint"].displayValue;
    row.TBT = audits["total-blocking-time"].displayValue;
    row.CLS = audits["cumulative-layout-shift"].displayValue;
    rows.push(row);
  }
} finally {
  await chrome.kill();
  server.kill();
}

console.table(rows);
console.log("Reports in .lighthouse/");
if (failed) {
  console.error(`A Lighthouse category scored below ${MIN}.`);
  process.exit(1);
}
