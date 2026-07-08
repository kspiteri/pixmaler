// Ratio-aware helpers shared by the canvas surface.
//
// Three sites in the codebase depend on the grid's aspect: brush sizing scales
// with the longest side (canvas.ts), the `--art-ratio` CSS var preserves image
// shape in Voting/Results slots, and (incoming, item 5) the drawing shell flips
// its `flex-direction` between row and column based on how the grid compares to
// the viewport. Centralising them here keeps the math in one place — and unit-
// testable — so item 5 can consume `orientationFor` without reinventing it.

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

// Orientation for a two-pane layout (reference + editable canvas) that wants
// the editable canvas to occupy the largest possible area of the viewport.
// Returns `'row'` when the viewport is wider than the grid ratio (so canvases
// sit side by side) and `'column'` when the viewport is taller (stack them).
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
