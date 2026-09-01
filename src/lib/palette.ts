// Colour science for the image pipeline: hex conversion, RGB distance, median-cut
// palette derivation, near-duplicate merging, and the swatch's display order. Split
// out of `pipeline.ts`, which was also doing image geometry. Nothing here knows about
// canvases, grids or cells, which is what makes it testable without a DOM.

// 0-255 per channel, no alpha — a target is fully opaque.
export type Rgb = [number, number, number]

// The fallback swatch: what fills the slots the image itself cannot. Six base colours —
// black, white and the primaries — plus a ramp between each neighbouring pair, walked as
// a ring so yellow closes back to black. 6 + 6 × 5 = 36 candidates, which is what it
// takes to fill the picker's largest count for a single-colour upload: an all-white
// image supplies one swatch and dedupes the white candidate away, so 31 would leave the
// player one short of 32.
//
// **The order is load-bearing.** `withClassics` fills greedily from the front, so the
// six base colours come first, then every pair's midpoint, then progressively finer
// steps — a two-slot gap gets black and white, not black and a near-black grey.
// Named because the picker offers these six as background choices too, and a bare colour
// swatch needs a label a screen reader can announce.
export const CLASSIC_BASE: { name: string, rgb: Rgb }[] = [
  { name: 'black', rgb: [0, 0, 0] },
  { name: 'white', rgb: [255, 255, 255] },
  { name: 'red', rgb: [220, 50, 50] },
  { name: 'green', rgb: [50, 180, 50] },
  { name: 'blue', rgb: [50, 100, 220] },
  { name: 'yellow', rgb: [230, 210, 50] },
]

// Where to cut each pair, coarsest first: the midpoint, then the third-points, then the
// sixth-points. Every step is at least `CLASSIC_DEDUPE_DIST` from its neighbours — the
// tightest pair, green to blue, is 188 units across, so a sixth of it is 31.
const CLASSIC_STEPS = [3 / 6, 2 / 6, 4 / 6, 1 / 6, 5 / 6]

function mix([r1, g1, b1]: Rgb, [r2, g2, b2]: Rgb, t: number): Rgb {
  return [
    Math.round(r1 + (r2 - r1) * t),
    Math.round(g1 + (g2 - g1) * t),
    Math.round(b1 + (b2 - b1) * t),
  ]
}

const BASE_RGB: Rgb[] = CLASSIC_BASE.map(c => c.rgb)

export const CLASSICS: Rgb[] = [
  ...BASE_RGB,
  ...CLASSIC_STEPS.flatMap(t =>
    BASE_RGB.map((from, i) => mix(from, BASE_RGB[(i + 1) % BASE_RGB.length], t)),
  ),
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

// One bucket, as a half-open range over the shared pixel array. `ch` and `range`
// describe its widest channel; `priority` is population × that range, so the next
// split goes to the bucket carrying the most colour error rather than simply the most
// pixels. That is what lets a small, chromatically distant region — one red object in
// a green scene — earn its own entry instead of being averaged into mud.
interface Box {
  lo: number
  hi: number
  ch: number
  range: number
  priority: number
}

// Channel ties go to red, then green. The choice has to be deterministic for a given
// cloud, or the same image yields a different palette between runs.
function measure(pixels: Rgb[], lo: number, hi: number): Box {
  let minR = 255; let maxR = 0; let minG = 255; let maxG = 0; let minB = 255; let maxB = 0
  for (let i = lo; i < hi; i++) {
    const [r, g, b] = pixels[i]
    if (r < minR)
      minR = r
    if (r > maxR)
      maxR = r
    if (g < minG)
      minG = g
    if (g > maxG)
      maxG = g
    if (b < minB)
      minB = b
    if (b > maxB)
      maxB = b
  }
  const rangeR = maxR - minR; const rangeG = maxG - minG; const rangeB = maxB - minB
  let ch = 0; let range = rangeR
  if (rangeG > range) {
    ch = 1
    range = rangeG
  }
  if (rangeB > range) {
    ch = 2
    range = rangeB
  }
  return { lo, hi, ch, range, priority: (hi - lo) * range }
}

// Sorts the box's own span on its widest channel and halves it at the median.
// `Array.prototype.sort` cannot address a sub-range, hence the copy out and back —
// still a single pass over that span rather than the whole cloud.
function splitBox(pixels: Rgb[], box: Box): [Box, Box] {
  const span = pixels.slice(box.lo, box.hi)
  span.sort((a, b) => a[box.ch] - b[box.ch])
  for (let i = 0; i < span.length; i++)
    pixels[box.lo + i] = span[i]
  const mid = box.lo + (span.length >> 1)
  return [measure(pixels, box.lo, mid), measure(pixels, mid, box.hi)]
}

// Splits the cloud into **exactly** `count` buckets, halving whichever bucket carries
// the most colour error each time — so any count works, not only powers of two.
// Returns fewer only when the cloud runs out of distinct colours to separate.
// **Sorts `pixels` in place** — the caller owns a throwaway array from `getImageData`,
// so copying 262144 triples to preserve order would be waste.
export function medianCut(pixels: Rgb[], count: number): Rgb[][] {
  if (count <= 1 || pixels.length === 0)
    return [pixels]

  const boxes = [measure(pixels, 0, pixels.length)]
  while (boxes.length < count) {
    // Linear scan rather than a heap: `count` is bounded by `PALETTE_MAX_LEN`, so this
    // is a few thousand comparisons against sorting up to 262144 pixels.
    let best = 0
    for (let i = 1; i < boxes.length; i++) {
      if (boxes[i].priority > boxes[best].priority)
        best = i
    }
    // Every bucket holds a single colour, so there is nothing left to separate. Stop
    // short of `count` and let `withClassics` make up the difference.
    if (boxes[best].priority === 0)
      break
    const [low, high] = splitBox(pixels, boxes[best])
    boxes[best] = low
    boxes.push(high)
  }
  return boxes.map(b => pixels.slice(b.lo, b.hi))
}

// Mean colour per non-empty bucket, so the palette is exactly `colorCount` long when
// the image can supply that many distinct colours, and shorter when it cannot.
// `mergeNearDuplicates` may then shorten it further.
export function derivePalette(pixels: Rgb[], colorCount: number): Rgb[] {
  return medianCut(pixels, colorCount)
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

// Derived colours stay first so `targetGrid` indices remain valid. Classics only fill
// the swatch out to `targetLen`, and only when far enough from every derived colour to
// earn a slot — a rich image gets none, a two-tone graphic gets several.
export function withClassics(derived: Rgb[], targetLen: number): Rgb[] {
  const full = [...derived]
  for (const classic of CLASSICS) {
    if (full.length >= targetLen)
      break
    if (!full.some(c => colorDist(c, classic) < CLASSIC_DEDUPE_DIST ** 2))
      full.push(classic)
  }
  return full
}
