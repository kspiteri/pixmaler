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
// Cap for the fallback decode's canvas. A large phone photo can exceed what a mobile
// browser will decode into a canvas at all (iOS caps a 2D canvas near ~16.7M px) — the
// likeliest reason `createImageBitmap` refused it. 4096 stays inside every known mobile
// 2D-canvas limit; the pipeline downscales to `SOURCE_MAX_SIDE` afterwards regardless.
export const MAX_DECODE_SIDE = 4096
// What shows through a transparent upload. White because line art and logos — the PNGs
// that carry an alpha channel — are drawn for a light page; the GM can change it.
export const DEFAULT_BACKGROUND = '#ffffff'

// ── Main pipeline ─────────────────────────────────────────────────────────────

// Exported so the UI shows the resulting dimensions live as the scale slider moves
// (`processImage` calls this too, so the two can't drift). Rounds and clamps to one cell
// per axis so a small scale can't collapse the grid.
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

// Thrown when the browser genuinely cannot render an image's bytes — both the fast path
// and the fallback below have given up. The picker turns this into player-facing copy.
export class ImageDecodeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ImageDecodeError'
  }
}

// Decode a file to an `ImageBitmap`, surviving browsers whose `createImageBitmap(Blob)` is
// flaky — a mobile build rejects oversized or EXIF-heavy images the same browser renders
// fine through an `<img>`. Try the fast path, then fall back to an `<img>` → canvas
// round-trip: the `<img>` decoder is more forgiving, bakes in EXIF orientation, and strips
// metadata. The fallback canvas is capped at `MAX_DECODE_SIDE` so an enormous source can't
// reintroduce the limit that tripped the fast path.
export async function decodeImage(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file)
  }
  catch (primary) {
    try {
      return await decodeViaElement(file)
    }
    catch (fallback) {
      throw new ImageDecodeError(`Could not decode ${file.name || 'image'}`, { cause: fallback ?? primary })
    }
  }
}

async function decodeViaElement(file: File): Promise<ImageBitmap> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    // `naturalWidth/Height` already reflect any EXIF orientation, so drawing at that size
    // gives the upright image; a rotated phone photo comes out the right way up.
    const w = img.naturalWidth
    const h = img.naturalHeight
    if (!w || !h)
      throw new Error('decoded image reports no dimensions')
    // Cap the canvas at `MAX_DECODE_SIDE`: an oversized source is the likeliest reason the
    // fast path refused it. Downscaling here loses only detail `SOURCE_MAX_SIDE` would drop.
    const scale = Math.min(1, MAX_DECODE_SIDE / Math.max(w, h))
    const cw = Math.max(1, Math.round(w * scale))
    const ch = Math.max(1, Math.round(h * scale))
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    // No fill: a transparent PNG that reached the fallback keeps its alpha, which
    // `hasTransparency` and the pipeline's own background flatten still handle.
    canvas.getContext('2d')!.drawImage(img, 0, 0, cw, ch)
    return await createImageBitmap(canvas)
  }
  finally {
    URL.revokeObjectURL(url)
  }
}

export async function processImage(
  file: File,
  scale: number, // cells per 100 source px, 1-50; clamped if out of range
  colorCount: number, // swatch length; exact unless the image has fewer distinct colours
  ratio: TargetRatioId,
  crop: CropSelection = FULL_CROP,
  background: string = DEFAULT_BACKGROUND, // CSS colour behind a transparent upload
): Promise<PipelineResult> {
  const bitmap = await decodeImage(file)

  // Constrain to one of three shapes (see `aspect.ts`): take the rect the GM framed, then
  // normalise into that ratio's box. `SOURCE_MAX_SIDE` caps the long axis so the scale
  // slider means the same for every upload.
  const { sx, sy, sw, sh } = cropRect(bitmap.width, bitmap.height, ratio, crop)
  const { w: sourceW, h: sourceH } = ratioBox(ratio, Math.min(SOURCE_MAX_SIDE, Math.max(sw, sh)))

  // The downscale below reads from this. Framed source rect → whole canvas.
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = sourceW
  sourceCanvas.height = sourceH
  const sourceCtx = sourceCanvas.getContext('2d')!
  // Flatten onto an opaque background *before* anything samples it: `getImageData` returns
  // RGB 0,0,0 for a transparent pixel and `quantiseToPalette` reads no alpha, so without
  // this every transparent region quantises to black. Filling also blends anti-aliased edges.
  sourceCtx.fillStyle = background
  sourceCtx.fillRect(0, 0, sourceW, sourceH)
  sourceCtx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sourceW, sourceH)
  bitmap.close()

  // ── Step 1: downscale the source to exactly the grid in one step. A `gridW × gridH`
  // destination consumes the whole source rect, so no pixel is dropped — the vendored
  // pixelit round-trip this replaces lost the right and bottom edges.
  const { gridW, gridH } = gridSizeFor(sourceW, sourceH, scale)

  const sampleCanvas = document.createElement('canvas')
  sampleCanvas.width = gridW
  sampleCanvas.height = gridH
  const sampleCtx = sampleCanvas.getContext('2d')!
  // Whole source rect → whole grid rect. No padding, no leftover partial block.
  sampleCtx.drawImage(sourceCanvas, 0, 0, sourceW, sourceH, 0, 0, gridW, gridH)
  const sampleData = sampleCtx.getImageData(0, 0, gridW, gridH).data

  // ── Step 2: derive the palette from that same downscale. The target uses only
  // image-derived colours; classics top the swatch up to `colorCount` afterwards.
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

// Why the picker refused a file, or `null` if the pipeline should try it. The copy lives
// with the picker; this only classifies.
export type UnsupportedImage = 'vector' | 'not-image'

// `image/*` includes SVG, and an `<img>` renders one (so the crop preview looks right), but
// `createImageBitmap` rejects it — vector art has no pixels to quantise, so nothing to salvage.
const VECTOR_TYPES = new Set(['image/svg+xml', 'image/svg'])

// A blank `type` is deliberately allowed through: an unusual extension can leave it
// empty on some systems, and the browser's own decode is a better judge than a guess.
export function unsupportedImage(file: File): UnsupportedImage | null {
  if (VECTOR_TYPES.has(file.type))
    return 'vector'
  if (file.type && !file.type.startsWith('image/'))
    return 'not-image'
  return null
}

// Whether a failed-to-decode file is HEIC/HEIF — the one undecodable format common enough
// to name in an error (every iPhone shoots it, only Safari reads it). Extension as well as
// MIME, since a `.heic` often arrives with an empty `type`. Post-failure classification only.
export function isHeic(file: File): boolean {
  return /^image\/hei[cf]$/.test(file.type) || /\.hei[cf]$/i.test(file.name)
}

// Whether any pixel is less than fully opaque — the only case where the background choice
// changes the target. Needs a DOM: there's no way to ask an `ImageBitmap` directly. Scanned
// at `SOURCE_MAX_SIDE`, an upper bound on what the grid could sample, so callers run it once
// per adopted file. A PNG's alpha *channel* isn't the question — screenshots are routinely
// opaque RGBA, so only the pixels know.
export function hasTransparency(bitmap: ImageBitmap): boolean {
  const shrink = Math.min(1, SOURCE_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * shrink))
  const h = Math.max(1, Math.round(bitmap.height * shrink))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  // Whole bitmap → whole canvas, so every pixel of the canvas comes from the image and
  // the fresh canvas's own transparency cannot be mistaken for the image's.
  ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, w, h)

  const { data } = ctx.getImageData(0, 0, w, h)
  // Returns on the first hit, so a transparent background — which usually starts at the
  // top-left — costs a few reads. Only a fully opaque image pays for the whole scan.
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255)
      return true
  }
  return false
}
