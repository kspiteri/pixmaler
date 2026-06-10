// Image pipeline: upload → pixelit (palette derived from the pixelated output) → targetGrid.

import { Pixelit } from "./vendor/pixelit";

export interface PipelineResult {
  gridW: number;
  gridH: number;
  palette: string[]; // hex colors
  targetGrid: number[]; // palette indices, length gridW*gridH
}

// Classic staples always appended to the palette.
const CLASSICS: [number, number, number][] = [
  [0, 0, 0],       // black
  [255, 255, 255],  // white
  [220, 50, 50],    // red
  [50, 180, 50],    // green
  [50, 100, 220],   // blue
  [230, 210, 50],   // yellow
];

export const DEFAULT_COLOR_COUNT = 16;
export const DEFAULT_SCALE = 8; // pixelit's default; range 0-50
export const MOBILE_WARN_GRID = 64; // warn if computed grid longest side exceeds this
export const SOURCE_MAX_SIDE = 768; // normalize uploads so the slider behaves consistently

// ── Colour math ───────────────────────────────────────────────────────────────

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function colorDist(a: [number, number, number], b: [number, number, number]): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
}

function nearestIndex(color: [number, number, number], palette: [number, number, number][]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = colorDist(color, palette[i]);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

// ── Median-cut quantisation (palette derivation) ──────────────────────────────

function medianCut(pixels: [number, number, number][], depth: number): [number, number, number][][] {
  if (depth === 0 || pixels.length === 0) return [pixels];

  let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
  for (const [r, g, b] of pixels) {
    if (r < minR) minR = r; if (r > maxR) maxR = r;
    if (g < minG) minG = g; if (g > maxG) maxG = g;
    if (b < minB) minB = b; if (b > maxB) maxB = b;
  }
  const rangeR = maxR - minR, rangeG = maxG - minG, rangeB = maxB - minB;
  const ch = rangeR >= rangeG && rangeR >= rangeB ? 0 : rangeG >= rangeB ? 1 : 2;

  pixels.sort((a, b) => a[ch] - b[ch]);
  const mid = pixels.length >> 1;
  return [
    ...medianCut(pixels.slice(0, mid), depth - 1),
    ...medianCut(pixels.slice(mid), depth - 1),
  ];
}

function derivePalette(pixels: [number, number, number][], colorCount: number): [number, number, number][] {
  const depth = Math.ceil(Math.log2(colorCount));
  const buckets = medianCut(pixels, depth);
  return buckets
    .filter(b => b.length > 0)
    .map(bucket => {
      const sum = bucket.reduce((acc, [r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b], [0, 0, 0]);
      return [
        Math.round(sum[0] / bucket.length),
        Math.round(sum[1] / bucket.length),
        Math.round(sum[2] / bucket.length),
      ] as [number, number, number];
    });
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function processImage(
  file: File,
  scale: number, // pixelit scale, 0-50; clamped if out of range
  colorCount: number,
): Promise<PipelineResult> {
  const bitmap = await createImageBitmap(file);

  // Normalize source so the slider behaves consistently regardless of upload size.
  // Only ever shrink — small uploads pass through untouched.
  const longest = Math.max(bitmap.width, bitmap.height);
  const shrinkFactor = longest > SOURCE_MAX_SIDE ? SOURCE_MAX_SIDE / longest : 1;
  const sourceW = Math.round(bitmap.width * shrinkFactor);
  const sourceH = Math.round(bitmap.height * shrinkFactor);

  // Source canvas at the (normalized) size — pixelit reads from this.
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = sourceW;
  sourceCanvas.height = sourceH;
  sourceCanvas.getContext("2d")!.drawImage(bitmap, 0, 0, sourceW, sourceH);
  bitmap.close();

  // ── Step 1: derive palette from a downscaled copy at pixelit's small-grid size.
  // Pixelit's small-grid is natW × scale*0.01. Source is normalized to ≤768px
  // (see SOURCE_MAX_SIDE) so pixelit's >900 halving branch never triggers — the
  // small-grid math is just scale × 0.01 of the source dimensions.
  const smallW = Math.max(1, Math.round(sourceCanvas.width * scale * 0.01));
  const smallH = Math.max(1, Math.round(sourceCanvas.height * scale * 0.01));

  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = smallW;
  sampleCanvas.height = smallH;
  sampleCanvas.getContext("2d")!.drawImage(sourceCanvas, 0, 0, smallW, smallH);
  const sampleData = sampleCanvas.getContext("2d")!.getImageData(0, 0, smallW, smallH).data;
  const samplePixels: [number, number, number][] = [];
  for (let i = 0; i < sampleData.length; i += 4) {
    samplePixels.push([sampleData[i], sampleData[i + 1], sampleData[i + 2]]);
  }
  const derived = derivePalette(samplePixels, colorCount);

  // ── Step 2: run pixelit using ONLY the derived palette.
  // Classics are added afterwards for the player's swatch but the target itself
  // only uses image-derived colours, so the rendered target is a faithful
  // limited-palette version of the image.
  const outCanvas = document.createElement("canvas");
  const px = new Pixelit({
    to: outCanvas,
    from: sourceCanvas,
    palette: derived,
    scale,
  });
  px.pixelate().convertPalette();

  // ── Step 3: read pixelit's output back as a gridW × gridH index array.
  // Grid dimensions match pixelit's small-grid (smallW × smallH).
  const gridW = smallW;
  const gridH = smallH;
  const outCtx = outCanvas.getContext("2d")!;
  const outData = outCtx.getImageData(0, 0, outCanvas.width, outCanvas.height).data;
  const blockW = outCanvas.width / gridW;
  const blockH = outCanvas.height / gridH;

  // Indices map into `derived` (which is the prefix of the wire palette below).
  const targetGrid: number[] = new Array(gridW * gridH);
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const sx = Math.min(outCanvas.width - 1, Math.floor((x + 0.5) * blockW));
      const sy = Math.min(outCanvas.height - 1, Math.floor((y + 0.5) * blockH));
      const i = (sy * outCanvas.width + sx) * 4;
      const rgb: [number, number, number] = [outData[i], outData[i + 1], outData[i + 2]];
      targetGrid[y * gridW + x] = nearestIndex(rgb, derived);
    }
  }

  // Build the wire palette: derived first (so targetGrid indices stay valid),
  // classics appended for the player's swatch only. Dedupe classics that are
  // close to a derived colour.
  const fullPalette: [number, number, number][] = [...derived];
  for (const classic of CLASSICS) {
    const tooClose = fullPalette.some(c => colorDist(c, classic) < 30 * 30);
    if (!tooClose) fullPalette.push(classic);
  }
  const palette = fullPalette.map(([r, g, b]) => rgbToHex(r, g, b));
  return { gridW, gridH, palette, targetGrid };
}

// ── Helpers for callers ───────────────────────────────────────────────────────

export function isMobileWarning(longestGridSide: number): boolean {
  return longestGridSide > MOBILE_WARN_GRID;
}

export { hexToRgb, rgbToHex };
