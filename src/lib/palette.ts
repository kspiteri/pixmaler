// Colour science for the image pipeline: hex conversion, RGB distance, median-cut
// palette derivation, near-duplicate merging, and the swatch's display order. Split
// out of `pipeline.ts`, which was also doing image geometry. Nothing here knows about
// canvases, grids or cells, which is what makes it testable without a DOM.

// 0-255 per channel, no alpha — a target is fully opaque.
export type Rgb = [number, number, number]

// Appended to the player's swatch after the derived palette, never part of the target,
// so there is always a black, a white and a primary to reach for.
export const CLASSICS: Rgb[] = [
  [0, 0, 0], // black
  [255, 255, 255], // white
  [220, 50, 50], // red
  [50, 180, 50], // green
  [50, 100, 220], // blue
  [230, 210, 50], // yellow
]

// How close a classic must be to a derived colour to be dropped as a duplicate, in
// RGB units (compared squared, so 30 becomes 900).
export const CLASSIC_DEDUPE_DIST = 30

// ── Hex conversion ────────────────────────────────────────────────────────────

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

export function hexToRgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF]
}

// ── Distance ──────────────────────────────────────────────────────────────────

// Squared on purpose: callers only ever compare, and the quantise loop runs once per
// grid cell — up to 262144 of them.
export function colorDist(a: Rgb, b: Rgb): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
}

// Ties go to the lower index, so the mapping is deterministic for a palette order.
export function nearestIndex(color: Rgb, palette: Rgb[]): number {
  let best = 0
  let bestDist = Number.POSITIVE_INFINITY
  for (let i = 0; i < palette.length; i++) {
    const d = colorDist(color, palette[i])
    if (d < bestDist) { bestDist = d; best = i }
  }
  return best
}

// ── Palette ordering ──────────────────────────────────────────────────────────
// Median-cut order looks scattered to a human, so the swatch is reordered to read like
// a paint tray: achromatic first, dark→light, then chromatic by hue. 0.15 is empirical
// — muted browns and dusty blues stay chromatic, near-greys don't.

export const SAT_THRESHOLD = 0.15

interface RgbHsl {
  rgb: Rgb
  h: number // 0..360
  s: number // 0..1
  l: number // 0..1
}

export function rgbToHsl([r, g, b]: Rgb): { h: number, s: number, l: number } {
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

// Indices rather than a sorted palette: the caller remaps `targetGrid` through the
// same permutation, and handing back only the colours would lose that mapping.
export function paletteSortOrder(palette: Rgb[]): number[] {
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

// ── Median-cut quantisation ───────────────────────────────────────────────────

// Splits the cloud on its widest channel, halving at the median, to `2 ** depth`
// buckets. **Sorts `pixels` in place** — the caller owns a throwaway array from
// `getImageData`, so copying 262144 triples to preserve order would be waste.
export function medianCut(pixels: Rgb[], depth: number): Rgb[][] {
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

// Mean colour per non-empty bucket. `colorCount` is a target, not a guarantee: depth is
// `ceil(log2(colorCount))`, so 24 yields up to 32 before merging. `PALETTE_MAX_LEN` on
// the wire is what actually bounds it.
export function derivePalette(pixels: Rgb[], colorCount: number): Rgb[] {
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
      ] as Rgb
    })
}

// Collapses pairs into their mean until no pair is within the threshold. Real-photo
// median-cut clusters near-identical browns and greys in shadows, which nobody can
// pick apart on a swatch. The default 400 is 20 RGB units — "barely distinguishable".
export function mergeNearDuplicates(palette: Rgb[], thresholdSquared = 400): Rgb[] {
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

// Derived colours stay first so `targetGrid` indices remain valid; classics are
// appended only when far enough from all of them to earn a separate swatch.
export function withClassics(derived: Rgb[]): Rgb[] {
  const full = [...derived]
  for (const classic of CLASSICS) {
    if (!full.some(c => colorDist(c, classic) < CLASSIC_DEDUPE_DIST ** 2))
      full.push(classic)
  }
  return full
}
