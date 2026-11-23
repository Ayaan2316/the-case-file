import { readFileSync } from "node:fs";
import { join } from "node:path";

/** width/height of a webp in public/ at build time, so the lite file images don't jump while loading */
export function webpSize(src: string): { width: number; height: number } {
  const b = readFileSync(join(process.cwd(), "public", src));
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (chunk === "VP8L") {
    const n = b.readUInt32LE(21);
    return { width: (n & 0x3fff) + 1, height: ((n >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  throw new Error(`${src}: not a WebP`);
}

/** small copies from `pnpm lite:images` (public/photos/lite) */
export const LITE_WIDTHS = [240, 480, 720];

/** srcset - the small copies, then the original at its real width */
export function liteSrcSet(src: string) {
  const { width } = webpSize(src);
  const copies = LITE_WIDTHS.filter((w) => w < width).map((w) => `${src.replace(/^\/photos\//, "/photos/lite/").replace(/\.webp$/, `-${w}.webp`)} ${w}w`);
  return [...copies, `${src} ${width}w`].join(", ");
}
