// my project photos for the web. originals stay in assets-src/photos (git ignored, private), the
// exhibits get webp copies in public/photos. a polaroid only shows the centre square so each hero
// shot gets cropped here to frame the build, gallery shots keep the whole frame.
// exhibit C's polaroid is a render of the office itself (screenshots/blender). usage: pnpm photos
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

/** [source, output, crop [x, y, size] in source px or null for the whole frame] */
const PHOTOS = [
  // bumblebee (the aluminium bot closest to the camera) lining up on the ball at CELESTAI'26
  ["assets-src/photos/bumblebee/1-match.webp", "public/photos/bumblebee.webp", [190, 495, 820]],
  ["assets-src/photos/bumblebee/2-electronics.webp", "public/photos/bumblebee-2.webp", null],
  ["assets-src/photos/bumblebee/3-workbench.jpg", "public/photos/bumblebee-3.webp", null],
  // desk pet breadboard at night with the screen on
  ["assets-src/photos/desk-pet/1-night.jpg", "public/photos/desk-pet.webp", [0, 380, 1200]],
  ["assets-src/photos/desk-pet/3-screen-on.jpg", "public/photos/desk-pet-2.webp", null],
  ["assets-src/photos/desk-pet/4-labels.jpg", "public/photos/desk-pet-3.webp", null],
  ["assets-src/photos/desk-pet/2-top.jpg", "public/photos/desk-pet-4.webp", null],
  // the case file: the office itself, as cycles rendered it
  ["screenshots/blender/office_establishing.png", "public/photos/case-file.webp", [420, 0, 1080]],
  // coco the desktop cat (art from the coco-desktop-pet project), on a soft rose card since her
  // renders have transparent backgrounds
  ["assets-src/photos/coco/1-basket.png", "public/photos/coco.webp", [0, 0, 1000], "#efe1df"],
  ["assets-src/photos/coco/2-hammock.jpg", "public/photos/coco-2.webp", null],
  ["assets-src/photos/coco/3-sprites.png", "public/photos/coco-3.webp", null, "#efe1df"],
];
/** `pnpm photos coco` only redoes outputs whose path has "coco" in it */
const only = process.argv[2];
/** longest side of a web copy (polaroid is 1200 square, the panel shows photos ~600px wide) */
const MAX = 1600;

const type = (p) => (p.endsWith(".png") ? "image/png" : p.endsWith(".webp") ? "image/webp" : "image/jpeg");
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
for (const [src, out, crop, bg] of PHOTOS) {
  if (only && !out.includes(only)) continue;
  const url = `data:${type(src)};base64,${readFileSync(src).toString("base64")}`;
  const webp = await page.evaluate(
    async ({ url, crop, max, bg }) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const [sx, sy, sw, sh] = crop ? [crop[0], crop[1], crop[2], crop[2]] : [0, 0, img.width, img.height];
      // squares come out at 1200 (polaroid texture), whole frames at most `max` on the long side
      const scale = crop ? 1200 / sw : Math.min(1, max / Math.max(sw, sh));
      const c = document.createElement("canvas");
      c.width = Math.round(sw * scale);
      c.height = Math.round(sh * scale);
      const g = c.getContext("2d");
      g.imageSmoothingQuality = "high";
      if (bg) {
        g.fillStyle = bg;
        g.fillRect(0, 0, c.width, c.height);
      }
      g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      return { data: c.toDataURL("image/webp", 0.86), w: c.width, h: c.height };
    },
    { url, crop, max: MAX, bg },
  );
  const buf = Buffer.from(webp.data.split(",")[1], "base64");
  writeFileSync(out, buf);
  console.log(`${out} ${webp.w}×${webp.h} ${Math.round(buf.length / 1024)} KB`);
}
await browser.close();
