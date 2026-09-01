// Image pipeline: upload → crop to ratio → downscale to the grid → palette → targetGrid.
//
// Geometry only. The colour science it leans on — median cut, near-duplicate
// merging, swatch ordering — lives in `./palette`.

import type { CropSelection, TargetRatioId } from './aspect'
import type { Rgb } from './palette'
import { cropRect, FULL_CROP, ratioBox } from './aspect'
import {
  derivePalette,
  mergeNearDuplicates,
  nearestIndex,
  paletteSortOrder,
  rgbToHex,
  withClassics,
} from './palette'

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

// What the picker was pointed at, emitted alongside the result. Lets a caller caption
// the current selection (see Paint's collapsed settings summary). The colour count is
// deliberately absent: `PipelineResult.palette` is the truth, and the request is not.
export interface PickerMeta {
  /** Human-readable source: a sample's label, or the uploaded file's name. */
  source: string
}

export const DEFAULT_COLOR_COUNT = 16
export const DEFAULT_SCALE = 8 // cells per 100 source px; range 1-50
export const MOBILE_WARN_GRID = 64 // warn if computed grid longest side exceeds this
export const SOURCE_MAX_SIDE = 768 // normalise uploads so the slider behaves consistently

// ── Main pipeline ─────────────────────────────────────────────────────────────

// Exported so the UI can show the resulting dimensions live while the scale slider
// moves (`processImage` calls this too, so the two can't drift). Rounds rather than
// truncates, and clamps to one cell per axis so a small scale can't collapse the grid.
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

// Row-major, one index per cell. Pure and buffer-based so the cell↔pixel mapping is
// testable without a canvas: cell (x, y) is pixel (x, y), which is the property that
// keeps the source's last column and row represented in the grid.
export function quantiseToPalette(
  rgba: Uint8ClampedArray,
  gridW: number,
  gridH: number,
  palette: Rgb[],
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
  colorCount: number, // swatch length; exact unless the image has fewer distinct colours
  ratio: TargetRatioId,
  crop: CropSelection = FULL_CROP,
): Promise<PipelineResult> {
  const bitmap = await createImageBitmap(file)

  // Constrain to one of three shapes (see `aspect.ts`): take the rect the GM framed,
  // then normalise into that ratio's box. `SOURCE_MAX_SIDE` caps the long axis so the
  // scale slider means the same thing for every upload, and only ever shrinks.
  const { sx, sy, sw, sh } = cropRect(bitmap.width, bitmap.height, ratio, crop)
  const { w: sourceW, h: sourceH } = ratioBox(ratio, Math.min(SOURCE_MAX_SIDE, Math.max(sw, sh)))

  // The downscale below reads from this. Framed source rect → whole canvas.
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = sourceW
  sourceCanvas.height = sourceH
  sourceCanvas.getContext('2d')!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sourceW, sourceH)
  bitmap.close()

  // ── Step 1: downscale the source to exactly the grid, in one step. A `gridW × gridH`
  // destination consumes the *whole* source rect, so no pixel is dropped — the vendored
  // pixelit round-trip this replaces lost the right and bottom edges. See issue #4.
  const { gridW, gridH } = gridSizeFor(sourceW, sourceH, scale)

  const sampleCanvas = document.createElement('canvas')
  sampleCanvas.width = gridW
  sampleCanvas.height = gridH
  const sampleCtx = sampleCanvas.getContext('2d')!
  // Whole source rect → whole grid rect. No padding, no leftover partial block.
  sampleCtx.drawImage(sourceCanvas, 0, 0, sourceW, sourceH, 0, 0, gridW, gridH)
  const sampleData = sampleCtx.getImageData(0, 0, gridW, gridH).data

  // ── Step 2: derive the palette from that same downscale. The target uses only
  // image-derived colours; classics top the swatch up to `colorCount` afterwards if
  // the image could not fill it.
  const samplePixels: Rgb[] = []
  for (let i = 0; i < sampleData.length; i += 4) {
    samplePixels.push([sampleData[i], sampleData[i + 1], sampleData[i + 2]])
  }
  const derived = mergeNearDuplicates(derivePalette(samplePixels, colorCount))

  // ── Step 3: quantise each cell against the derived palette.
  // Indices map into `derived` (which is the prefix of the wire palette below).
  const targetGrid = quantiseToPalette(sampleData, gridW, gridH, derived)

  // Derived first so targetGrid indices stay valid; classics are swatch-only, and only
  // as many as it takes to reach the count the GM asked for.
  const fullPalette = withClassics(derived, colorCount)

  // Reorder so the swatch reads like a paint tray; targetGrid indices are remapped to
  // point at the same colours in their new positions.
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
