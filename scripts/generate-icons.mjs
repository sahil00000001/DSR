/**
 * Generates the PWA icon set.
 *
 * Android's install prompt requires PNG icons at 192px and 512px — an SVG alone
 * isn't enough — so rather than add an image-processing dependency (sharp is a
 * ~30 MB native build) this writes the PNGs directly. A PNG is a signature plus
 * three chunks, and Node's zlib does the compression.
 *
 * The mark matches `CadenceMark` in src/components/layout/brand.tsx: an indigo
 * rounded square with three ascending bars — the "rhythm" of a team reporting day
 * after day.
 *
 * Run: node scripts/generate-icons.mjs
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

// --- PNG encoding -----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/** `pixels` is RGBA, 4 bytes per pixel, row-major. */
function encodePng(width, height, pixels) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with its filter type; 0 = none.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- Drawing ----------------------------------------------------------------

const ACCENT = [79, 70, 229]; // #4f46e5 — matches --accent in light mode
const WHITE = [255, 255, 255];

/**
 * Signed distance to a rounded rectangle, used for anti-aliasing. Sampling the
 * distance rather than testing inside/outside is what keeps the corners smooth at
 * 192px instead of visibly stepped.
 */
function roundedRectDistance(x, y, cx, cy, halfW, halfH, radius) {
  const dx = Math.abs(x - cx) - (halfW - radius);
  const dy = Math.abs(y - cy) - (halfH - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

function drawIcon(size, { maskable = false } = {}) {
  const pixels = Buffer.alloc(size * size * 4);

  // A maskable icon must keep its content inside the safe zone (the middle 80%),
  // because the platform may crop it to a circle or squircle.
  const inset = maskable ? size * 0.1 : 0;
  const tileSize = size - inset * 2;
  const centre = size / 2;
  const tileHalf = tileSize / 2;
  const tileRadius = tileSize * (maskable ? 0.5 : 0.22);

  // Three ascending bars, proportional to the tile.
  const barWidth = tileSize * 0.1;
  const barRadius = barWidth / 2;
  const gap = tileSize * 0.19;
  const baseline = centre + tileSize * 0.26;
  const heights = [tileSize * 0.2, tileSize * 0.36, tileSize * 0.52];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;

      const tileDistance = roundedRectDistance(px, py, centre, centre, tileHalf, tileHalf, tileRadius);
      // Smooth 1px band across the edge.
      const tileAlpha = Math.max(0, Math.min(1, 0.5 - tileDistance));

      let colour = ACCENT;
      let alpha = tileAlpha;

      if (tileAlpha > 0) {
        for (let index = 0; index < heights.length; index += 1) {
          const barHeight = heights[index];
          const barCentreX = centre + (index - 1) * gap;
          const barCentreY = baseline - barHeight / 2;

          const barDistance = roundedRectDistance(
            px,
            py,
            barCentreX,
            barCentreY,
            barWidth / 2,
            barHeight / 2,
            barRadius,
          );
          const barAlpha = Math.max(0, Math.min(1, 0.5 - barDistance));

          if (barAlpha > 0) {
            // Composite the white bar over the accent tile.
            const blend = barAlpha * tileAlpha;
            colour = [
              Math.round(ACCENT[0] * (1 - blend) + WHITE[0] * blend),
              Math.round(ACCENT[1] * (1 - blend) + WHITE[1] * blend),
              Math.round(ACCENT[2] * (1 - blend) + WHITE[2] * blend),
            ];
            alpha = Math.max(alpha, blend);
          }
        }
      }

      const offset = (y * size + x) * 4;
      pixels[offset] = colour[0];
      pixels[offset + 1] = colour[1];
      pixels[offset + 2] = colour[2];
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }

  return encodePng(size, size, pixels);
}

// --- SVG (crisp at any size, used as the browser favicon) -------------------

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <rect width="32" height="32" rx="7" fill="#4f46e5"/>
  <g stroke="#fff" stroke-width="2.6" stroke-linecap="round">
    <path d="M10 21v-3"/>
    <path d="M16 21v-8"/>
    <path d="M22 21V9"/>
  </g>
</svg>
`;

// --- Write ------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });

const outputs = [
  ["icon-192.png", drawIcon(192)],
  ["icon-512.png", drawIcon(512)],
  ["icon-maskable-192.png", drawIcon(192, { maskable: true })],
  ["icon-maskable-512.png", drawIcon(512, { maskable: true })],
  ["apple-touch-icon.png", drawIcon(180)],
  ["icon.svg", Buffer.from(SVG, "utf8")],
];

for (const [name, data] of outputs) {
  writeFileSync(join(OUT_DIR, name), data);
  console.log(`  ${name.padEnd(28)} ${(data.length / 1024).toFixed(1)} KB`);
}

console.log(`\n✓ Wrote ${outputs.length} icons to public/icons`);
