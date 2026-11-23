// generates the site's own images with the site fonts in system chrome:
//   app/favicon.ico (16/32/48) + app/apple-icon.png (180) from the wax seal in app/icon.svg
//   public/og.png (1200x630) - title over screenshots/blender/og_base.png (pnpm blender og_image.py)
//   public/images/stills/*.webp - stills for the no-webgl fallback, from the cycles renders
// fonts come from assets-src/fonts (pnpm assets:fetch). run with: pnpm brand
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { caseFile } from "../content/case.ts";

// inline as data urls, a page made with setContent can't load file:// stuff
const dataUrl = (path, type) => `data:${type};base64,${readFileSync(path).toString("base64")}`;
const font = (file) => dataUrl(resolve("assets-src/fonts", file), "font/ttf");
for (const f of ["PlayfairDisplay.ttf", "SpecialElite-Regular.ttf"]) {
  if (!existsSync(resolve("assets-src/fonts", f))) throw new Error(`assets-src/fonts/${f} missing: run pnpm assets:fetch`);
}
const FACES = `
  @font-face { font-family: "Playfair Display"; src: url("${font("PlayfairDisplay.ttf")}"); font-weight: 400 900; }
  @font-face { font-family: "Special Elite"; src: url("${font("SpecialElite-Regular.ttf")}"); }
  html, body { margin: 0; background: transparent; }`;

const browser = await chromium.launch({ channel: "chrome" });

// --- icons: the seal at each size (the svg draws its own AB in playfair)
const seal = readFileSync("app/icon.svg", "utf8");
const png = async (size) => {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<style>${FACES} svg { display: block; width: ${size}px; height: ${size}px; }</style>${seal}`);
  await page.evaluate(() => document.fonts.ready);
  const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
  return buf;
};
writeFileSync("app/apple-icon.png", await png(180));
// .ico with png entries (vista+ and every browser read these)
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(s, e);
  header.writeUInt8(s, e + 1);
  header.writeUInt16LE(1, e + 4); // planes
  header.writeUInt16LE(32, e + 6); // bits per pixel
  header.writeUInt32LE(images[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += images[i].length;
});
writeFileSync("app/favicon.ico", Buffer.concat([header, ...images]));
console.log("app/favicon.ico (16/32/48), app/apple-icon.png (180)");

// --- share image
const base = resolve("screenshots/blender/og_base.png");
if (!existsSync(base)) throw new Error("screenshots/blender/og_base.png missing: run pnpm blender og_image.py");
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(`<style>${FACES}
  .og { position: relative; width: 1200px; height: 630px; overflow: hidden; background: #0d0c0a url("${dataUrl(base, "image/png")}") center / cover; }
  /* The title sits on the dark side of the desk. */
  .og::before { content: ""; position: absolute; inset: 0;
    background: linear-gradient(90deg, rgb(8 7 6 / 0.94) 0%, rgb(8 7 6 / 0.82) 34%, rgb(8 7 6 / 0.25) 58%, transparent 72%); }
  .text { position: absolute; left: 72px; top: 0; bottom: 0; width: 560px; display: flex; flex-direction: column; justify-content: center; }
  .eyebrow { margin: 0; font: 22px "Special Elite"; letter-spacing: 0.18em; color: #c1272d; }
  h1 { margin: 18px 0 0; font: 900 76px/1.02 "Playfair Display"; color: #ede4d0; }
  .trade { margin: 22px 0 0; font: 25px/1.35 "Special Elite"; color: rgb(237 228 208 / 0.82); }
  .stamp { margin: 30px 0 0; align-self: flex-start; padding: 6px 14px 2px; border: 4px double #c1272d;
    font: 22px "Special Elite"; letter-spacing: 0.12em; color: #c1272d; transform: rotate(-4deg); }
  </style>
  <div class="og"><div class="text">
    <p class="eyebrow">${caseFile.hero.eyebrow}</p>
    <h1>${caseFile.hero.headline}</h1>
    <p class="trade">${caseFile.subject.trade}</p>
    <p class="stamp">THE CASE FILE</p>
  </div></div>`);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(200); // background image decode
await page.screenshot({ path: "public/og.png", clip: { x: 0, y: 0, width: 1200, height: 630 } });
console.log("public/og.png (1200×630)");

// --- no-webgl fallback stills: the cycles renders as 1600px webp. chrome's encoder keeps the
// colours (blender's save_render made them ~6 levels darker)
const STILLS = ["corridor_mid", "corridor_door", "office_establishing", "office_desk", "office_window", "evidence_wide", "interrogation_room"];
const enc = await browser.newPage();
for (const name of STILLS) {
  const src = resolve("screenshots/blender", `${name}.png`);
  if (!existsSync(src)) {
    console.warn(`skip ${name}: no screenshots/blender/${name}.png`);
    continue;
  }
  const webp = await enc.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 1600;
    c.height = Math.round((1600 * img.height) / img.width);
    const g = c.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/webp", 0.8);
  }, dataUrl(src, "image/png"));
  writeFileSync(`public/images/stills/${name}.webp`, Buffer.from(webp.split(",")[1], "base64"));
}
console.log(`public/images/stills: ${STILLS.length} WebP stills`);
await browser.close();
