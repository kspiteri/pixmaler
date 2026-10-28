// Likeness: how close a drawing came to the round's target, as a whole number from 0 to 100.
// Pure, so the round's consequences are testable without a Durable Object.

import { colorDist, hexToRgb } from '../src/lib/canvas/palette'

export type LikenessScorer = (grid: number[]) => number | null

// Built once per round from the target and palette; the returned function scores one drawing.
export function likenessScorer(targetGrid: number[], palette: string[]): LikenessScorer {
  const rgb = palette.map(hexToRgb)
  const n = palette.length
  // credit[painted * n + target]: 1 for an exact match, 0 for the furthest palette colour.
  const credit = new Float64Array(n * n)
  for (let t = 0; t < n; t++) {
    let worst = 0
    for (let k = 0; k < n; k++)
      worst = Math.max(worst, Math.sqrt(colorDist(rgb[k], rgb[t])))
    for (let p = 0; p < n; p++)
      credit[p * n + t] = worst === 0 ? 1 : 1 - Math.sqrt(colorDist(rgb[p], rgb[t])) / worst
  }

  // The best raw likeness any single palette colour gets, painted over the whole grid.
  const counts = new Float64Array(n)
  for (const t of targetGrid)
    counts[t]++
  let bucket = 0
  for (let k = 0; k < n; k++) {
    let sum = 0
    for (let t = 0; t < n; t++)
      sum += counts[t] * credit[k * n + t]
    bucket = Math.max(bucket, sum / targetGrid.length)
  }

  return (grid) => {
    if (grid.length !== targetGrid.length)
      return null
    let sum = 0
    let painted = false
    for (let i = 0; i < targetGrid.length; i++) {
      const p = grid[i]
      if (p === -1)
        continue
      painted = true
      sum += credit[p * n + targetGrid[i]]
    }
    if (!painted)
      return null
    // One colour: every cell, untouched included, is as right as it can be.
    if (n === 1)
      return 100
    // A target one bucket fill reproduces leaves nothing beyond a fill to reward.
    if (bucket >= 1)
      return 0
    const raw = sum / targetGrid.length
    const rescaled = Math.max(0, (raw - bucket) / (1 - bucket))
    const shown = Math.round(Math.sqrt(rescaled) * 100)
    // Rounding would let a near copy on a large grid reach 100; only an exact one may.
    return raw < 1 ? Math.min(99, shown) : shown
  }
}
