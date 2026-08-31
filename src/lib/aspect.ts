// Ratio-aware helpers shared by the canvas surface: brush sizing scales with the
// longest side (`canvas/pixel.ts`), `--art-ratio` preserves image shape in the Voting and
// Results slots, and the drawing shell flips `flex-direction` via `orientationFor`.

// Maximum brush size for a given grid, scaled by the longest side and clamped
// to a usable range. Small grids top out around 8 (a single cell dominates the
// image); large grids top out at 40 so the brush stays sensible.
export function brushMaxFor(gridW: number, gridH: number): number {
  return Math.max(8, Math.min(40, Math.round(Math.max(gridW, gridH) / 8)))
}

// Sensible starting brush for a given grid — ~1/64 of the longest side, min 1.
// Small grids get a 1-cell brush; large grids get a few cells so the first
// stroke actually shows up without cranking the slider.
export function defaultBrushFor(gridW: number, gridH: number): number {
  return Math.max(1, Math.round(Math.max(gridW, gridH) / 64))
}

// The `aspect-ratio` value for a grid, formatted for the CSS `aspect-ratio`
// property (and the `--art-ratio` custom prop). Non-positive dimensions fall
// back to `1 / 1` so a mid-stream bug can't collapse the slots to zero height.
export function artRatio(gridW: number, gridH: number): string {
  if (gridW <= 0 || gridH <= 0)
    return '1 / 1'
  return `${gridW} / ${gridH}`
}

// Orientation for the two-pane layout, so the editable canvas claims the largest area of
// the viewport: `'row'` when the viewport is wider than the grid ratio (canvases side by
// side), `'column'` when it is taller (stacked).
export function orientationFor(
  gridW: number,
  gridH: number,
  viewportW: number,
  viewportH: number,
): 'row' | 'column' {
  if (gridW <= 0 || gridH <= 0 || viewportW <= 0 || viewportH <= 0)
    return 'row'
  const gridRatio = gridW / gridH
  const viewportRatio = viewportW / viewportH
  // Viewport is relatively wider than the grid → placing the canvases in a row
  // lets each one be taller; otherwise stack them so each can be wider.
  return viewportRatio >= gridRatio ? 'row' : 'column'
}

// ── Target ratios ─────────────────────────────────────────────────────────────
// A target is one of three shapes, never arbitrary — a layout constraint before an
// aesthetic one. An arbitrary source ratio let the fit box and the grid disagree by any
// amount: a 2.25:1 panorama overflowed `.drawing__body`, clipping the last columns.

export const TARGET_RATIOS = {
  portrait: { label: '2:3', w: 2, h: 3 },
  square: { label: '1:1', w: 1, h: 1 },
  landscape: { label: '3:2', w: 3, h: 2 },
} as const

export type TargetRatioId = keyof typeof TARGET_RATIOS

// Display order for the picker's control: portrait → square → landscape.
export const TARGET_RATIO_IDS: TargetRatioId[] = ['portrait', 'square', 'landscape']

export const DEFAULT_RATIO: TargetRatioId = 'landscape'

// Preselects the picker, so the GM's own framing is the default and a crop is opt-in.
// Compared in log space: on a raw `w / h` compare 3:2 sits 0.5 above square while 2:3
// sits 0.33 below, so every square-ish portrait would round to landscape.
export function nearestRatioFor(sourceW: number, sourceH: number): TargetRatioId {
  if (sourceW <= 0 || sourceH <= 0)
    return DEFAULT_RATIO
  const source = Math.log(sourceW / sourceH)
  let best = DEFAULT_RATIO
  let bestDist = Number.POSITIVE_INFINITY
  for (const id of TARGET_RATIO_IDS) {
    const { w, h } = TARGET_RATIOS[id]
    const dist = Math.abs(Math.log(w / h) - source)
    if (dist < bestDist) { bestDist = dist; best = id }
  }
  return best
}

// The pixel box a ratio normalises into, `maxSide` on its longer axis.
export function ratioBox(id: TargetRatioId, maxSide: number): { w: number, h: number } {
  const { w, h } = TARGET_RATIOS[id]
  const unit = maxSide / Math.max(w, h)
  return { w: Math.max(1, Math.round(w * unit)), h: Math.max(1, Math.round(h * unit)) }
}

// Source-relative so it survives a ratio change and never depends on the display size
// of the widget that produced it. `cx`/`cy` are the centre as a fraction of the source;
// `zoom` is the size as a fraction of the largest rect of that ratio that fits.
export interface CropSelection {
  cx: number
  cy: number
  zoom: number
}

// The whole image, as centred as its shape allows.
export const FULL_CROP: CropSelection = { cx: 0.5, cy: 0.5, zoom: 1 }

// Past about a third of the maximal rect, a target is a few dozen source pixels blown
// up to a grid and the palette derivation has nothing left to work with.
export const CROP_MIN_ZOOM = 0.3

// Largest rect of the ratio's shape that fits inside `srcW × srcH`. Cover, not
// letterbox: padding would put flat bands in the target and players would spend their
// two minutes painting them.
export function maxCropSize(
  srcW: number,
  srcH: number,
  id: TargetRatioId,
): { sw: number, sh: number } {
  const { w, h } = TARGET_RATIOS[id]
  const target = w / h
  if (srcW <= 0 || srcH <= 0)
    return { sw: 1, sh: 1 }
  // Too wide for the shape → full height, trimmed sides. Otherwise the reverse.
  return srcW / srcH > target
    ? { sw: Math.max(1, Math.round(srcH * target)), sh: srcH }
    : { sw: srcW, sh: Math.max(1, Math.round(srcW / target)) }
}

// Resolved as a `drawImage` source rect, clamped wholly inside the image: a centre
// dragged past an edge slides along it instead of sampling off the side, which would
// reach the target as a black band.
export function cropRect(
  srcW: number,
  srcH: number,
  id: TargetRatioId,
  sel: CropSelection = FULL_CROP,
): { sx: number, sy: number, sw: number, sh: number } {
  const max = maxCropSize(srcW, srcH, id)
  const zoom = Math.min(1, Math.max(CROP_MIN_ZOOM, sel.zoom))
  const sw = Math.max(1, Math.round(max.sw * zoom))
  const sh = Math.max(1, Math.round(max.sh * zoom))
  return {
    sx: Math.round(Math.min(Math.max(sel.cx * srcW - sw / 2, 0), Math.max(0, srcW - sw))),
    sy: Math.round(Math.min(Math.max(sel.cy * srcH - sh / 2, 0), Math.max(0, srcH - sh))),
    sw,
    sh,
  }
}
