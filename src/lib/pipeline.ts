// Image pipeline: upload → crop to ratio → downscale to the grid → palette → targetGrid.

import type { CropSelection, TargetRatioId } from './aspect'
import { cropRect, FULL_CROP, ratioBox } from './aspect'

export interface PipelineResult {
  gridW: number
  gridH: number
  palette: string[] // hex colours
  targetGrid: number[] // palette indices, length gridW*gridH
  // The normalised source dimensions the grid was derived from (≤ SOURCE_MAX_SIDE
  // on the longest side). Scale-independent, so a caller can feed them back into
  // `gridSizeFor` to preview the grid for *any* scale without reprocessing.
  sourceW: number
  sourceH: number
}

// What the picker was pointed at, emitted alongside the result. Lets a caller
// caption the current selection (see Paint's collapsed settings summary).
export interface PickerMeta {
  /** Human-readable source: a sample's label, or the uploaded file's name. */
  source: string
  colours: number
}

// Classic staples always appended to the palette.
const CLASSICS: [number, number, number][] = [
  [0, 0, 0], // black
  [255, 255, 255], // white
  [220, 50, 50], // red
  [50, 180, 50], // green
  [50, 100, 220], // blue
  [230, 210, 50], // yellow
]

export const DEFAULT_COLOR_COUNT = 16
export const DEFAULT_SCALE = 8 // cells per 100 source px; range 1-50
export const MOBILE_WARN_GRID = 64 // warn if computed grid longest side exceeds this
export const SOURCE_MAX_SIDE = 768 // normalise uploads so the slider behaves consistently

// ── Colour math ───────────────────────────────────────────────────────────────

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF]
}

function colorDist(a: [number, number, number], b: [number, number, number]): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
}

function nearestIndex(color: [number, number, number], palette: [number, number, number][]): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < palette.length; i++) {
    const d = colorDist(color, palette[i])
    if (d < bestDist) { bestDist = d; best = i }
  }
  return best
}

// ── Palette ordering ──────────────────────────────────────────────────────────
//
// The wire palette starts in median-cut output order, which looks scattered to
// a human. We reorder so the swatch reads like a paint tray: achromatic
// colours (greys, black, white) first, sorted dark→light, followed by
// chromatic colours sorted by hue.
//
// `SAT_THRESHOLD` is the saturation cutoff for "this counts as chromatic" —
// anything below is treated as a grey. 0.15 was picked empirically: muted
// browns and dusty blues stay in the chromatic bucket, near-greys don't.

const SAT_THRESHOLD = 0.15

interface RgbHsl {
  rgb: [number, number, number]
  h: number // 0..360
  s: number // 0..1
  l: number // 0..1
}

function rgbToHsl([r, g, b]: [number, number, number]): { h: number, s: number, l: number } {
  const rn = r / 255; const gn = g / 255; const bn = b / 255
  const max = Math.max(rn, gn, bn); const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min)
    return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  switch (max) {
    case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)); break
    case gn: h = ((bn - rn) / d + 2); break
    default: h = ((rn - gn) / d + 4)
  }
  return { h: h * 60, s, l }
}

// Returns the indices of `palette` in the desired display order.
// Used to reorder both the palette itself and `targetGrid`'s index references.
function paletteSortOrder(palette: [number, number, number][]): number[] {
  const decorated: (RgbHsl & { idx: number })[] = palette.map((rgb, idx) => ({
    rgb,
    idx,
    ...rgbToHsl(rgb),
  }))

  const achromatic = decorated.filter(c => c.s < SAT_THRESHOLD)
    .sort((a, b) => a.l - b.l)
  const chromatic = decorated.filter(c => c.s >= SAT_THRESHOLD)
    .sort((a, b) => a.h - b.h || a.l - b.l)

  return [...achromatic, ...chromatic].map(c => c.idx)
}

// ── Median-cut quantisation (palette derivation) ──────────────────────────────

function medianCut(pixels: [number, number, number][], depth: number): [number, number, number][][] {
  if (depth === 0 || pixels.length === 0)
    return [pixels]

  let minR = 255; let maxR = 0; let minG = 255; let maxG = 0; let minB = 255; let maxB = 0
  for (const [r, g, b] of pixels) {
    if (r < minR)
      minR = r; if (r > maxR)
      maxR = r
    if (g < minG)
      minG = g; if (g > maxG)
      maxG = g
    if (b < minB)
      minB = b; if (b > maxB)
      maxB = b
  }
  const rangeR = maxR - minR; const rangeG = maxG - minG; const rangeB = maxB - minB
  const ch = rangeR >= rangeG && rangeR >= rangeB ? 0 : rangeG >= rangeB ? 1 : 2

  pixels.sort((a, b) => a[ch] - b[ch])
  const mid = pixels.length >> 1
  return [
    ...medianCut(pixels.slice(0, mid), depth - 1),
    ...medianCut(pixels.slice(mid), depth - 1),
  ]
}

function derivePalette(pixels: [number, number, number][], colorCount: number): [number, number, number][] {
  const depth = Math.ceil(Math.log2(colorCount))
  const buckets = medianCut(pixels, depth)
  return buckets
    .filter(b => b.length > 0)
    .map((bucket) => {
      const sum = bucket.reduce((acc, [r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b], [0, 0, 0])
      return [
        Math.round(sum[0] / bucket.length),
        Math.round(sum[1] / bucket.length),
        Math.round(sum[2] / bucket.length),
      ] as [number, number, number]
    })
}

// Merge any palette pair within `threshold` RGB units (squared distance).
// Real-photo median-cut tends to produce clusters of nearly-identical browns
// or greys in shadow regions; humans can't pick them apart on a swatch, and
// players just want fewer-but-distinct choices. We greedily collapse pairs
// (mean colour) until no two entries are within the threshold. Threshold of
// 20 RGB units ≈ 400 squared, which is "barely distinguishable" by eye.
function mergeNearDuplicates(
  palette: [number, number, number][],
  thresholdSquared = 400,
): [number, number, number][] {
  const out = [...palette]
  let merged = true
  /* eslint-disable no-labels -- labelled break keeps the restart-from-the-top
     semantics readable in this O(n²) merge loop. */
  while (merged) {
    merged = false
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        if (colorDist(out[i], out[j]) < thresholdSquared) {
          // Replace i with the mean of i and j; remove j.
          out[i] = [
            Math.round((out[i][0] + out[j][0]) / 2),
            Math.round((out[i][1] + out[j][1]) / 2),
            Math.round((out[i][2] + out[j][2]) / 2),
          ]
          out.splice(j, 1)
          merged = true
          break outer
        }
      }
    }
  }
  /* eslint-enable no-labels */
  return out
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

// Grid the pipeline will produce for a given (normalised) source at a given
// scale. Exported so the UI can show the resulting dimensions live while the
// scale slider moves, without reprocessing and without re-deriving the math
// (`processImage` calls this too, so the two can't drift).
//
// Rounds rather than truncates so a source is never silently cropped to fit a
// whole number of cells, and clamps to at least one cell per axis so a very
// small scale can't collapse the grid to zero.
export function gridSizeFor(
  sourceW: number,
  sourceH: number,
  scale: number,
): { gridW: number, gridH: number } {
  return {
    gridW: Math.max(1, Math.round(sourceW * scale * 0.01)),
    gridH: Math.max(1, Math.round(sourceH * scale * 0.01)),
  }
}

// Map an RGBA buffer of exactly `gridW × gridH` pixels onto palette indices,
// one index per cell, row-major.
//
// Pure and buffer-based so the cell↔pixel mapping is testable without a canvas:
// cell (x, y) is pixel (x, y), which is the property that keeps the last column
// and last row of the source represented in the grid.
export function quantiseToPalette(
  rgba: Uint8ClampedArray,
  gridW: number,
  gridH: number,
  palette: [number, number, number][],
): number[] {
  const grid = Array.from<number>({ length: gridW * gridH })
  for (let cell = 0; cell < gridW * gridH; cell++) {
    const i = cell * 4
    grid[cell] = nearestIndex([rgba[i], rgba[i + 1], rgba[i + 2]], palette)
  }
  return grid
}

export async function processImage(
  file: File,
  scale: number, // cells per 100 source px, 1-50; clamped if out of range
  colorCount: number,
  ratio: TargetRatioId,
  crop: CropSelection = FULL_CROP,
): Promise<PipelineResult> {
  const bitmap = await createImageBitmap(file)

  // Constrain the source to one of three shapes (see `aspect.ts`): take the rect
  // the GM framed, then normalise it into that ratio's box. `SOURCE_MAX_SIDE`
  // caps the long axis so the scale slider means the same thing for every upload;
  // the cap only ever shrinks, so a small image is not blown up to meet it.
  const { sx, sy, sw, sh } = cropRect(bitmap.width, bitmap.height, ratio, crop)
  const { w: sourceW, h: sourceH } = ratioBox(ratio, Math.min(SOURCE_MAX_SIDE, Math.max(sw, sh)))

  // Source canvas at the (cropped, normalised) size — the downscale below reads
  // from this. Framed source rect → whole canvas.
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = sourceW
  sourceCanvas.height = sourceH
  sourceCanvas.getContext('2d')!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sourceW, sourceH)
  bitmap.close()

  // ── Step 1: downscale the source to exactly the grid, in one step.
  //
  // `drawImage` with a `gridW × gridH` destination consumes the *whole* source
  // rect, so every source pixel — including the right and bottom edges — lands
  // in some cell. This one canvas is then the single source of truth for both
  // the palette and the grid, which is what keeps them consistent.
  //
  // This replaces a downscale → upscale → point-sample round-trip through the
  // vendored pixelit. That round-trip dropped content off the right and bottom
  // (its destination rect was padded a few px wider than the canvas it drew
  // into) and drifted, because it laid out a fractional number of blocks while
  // the grid was rounded to a whole one. See issue #4.
  const { gridW, gridH } = gridSizeFor(sourceW, sourceH, scale)

  const sampleCanvas = document.createElement('canvas')
  sampleCanvas.width = gridW
  sampleCanvas.height = gridH
  const sampleCtx = sampleCanvas.getContext('2d')!
  // Whole source rect → whole grid rect. No padding, no leftover partial block.
  sampleCtx.drawImage(sourceCanvas, 0, 0, sourceW, sourceH, 0, 0, gridW, gridH)
  const sampleData = sampleCtx.getImageData(0, 0, gridW, gridH).data

  // ── Step 2: derive the palette from that same downscale.
  // Classics are appended afterwards for the player's swatch, but the target
  // itself only uses image-derived colours, so the rendered target is a
  // faithful limited-palette version of the image.
  const samplePixels: [number, number, number][] = []
  for (let i = 0; i < sampleData.length; i += 4) {
    samplePixels.push([sampleData[i], sampleData[i + 1], sampleData[i + 2]])
  }
  const derived = mergeNearDuplicates(derivePalette(samplePixels, colorCount))

  // ── Step 3: quantise each cell against the derived palette.
  // Indices map into `derived` (which is the prefix of the wire palette below).
  const targetGrid = quantiseToPalette(sampleData, gridW, gridH, derived)

  // Build the wire palette: derived first (so targetGrid indices stay valid),
  // classics appended for the player's swatch only. Dedupe classics that are
  // close to a derived colour.
  const fullPalette: [number, number, number][] = [...derived]
  for (const classic of CLASSICS) {
    const tooClose = fullPalette.some(c => colorDist(c, classic) < 30 * 30)
    if (!tooClose)
      fullPalette.push(classic)
  }

  // Reorder the palette so the swatch reads like a paint tray (greys first
  // dark→light, then chromatic colours by hue). targetGrid indices are
  // remapped to point at the same colours in their new positions.
  const order = paletteSortOrder(fullPalette)
  const indexMap = Array.from<number>({ length: fullPalette.length })
  order.forEach((oldIdx, newIdx) => { indexMap[oldIdx] = newIdx })
  const sortedPalette = order.map(i => fullPalette[i])
  const remappedTargetGrid = targetGrid.map(idx => indexMap[idx])

  const palette = sortedPalette.map(([r, g, b]) => rgbToHex(r, g, b))
  return { gridW, gridH, palette, targetGrid: remappedTargetGrid, sourceW, sourceH }
}

// ── Helpers for callers ───────────────────────────────────────────────────────

export function isMobileWarning(longestGridSide: number): boolean {
  return longestGridSide > MOBILE_WARN_GRID
}

export { hexToRgb, rgbToHex }
