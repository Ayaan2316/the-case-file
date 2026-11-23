// self host the basis transcoder (KTX2) so we never load decoders from a CDN
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public/basis", { recursive: true });
for (const f of ["basis_transcoder.js", "basis_transcoder.wasm"]) {
  copyFileSync(`node_modules/three/examples/jsm/libs/basis/${f}`, `public/basis/${f}`);
}
