// Seeded k-means - the 'Faithful' colour style (see ./index).
import type { Rgb } from '../palette'
import { colorDist } from '../palette'

// ── Seeded k-means (Lloyd) ───────────────────────────────────────────────────────
// The fidelity ceiling, made deterministic by a fixed k-means++ seed and an iteration cap.
// Slower than the others (iterative), which the /quantise timing is meant to expose.

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const KMEANS_MAX_ITERS = 12

export function kmeansQuantiser(pixels: Rgb[], count: number): Rgb[] {
  if (pixels.length === 0)
    return []
  const k = Math.min(Math.max(1, count), pixels.length)
  const rng = mulberry32(0x51ED_2A17)

  // k-means++ seeding: each new centre is drawn with probability proportional to its squared
  // distance from the nearest chosen centre, so the start already spreads across the colours.
  const centres: Rgb[] = [pixels[Math.floor(rng() * pixels.length)]]
  const d2 = new Float64Array(pixels.length).fill(Infinity)
  while (centres.length < k) {
    const last = centres[centres.length - 1]
    let sum = 0
    for (let i = 0; i < pixels.length; i++) {
      const d = colorDist(pixels[i], last)
      if (d < d2[i])
        d2[i] = d
      sum += d2[i]
    }
    if (sum === 0)
      break // every pixel already coincides with a centre
    let r = rng() * sum
    let chosen = pixels.length - 1
    for (let i = 0; i < pixels.length; i++) {
      r -= d2[i]
      if (r <= 0) {
        chosen = i
        break
      }
    }
    centres.push(pixels[chosen])
  }

  const assign = new Int32Array(pixels.length)
  const cnt = new Float64Array(centres.length)
  for (let iter = 0; iter < KMEANS_MAX_ITERS; iter++) {
    let changed = false
    for (let i = 0; i < pixels.length; i++) {
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < centres.length; c++) {
        const d = colorDist(pixels[i], centres[c])
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      if (assign[i] !== best) {
        assign[i] = best
        changed = true
      }
    }

    const sumR = new Float64Array(centres.length)
    const sumG = new Float64Array(centres.length)
    const sumB = new Float64Array(centres.length)
    cnt.fill(0)
    for (let i = 0; i < pixels.length; i++) {
      const c = assign[i]
      sumR[c] += pixels[i][0]
      sumG[c] += pixels[i][1]
      sumB[c] += pixels[i][2]
      cnt[c] += 1
    }
    for (let c = 0; c < centres.length; c++) {
      if (cnt[c] > 0)
        centres[c] = [Math.round(sumR[c] / cnt[c]), Math.round(sumG[c] / cnt[c]), Math.round(sumB[c] / cnt[c])]
    }
    if (!changed)
      break
  }

  // Drop centres that ended up owning no pixels, so the palette length is honest.
  return centres.filter((_, c) => cnt[c] > 0)
}
