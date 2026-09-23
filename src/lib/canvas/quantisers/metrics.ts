// Quantiser comparison metrics for the /quantise page. Not re-exported from ./index, so they
// stay out of the production bundle - the dev page and tests import this file directly.
import type { Rgb } from '../palette'
import { colorDist } from '../palette'

// Distinct palette entries the target actually paints with. A quantiser can return N colours yet
// only ever use a few; this is the count that reaches the canvas. Higher = a richer target.
export function distinctColoursUsed(targetGrid: number[]): number {
  return new Set(targetGrid).size
}

// Mean nearest-neighbour distance among palette entries, in RGB units. Higher = the palette
// spends its slots on distinct colours rather than near-duplicates (another read on richness).
export function paletteSpread(palette: Rgb[]): number {
  if (palette.length < 2)
    return 0
  let sum = 0
  for (let i = 0; i < palette.length; i++) {
    let best = Infinity
    for (let j = 0; j < palette.length; j++) {
      if (i === j)
        continue
      const d = colorDist(palette[i], palette[j])
      if (d < best)
        best = d
    }
    sum += Math.sqrt(best)
  }
  return sum / palette.length
}

// RMS distance between each source pixel and the palette colour its cell was quantised to, in
// RGB units. Lower = more faithful — but remember the target should stay redrawable, so this is
// a reading to weigh, not to minimise. `targetGrid` indexes `palette`.
export function quantiseError(rgba: Uint8ClampedArray, palette: Rgb[], targetGrid: number[]): number {
  if (targetGrid.length === 0 || palette.length === 0)
    return 0
  let sum = 0
  for (let i = 0; i < targetGrid.length; i++) {
    const c = palette[targetGrid[i]]
    const o = i * 4
    sum += (rgba[o] - c[0]) ** 2 + (rgba[o + 1] - c[1]) ** 2 + (rgba[o + 2] - c[2]) ** 2
  }
  return Math.sqrt(sum / targetGrid.length)
}
