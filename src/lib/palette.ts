// Colour science for the image pipeline: hex conversion, RGB distance, median-cut
// palette derivation, near-duplicate merging, and the swatch's display order.
//
// Split out of `pipeline.ts`, which was doing two unrelated jobs — image geometry
// (crop, downscale, grid sizing) and colour quantisation. Nothing here knows about
// canvases, grids or cells: it takes RGB triples and returns RGB triples, which is
// what makes it testable without a DOM.

// A colour as the pipeline handles it internally: 0-255 per channel, no alpha.
// Alpha is dropped at the sampling boundary — a target is fully opaque.
export type Rgb = [number, number, number]

// Classic staples appended to the player's swatch after the derived palette.
// Never part of the target itself, so a player always has a black, a white and a
// primary to reach for even when the image contains none.
export const CLASSICS: Rgb[] = [
  [0, 0, 0], // black
  [255, 255, 255], // white
  [220, 50, 50], // red
  [50, 180, 50], // green
  [50, 100, 220], // blue
  [230, 210, 50], // yellow
]

// How close a classic has to be to a derived colour before it is dropped as a
// duplicate, in RGB units (compared squared, so 30 units is 900).
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

// Squared Euclidean distance in RGB. Squared on purpose: every caller only ever
// compares distances, and skipping the square root keeps the per-cell quantise
// loop — one call per grid cell, up to 262144 of them — free of it.
export function colorDist(a: Rgb, b: Rgb): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
}

// Index of the palette entry closest to `color`. Ties go to the lower index, so
// the mapping is deterministic for a given palette order.
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
//
// The derived palette comes out in median-cut order, which looks scattered to a
// human. We reorder so the swatch reads like a paint tray: achromatic colours
// (greys, black, white) first, sorted dark→light, then chromatic colours by hue.
//
// `SAT_THRESHOLD` is the saturation cutoff for "this counts as chromatic" —
// anything below is treated as a grey. 0.15 was picked empirically: muted browns
// and dusty blues stay in the chromatic bucket, near-greys don't.

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

// The indices of `palette` in display order. Returns indices rather than a sorted
// palette because the caller has to remap `targetGrid`'s references through the
// same permutation — handing back only the colours would lose that mapping.
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

// Recursively split the pixel cloud on its widest channel, halving at the median
// each time, to `2 ** depth` buckets.
//
// **Sorts `pixels` in place.** The caller owns a throwaway array built from
// `getImageData`, so copying up to 262144 triples per run to preserve it would be
// waste. Anything that needs the original order must copy before calling.
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

// Mean colour of each non-empty median-cut bucket.
//
// `colorCount` is a target, not a guarantee. Depth is `ceil(log2(colorCount))`,
// so the split produces `2 ** depth` buckets — a power of two at or above the
// request. Asking for 24 yields up to 32 before `mergeNearDuplicates` runs; the
// wire's `PALETTE_MAX_LEN` is what actually bounds it.
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

// Collapse any pair of palette entries closer than `thresholdSquared` into their
// mean, repeatedly, until no pair is that close.
//
// Real-photo median-cut produces clusters of nearly-identical browns or greys in
// shadow regions; humans can't pick them apart on a swatch, and players just want
// fewer-but-distinct choices. The default of 400 is 20 RGB units, which is
// "barely distinguishable" by eye.
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

// The palette that goes on the wire: derived colours first — so `targetGrid`
// indices stay valid — then any classic far enough from all of them to be worth a
// separate swatch.
export function withClassics(derived: Rgb[]): Rgb[] {
  const full = [...derived]
  for (const classic of CLASSICS) {
    if (!full.some(c => colorDist(c, classic) < CLASSIC_DEDUPE_DIST ** 2))
      full.push(classic)
  }
  return full
}
