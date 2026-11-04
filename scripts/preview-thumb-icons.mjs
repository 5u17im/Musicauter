// Utilidad de verificacion: imprime los iconos como ASCII desde su alfa.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "..", "src-tauri", "assets");
const LEVELS = " .:-=+*#%@";

for (const name of ["prev", "play", "pause", "next"]) {
  const ico = readFileSync(join(assets, `thumb_${name}.ico`));
  const count = ico.readUInt16LE(4);
  let offset = ico.readUInt32LE(6 + 12);
  const size = ico.readUInt8(6);
  // BITMAPINFOHEADER del unico (o primer) plano.
  const width = ico.readInt32LE(offset + 4);
  const height = ico.readInt32LE(offset + 8);
  const bitCount = ico.readUInt16LE(offset + 14);
  const xorOffset = offset + 40;
  const xorSize = width * Math.abs(height / 2) * 4;

  const alpha = [];
  let covered = 0;
  for (let y = 0; y < width; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      // El mapa XOR es BGRA y va de abajo arriba.
      const srcY = width - 1 - y;
      const a = ico[xorOffset + (srcY * width + x) * 4 + 3];
      if (a > 128) covered++;
      row.push(LEVELS[Math.min(LEVELS.length - 1, Math.round((a / 255) * (LEVELS.length - 1)))]);
    }
    alpha.push(row.join(""));
  }

  const total = width * width;
  console.log(`\n=== ${name}  (planos=${count}, ${width}x${width}, ${bitCount}bpp, xorBytes=${xorSize}) ===`);
  console.log(`cobertura solida: ${((covered / total) * 100).toFixed(1)}%`);
  console.log(alpha.join("\n"));
}
