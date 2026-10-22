// Seeded k-means - the 'Faithful' colour style (see ./index).
import type { Rgb } from '../palette'

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

export function kmeansQuantiser(rgba: Uint8ClampedArray, count: number): Rgb[] {
  const n = rgba.length >> 2
  if (n === 0)
    return []
  const k = Math.min(Math.max(1, count), n)
  const rng = mulberry32(0x51ED_2A17)

  // k-means++ seeding: each new centre is drawn with probability proportional to its squared
  // distance from the nearest chosen centre, so the start already spreads across the colours.
  // Centres are materialised as tuples from the flat buffer (read at stride 4).
  const seed = Math.floor(rng() * n) * 4
  const centres: Rgb[] = [[rgba[seed], rgba[seed + 1], rgba[seed + 2]]]
  const d2 = new Float64Array(n).fill(Infinity)
  while (centres.length < k) {
    const last = centres[centres.length - 1]
    let sum = 0
    for (let i = 0; i < n; i++) {
      const p = i * 4
      const dr = rgba[p] - last[0]; const dg = rgba[p + 1] - last[1]; const db = rgba[p + 2] - last[2]
      const d = dr * dr + dg * dg + db * db
      if (d < d2[i])
        d2[i] = d
      sum += d2[i]
    }
    if (sum === 0)
      break // every pixel already coincides with a centre
    let r = rng() * sum
    let chosen = n - 1
    for (let i = 0; i < n; i++) {
      r -= d2[i]
      if (r <= 0) {
        chosen = i
        break
      }
    }
    const p = chosen * 4
    centres.push([rgba[p], rgba[p + 1], rgba[p + 2]])
  }

  const assign = new Int32Array(n)
  const cnt = new Float64Array(centres.length)
  for (let iter = 0; iter < KMEANS_MAX_ITERS; iter++) {
    let changed = false
    for (let i = 0; i < n; i++) {
      const p = i * 4
      const pr = rgba[p]; const pg = rgba[p + 1]; const pb = rgba[p + 2]
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < centres.length; c++) {
        const ctr = centres[c]
        const dr = pr - ctr[0]; const dg = pg - ctr[1]; const db = pb - ctr[2]
        const d = dr * dr + dg * dg + db * db
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
    for (let i = 0; i < n; i++) {
      const p = i * 4
      const c = assign[i]
      sumR[c] += rgba[p]
      sumG[c] += rgba[p + 1]
      sumB[c] += rgba[p + 2]
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
