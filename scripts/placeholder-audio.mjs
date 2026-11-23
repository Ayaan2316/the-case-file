// writes short silent .wav placeholders for every sound in lib/audio.ts until the real CC0
// recordings are in. never overwrites a real file
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const names = [...readFileSync("lib/audio.ts", "utf8").matchAll(/file: "([a-z-]+)"/g)].map((m) => m[1]);
mkdirSync("public/audio", { recursive: true });
const rate = 8000;
const samples = rate / 4;
const buf = Buffer.alloc(44 + samples * 2);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + samples * 2, 4);
buf.write("WAVEfmt ", 8);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(rate, 24);
buf.writeUInt32LE(rate * 2, 28);
buf.writeUInt16LE(2, 32);
buf.writeUInt16LE(16, 34);
buf.write("data", 36);
buf.writeUInt32LE(samples * 2, 40);
for (const n of names) {
  const out = `public/audio/${n}.wav`;
  if (!existsSync(out) && !existsSync(`public/audio/${n}.ogg`)) writeFileSync(out, buf);
}
console.log(`${names.length} placeholders checked`);
