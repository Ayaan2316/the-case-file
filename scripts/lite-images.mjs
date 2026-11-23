// small copies of the photos for the lite file. a polaroid on the board is ~100px wide on a phone
// and thumbnails are smaller, no point downloading 1200-1600px originals. every photo in
// public/photos gets 240, 480 and 720px copies in public/photos/lite (never wider than the
// original). chrome encodes them like photos.mjs does. usage: pnpm lite:images
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

export const LITE_WIDTHS = [240, 480, 720];
const SRC = "public/photos";
const OUT = join(SRC, "lite");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
let total = 0;
for (const file of readdirSync(SRC).filter((f) => f.endsWith(".webp"))) {
  const url = `data:image/webp;base64,${readFileSync(join(SRC, file)).toString("base64")}`;
  const copies = await page.evaluate(
    async ({ url, widths }) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      return widths
        .filter((w) => w < img.width)
        .map((w) => {
          const c = document.createElement("canvas");
          c.width = w;
          c.height = Math.round((img.height * w) / img.width);
          const g = c.getContext("2d");
          g.imageSmoothingQuality = "high";
          g.drawImage(img, 0, 0, c.width, c.height);
          return { w, h: c.height, data: c.toDataURL("image/webp", 0.8) };
        });
    },
    { url, widths: LITE_WIDTHS },
  );
  for (const { w, h, data } of copies) {
    const out = join(OUT, file.replace(/\.webp$/, `-${w}.webp`));
    const buf = Buffer.from(data.split(",")[1], "base64");
    writeFileSync(out, buf);
    total += buf.length;
    console.log(`${out.padEnd(44)} ${w}×${h} ${Math.round(buf.length / 1024)} KB`);
  }
}
console.log(`total ${Math.round(total / 1024)} KB`);
await browser.close();
