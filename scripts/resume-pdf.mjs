// prints /resume (print stylesheet) to public/resume.pdf, a stand-in for when there's no real pdf.
// usage: pnpm build && pnpm resume:pdf && pnpm build   (second build shows the download link)
// public/resume.pdf is my actual resume now (LaTeX) so this won't overwrite it without --force
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { caseFile } from "../content/case.ts";

const target = `public${caseFile.subject.resumePdf}`;
// chrome's own prints say "Skia/PDF", anything else is a real resume
if (existsSync(target) && !readFileSync(target).includes("Skia/PDF") && !process.argv.includes("--force")) {
  console.error(`${target} is Ayaan's own résumé, not a print of /resume. Pass --force to replace it anyway.`);
  process.exit(1);
}

const PORT = 4175;
const server = spawn(process.execPath, ["scripts/serve.mjs"], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: "ignore",
});
await new Promise((r) => setTimeout(r, 800));

const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/resume/`, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => document.fonts.ready);
  const out = `public${caseFile.subject.resumePdf}`;
  await page.pdf({
    path: out,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    tagged: true,
    outline: true,
  });
  console.log(`Wrote ${out}`);
} finally {
  await browser.close();
  server.kill();
}
