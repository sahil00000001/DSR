/**
 * Generates the brand mark and the PWA icon set.
 *
 * Android's install prompt requires PNG icons at 192px and 512px — an SVG alone
 * isn't enough — so rather than add an image-processing dependency (sharp is a
 * ~30 MB native build) this writes the PNGs directly. A PNG is a signature plus
 * three chunks, and Node's zlib does the compression.
 *
 * ## The mark
 *
 * Pooja Machines builds sewing machines and fans, so the mark is a **three-blade
 * impeller**: a hub with three swept blades. It reads as a fan at a glance and as
 * rotating machinery generally, and — unlike a sewing-machine silhouette — it
 * survives being drawn at 16px in a browser tab.
 *
 * The blade geometry is defined once, here, and emitted as *both* the rasterised
 * PNGs and the SVG path used by `<PoojaMark>` in src/components/layout/brand.tsx.
 * Hand-copying a path is how a logo ends up subtly different in the tab and the
 * sidebar, so `--print-path` exists to regenerate it from this same source.
 *
 * Run: node scripts/generate-icons.mjs
 *      node scripts/generate-icons.mjs --print-path
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

// --- Blade geometry ---------------------------------------------------------

const ACCENT = [79, 70, 229]; // #4f46e5 — matches --accent in light mode
const WHITE = [255, 255, 255];

/**
 * Blade shape, in units of the tile's size so it scales exactly.
 *
 * `SWEEP` is what makes it read as *rotating* rather than as a flower: each blade's
 * centreline turns as it travels outward. Blades also flare towards the tip, the
 * way a real impeller does — constant-width blades look like a pinwheel.
 */
const BLADES = 3;
const R_ROOT = 0.05; // blade root radius
const R_TIP = 0.375; // blade tip radius
const R_HUB = 0.085; // solid centre hub
const SWEEP = 0.62; // radians the centreline turns from root to tip
const W_ROOT = 0.17; // half-width at the root, radians
const W_TIP = 0.42; // half-width at the tip, radians

const BASE_ANGLES = Array.from(
  { length: BLADES },
  (_, index) => -Math.PI / 2 + (index * 2 * Math.PI) / BLADES,
);

/** Half-width at normalised radius `t`, eased so the flare isn't linear. */
function halfWidth(t) {
  return W_ROOT + (W_TIP - W_ROOT) * Math.pow(t, 0.75);
}

/** Signed distance (in tile units) from a point to the nearest blade, or the hub. */
function markDistance(dx, dy) {
  const r = Math.hypot(dx, dy);
  if (r < 1e-6) return -R_HUB;

  let best = r - R_HUB; // the hub itself
  const theta = Math.atan2(dy, dx);

  for (const base of BASE_ANGLES) {
    // Where along the blade this radius sits.
    const t = Math.min(1, Math.max(0, (r - R_ROOT) / (R_TIP - R_ROOT)));
    const centreline = base + SWEEP * t;

    // Smallest signed angular gap, wrapped to (-π, π].
    const delta = Math.atan2(Math.sin(theta - centreline), Math.cos(theta - centreline));

    // Angular overshoot converted to arc length, so the edge gets a 1px-smooth
    // band at every radius rather than only near the tip.
    const angular = (Math.abs(delta) - halfWidth(t)) * r;
    const radial = Math.max(R_ROOT - r, r - R_TIP);

    best = Math.min(best, Math.max(angular, radial));
  }

  return best;
}

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

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;

      const tileDistance = roundedRectDistance(
        px,
        py,
        centre,
        centre,
        tileHalf,
        tileHalf,
        tileRadius,
      );
      // Smooth 1px band across the edge.
      const tileAlpha = Math.max(0, Math.min(1, 0.5 - tileDistance));

      let colour = ACCENT;
      let alpha = tileAlpha;

      if (tileAlpha > 0) {
        // Distance comes back in tile units; scale to pixels for the AA band.
        const mark = markDistance((px - centre) / tileSize, (py - centre) / tileSize) * tileSize;
        const markAlpha = Math.max(0, Math.min(1, 0.5 - mark));

        if (markAlpha > 0) {
          // Composite the white mark over the accent tile.
          const blend = markAlpha * tileAlpha;
          colour = [
            Math.round(ACCENT[0] * (1 - blend) + WHITE[0] * blend),
            Math.round(ACCENT[1] * (1 - blend) + WHITE[1] * blend),
            Math.round(ACCENT[2] * (1 - blend) + WHITE[2] * blend),
          ];
          alpha = Math.max(alpha, blend);
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

// --- SVG path, from the same geometry ---------------------------------------

const VIEWBOX = 32;
const CENTRE = VIEWBOX / 2;

/** Polar to viewBox coordinates. SVG's y grows downward, which is fine here. */
function point(radius, angle) {
  return [
    CENTRE + radius * VIEWBOX * Math.cos(angle),
    CENTRE + radius * VIEWBOX * Math.sin(angle),
  ];
}

const round = (value) => Math.round(value * 100) / 100;

/**
 * Fits one cubic Bézier to a parametric curve from its endpoint tangents.
 *
 * The Hermite form is exact for a cubic and stays within a hundredth of a unit over
 * these arcs — far below what a 32-unit viewBox can express — so each edge becomes
 * one `C` command instead of a sampled polyline.
 */
function cubicThrough(at) {
  const h = 1e-4;
  const p0 = at(0);
  const p1 = at(1);
  const near0 = at(h);
  const near1 = at(1 - h);

  const tangent0 = [(near0[0] - p0[0]) / h, (near0[1] - p0[1]) / h];
  const tangent1 = [(p1[0] - near1[0]) / h, (p1[1] - near1[1]) / h];

  const c1 = [p0[0] + tangent0[0] / 3, p0[1] + tangent0[1] / 3];
  const c2 = [p1[0] - tangent1[0] / 3, p1[1] - tangent1[1] / 3];

  return `C${round(c1[0])} ${round(c1[1])} ${round(c2[0])} ${round(c2[1])} ${round(p1[0])} ${round(p1[1])}`;
}

function bladePath(base) {
  const radiusAt = (t) => R_ROOT + t * (R_TIP - R_ROOT);
  const centreAt = (t) => base + SWEEP * t;

  const leading = (t) => point(radiusAt(t), centreAt(t) - halfWidth(t));
  const trailing = (t) => point(radiusAt(1 - t), centreAt(1 - t) + halfWidth(1 - t));
  // Across the tip, from the leading corner round to the trailing one.
  const tip = (t) => point(R_TIP, centreAt(1) - halfWidth(1) + t * 2 * halfWidth(1));

  const start = leading(0);

  return [
    `M${round(start[0])} ${round(start[1])}`,
    cubicThrough(leading),
    cubicThrough(tip),
    cubicThrough(trailing),
    "Z",
  ].join("");
}

const MARK_PATH = BASE_ANGLES.map(bladePath).join(" ");
const HUB_RADIUS = round(R_HUB * VIEWBOX);

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <rect width="32" height="32" rx="7" fill="#4f46e5"/>
  <g fill="#fff">
    <path d="${MARK_PATH}"/>
    <circle cx="${CENTRE}" cy="${CENTRE}" r="${HUB_RADIUS}"/>
  </g>
</svg>
`;

// --- Write ------------------------------------------------------------------

if (process.argv.includes("--print-path")) {
  console.log(`hub radius: ${HUB_RADIUS}\n`);
  console.log(MARK_PATH);
  process.exit(0);
}

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
