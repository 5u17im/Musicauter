// Genera los iconos .ico de la barra de miniaturas de la barra de tareas.
// Se escriben en src-tauri/assets/ y se embeben con include_bytes!.
//
// Glifos: anterior, siguiente, reproducir y pausar (blancos, con antialias).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "src-tauri", "assets");

const SS = 4; // supermuestreo para antialias

/** Rellena un cuadrado con una prueba de pertenencia. */
function rect(x0, y0, x1, y1) {
  return (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1;
}

/** Triangulo con vertices (ax,ay),(bx,by),(cx,cy). */
function triangle(ax, ay, bx, by, cx, cy) {
  const sign = (px, py, qx, qy, rx, ry) =>
    (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  return (x, y) => {
    const d1 = sign(x, y, ax, ay, bx, by);
    const d2 = sign(x, y, bx, by, cx, cy);
    const d3 = sign(x, y, cx, cy, ax, ay);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
  };
}

function union(...tests) {
  return (x, y) => tests.some((test) => test(x, y));
}

const WHITE = [255, 255, 255];

const SHAPES = {
  prev: union(rect(0.2, 0.24, 0.31, 0.76), triangle(0.8, 0.22, 0.8, 0.78, 0.33, 0.5)),
  next: union(rect(0.69, 0.24, 0.8, 0.76), triangle(0.2, 0.22, 0.2, 0.78, 0.67, 0.5)),
  play: triangle(0.31, 0.2, 0.31, 0.8, 0.79, 0.5),
  pause: union(rect(0.3, 0.22, 0.44, 0.78), rect(0.56, 0.22, 0.7, 0.78)),
};

/** Dibuja un glifo en un buffer RGBA de size x size. */
function render(shape, size) {
  const rgba = Buffer.alloc(size * size * 4);
  const step = 1 / SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) * step) / size;
          const v = (y + (sy + 0.5) * step) / size;
          if (shape(u, v)) hits++;
        }
      }
      const alpha = Math.round((hits / (SS * SS)) * 255);
      const offset = (y * size + x) * 4;
      rgba[offset] = WHITE[0];
      rgba[offset + 1] = WHITE[1];
      rgba[offset + 2] = WHITE[2];
      rgba[offset + 3] = alpha;
    }
  }
  return rgba;
}

/** BITMAPINFOHEADER + mapa XOR (BGRA, de abajo arriba) + mascara AND. */
function bmpPayload(rgba, size) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // XOR + AND
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16); // BI_RGB
  header.writeUInt32LE(size * size * 4, 20);

  const xor = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const srcRow = size - 1 - y;
    for (let x = 0; x < size; x++) {
      const s = (srcRow * size + x) * 4;
      const d = (y * size + x) * 4;
      xor[d] = rgba[s + 2];
      xor[d + 1] = rgba[s + 1];
      xor[d + 2] = rgba[s];
      xor[d + 3] = rgba[s + 3];
    }
  }

  const rowBytes = Math.ceil(size / 8);
  const padding = (4 - (rowBytes % 4)) % 4;
  const mask = Buffer.alloc((rowBytes + padding) * size); // todo 0 => usa el alfa

  return Buffer.concat([header, xor, mask]);
}

function buildIco(shape) {
  const sizes = [16, 32];
  const images = sizes.map((size) => ({ size, payload: bmpPayload(render(shape, size), size) }));

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // tipo icono
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = 6 + directory.length;

  images.forEach((image, index) => {
    const base = index * 16;
    directory.writeUInt8(image.size, base);
    directory.writeUInt8(image.size, base + 1);
    directory.writeUInt8(0, base + 2);
    directory.writeUInt8(0, base + 3);
    directory.writeUInt16LE(1, base + 4);
    directory.writeUInt16LE(32, base + 6);
    directory.writeUInt32LE(image.payload.length, base + 8);
    directory.writeUInt32LE(offset, base + 12);
    offset += image.payload.length;
  });

  return Buffer.concat([header, directory, ...images.map((i) => i.payload)]);
}

mkdirSync(outDir, { recursive: true });
for (const [name, shape] of Object.entries(SHAPES)) {
  const file = join(outDir, `thumb_${name}.ico`);
  writeFileSync(file, buildIco(shape));
  console.log("escrito", file);
}
