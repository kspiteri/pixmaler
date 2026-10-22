// Colour science: median-cut derivation, near-duplicate merging, swatch ordering,
// and the quantiser every grid cell goes through.
//
// Split out of `pipeline.ts` so it can be tested without a canvas. These are the
// invariants the swatch and the target both depend on — a palette that is longer
// than the wire allows, or an ordering that loses the index mapping, corrupts
// every drawing in the round rather than just looking wrong.

import type { Rgb } from '../src/lib/canvas/palette'
import { describe, expect, it } from 'vitest'
import { CLASSIC_DEDUPE_DIST, CLASSICS, colorDist, colorName, derivePalette, hexToRgb, medianCut, mergeNearDuplicates, nearestIndex, paletteSortOrder, rgbToHex, rgbToHsl, SAT_THRESHOLD, withClassics } from '../src/lib/canvas/palette'

// A deterministic spread of colours; no randomness, so a failure is reproducible.
function ramp(n: number): Rgb[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / Math.max(1, n - 1)
    return [Math.round(255 * t), Math.round(255 * (1 - t)), (i * 37) % 256] as Rgb
  })
}

// Packs a tuple cloud into the flat RGBA buffer the quantisers now take (stride 4, opaque).
function toRgba(pixels: Rgb[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4)
  for (let i = 0; i < pixels.length; i++) {
    out[i * 4] = pixels[i][0]
    out[i * 4 + 1] = pixels[i][1]
    out[i * 4 + 2] = pixels[i][2]
    out[i * 4 + 3] = 255
  }
  return out
}

describe('hex conversion', () => {
  it('round-trips every channel, including values needing a zero pad', () => {
    const cases: Rgb[] = [[0, 0, 0], [255, 255, 255], [1, 16, 171], [124, 92, 255]]
    for (const [r, g, b] of cases)
      expect(hexToRgb(rgbToHex(r, g, b))).toEqual([r, g, b])
  })

  it('pads single-digit channels so the hex is always six digits', () => {
    expect(rgbToHex(1, 2, 3)).toBe('#010203')
    expect(rgbToHex(0, 0, 0)).toBe('#000000')
  })
})

describe('colorDist', () => {
  it('is zero only for identical colours', () => {
    expect(colorDist([10, 20, 30], [10, 20, 30])).toBe(0)
    expect(colorDist([10, 20, 30], [10, 20, 31])).toBeGreaterThan(0)
  })

  it('is squared, not rooted — 3-4-5 gives 50, not 5√2', () => {
    // Callers only ever compare, and the quantise loop runs once per cell.
    expect(colorDist([0, 0, 0], [3, 4, 5])).toBe(9 + 16 + 25)
  })

  it('is symmetric', () => {
    expect(colorDist([1, 2, 3], [200, 100, 50])).toBe(colorDist([200, 100, 50], [1, 2, 3]))
  })
})

describe('nearestIndex', () => {
  const palette: Rgb[] = [[0, 0, 0], [255, 0, 0], [0, 255, 0]]

  it('finds an exact match', () => {
    expect(nearestIndex([255, 0, 0], palette)).toBe(1)
    expect(nearestIndex([0, 255, 0], palette)).toBe(2)
  })

  it('snaps an off-palette colour to the closest entry', () => {
    expect(nearestIndex([200, 20, 20], palette)).toBe(1)
    expect(nearestIndex([20, 20, 20], palette)).toBe(0)
  })

  it('breaks ties toward the lower index, so the mapping is deterministic', () => {
    // Equidistant from black and red.
    const tie: Rgb[] = [[0, 0, 0], [100, 0, 0]]
    expect(nearestIndex([50, 0, 0], tie)).toBe(0)
  })

  it('always returns an index inside the palette', () => {
    for (const c of ramp(20))
      expect(nearestIndex(c, palette)).toBeLessThan(palette.length)
  })
})

describe('rgbToHsl', () => {
  it('reports greys as fully desaturated', () => {
    for (const grey of [[0, 0, 0], [128, 128, 128], [255, 255, 255]] as Rgb[])
      expect(rgbToHsl(grey).s).toBe(0)
  })

  it('places the primaries on their hue spokes', () => {
    expect(rgbToHsl([255, 0, 0]).h).toBeCloseTo(0)
    expect(rgbToHsl([0, 255, 0]).h).toBeCloseTo(120)
    expect(rgbToHsl([0, 0, 255]).h).toBeCloseTo(240)
  })

  it('keeps hue in 0..360 and saturation and lightness in 0..1', () => {
    for (const c of ramp(40)) {
      const { h, s, l } = rgbToHsl(c)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(360)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
      expect(l).toBeGreaterThanOrEqual(0)
      expect(l).toBeLessThanOrEqual(1)
    }
  })

  it('reads lightness from the extremes, not the mean channel', () => {
    expect(rgbToHsl([0, 0, 0]).l).toBe(0)
    expect(rgbToHsl([255, 255, 255]).l).toBe(1)
    expect(rgbToHsl([255, 0, 0]).l).toBeCloseTo(0.5)
  })
})

describe('medianCut', () => {
  it('splits to exactly the requested bucket count', () => {
    expect(medianCut(toRgba(ramp(64)), 0)).toHaveLength(1)
    expect(medianCut(toRgba(ramp(64)), 1)).toHaveLength(1)
    expect(medianCut(toRgba(ramp(64)), 2)).toHaveLength(2)
    expect(medianCut(toRgba(ramp(64)), 16)).toHaveLength(16)
  })

  it('honours counts that are not powers of two — issue #28', () => {
    // The old signature took a depth and halved at every level, so it could only ever
    // return 2**n buckets. This is the whole point of the priority queue.
    for (const count of [3, 7, 24, 30])
      expect(medianCut(toRgba(ramp(64)), count)).toHaveLength(count)
  })

  it('stops short when the cloud runs out of colours to separate', () => {
    // Three distinct colours cannot make eight buckets. A zero-range bucket has
    // nothing left to split, so the loop ends rather than returning empties.
    const pixels: Rgb[] = [[0, 0, 0], [0, 0, 0], [10, 10, 10], [20, 20, 20]]
    expect(medianCut(toRgba(pixels), 8)).toHaveLength(3)
  })

  it('never returns an empty bucket for a non-empty cloud', () => {
    // Load-bearing: an empty bucket would average to NaN in `derivePalette`.
    for (const bucket of medianCut(toRgba(ramp(30)), 24))
      expect(bucket.length).toBeGreaterThan(0)
  })

  it('keeps every pixel — buckets partition the input', () => {
    const total = medianCut(toRgba(ramp(64)), 16).reduce((n, b) => n + b.length, 0)
    expect(total).toBe(64)
  })

  it('leaves the pixel buffer untouched — it sorts an index permutation', () => {
    // The new contract: `quantiseToPalette` re-reads the same `rgba` after the palette
    // is derived, so median-cut must not reorder it in place.
    const rgba = toRgba([[255, 0, 0], [0, 0, 0], [128, 0, 0]])
    const before = Uint8ClampedArray.from(rgba)
    medianCut(rgba, 2)
    expect(rgba).toEqual(before)
  })

  it('handles an empty cloud without recursing forever', () => {
    expect(medianCut(new Uint8ClampedArray(0), 4)).toEqual([[]])
  })

  it('splits on the widest channel', () => {
    // Blue varies across the full range, red and green not at all, so the split must
    // separate low blue from high blue. Buckets are pixel indices into `rgba`.
    const rgba = toRgba([[10, 10, 0], [10, 10, 255], [10, 10, 10], [10, 10, 240]])
    const [low, high] = medianCut(rgba, 2)
    const blue = (i: number) => rgba[i * 4 + 2]
    expect(Math.max(...low.map(blue))).toBeLessThan(Math.min(...high.map(blue)))
  })
})

describe('derivePalette', () => {
  it('returns exactly as many colours as asked for', () => {
    expect(derivePalette(toRgba(ramp(64)), 16)).toHaveLength(16)
    expect(derivePalette(toRgba(ramp(64)), 8)).toHaveLength(8)
  })

  it('honours a request that is not a power of two — issue #28', () => {
    // Was: depth = ceil(log2(24)) = 5, so a request for 24 silently produced 32. The
    // picker offers 24 and the swatch now matches it.
    expect(derivePalette(toRgba(ramp(64)), 24)).toHaveLength(24)
    expect(derivePalette(toRgba(ramp(64)), 20)).toHaveLength(20)
  })

  it('falls short only when the image has fewer distinct colours', () => {
    // Two colours cannot make sixteen; `withClassics` tops the swatch up instead.
    expect(derivePalette(toRgba([[0, 0, 0], [255, 255, 255]]), 16)).toHaveLength(2)
  })

  it('averages each bucket rather than picking a member', () => {
    // Two pixels, two buckets → one each, so each colour survives exactly.
    expect(derivePalette(toRgba([[0, 0, 0], [10, 20, 30]]), 2)).toEqual([[0, 0, 0], [10, 20, 30]])
    // Both in one bucket at a count of 1 → the mean.
    expect(derivePalette(toRgba([[0, 0, 0], [10, 20, 30]]), 1)).toEqual([[5, 10, 15]])
  })

  it('emits channels inside 0..255 as whole numbers', () => {
    for (const [r, g, b] of derivePalette(toRgba(ramp(50)), 16)) {
      for (const v of [r, g, b]) {
        expect(Number.isInteger(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(255)
      }
    }
  })

  it('never returns an empty palette for a non-empty cloud', () => {
    expect(derivePalette(toRgba([[7, 7, 7]]), 16).length).toBeGreaterThan(0)
  })

  it('returns nothing for an empty cloud rather than a NaN colour', () => {
    expect(derivePalette(new Uint8ClampedArray(0), 16)).toEqual([])
  })
})

// Golden equivalence: the flat `rgba` median-cut must produce the exact palette the original
// tuple implementation did. The real risk in the refactor was a silent palette shift from a
// mishandled sort tie, so this pins the output over clouds built to tie heavily. `ref*` below is
// the pre-refactor algorithm, kept deliberately independent of the code under test.
describe('median-cut golden equivalence (flat vs tuple)', () => {
  interface RefBox { px: Rgb[], ch: number, range: number, priority: number }
  function refMeasure(px: Rgb[]): RefBox {
    let minR = 255; let maxR = 0; let minG = 255; let maxG = 0; let minB = 255; let maxB = 0
    for (const [r, g, b] of px) {
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
    return { px, ch, range, priority: px.length * range }
  }
  function refMedianCut(pixels: Rgb[], count: number): Rgb[][] {
    if (count <= 1 || pixels.length === 0)
      return [pixels]
    const boxes = [refMeasure(pixels)]
    while (boxes.length < count) {
      let best = 0
      for (let i = 1; i < boxes.length; i++) {
        if (boxes[i].priority > boxes[best].priority)
          best = i
      }
      if (boxes[best].priority === 0)
        break
      const b = boxes[best]
      const sorted = [...b.px].sort((x, y) => x[b.ch] - y[b.ch])
      const mid = sorted.length >> 1
      boxes[best] = refMeasure(sorted.slice(0, mid))
      boxes.push(refMeasure(sorted.slice(mid)))
    }
    return boxes.map(box => box.px)
  }
  function refDerive(pixels: Rgb[], count: number): Rgb[] {
    return refMedianCut(pixels, count)
      .filter(b => b.length > 0)
      .map((b) => {
        const sum = b.reduce((a, [r, g, bl]) => [a[0] + r, a[1] + g, a[2] + bl], [0, 0, 0])
        return [Math.round(sum[0] / b.length), Math.round(sum[1] / b.length), Math.round(sum[2] / b.length)] as Rgb
      })
  }

  function mulberry32(seed: number): () => number {
    return () => {
      seed = (seed + 0x6D2B79F5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  // Draw `n` pixels from a small random palette, so exact colour ties are common — the case
  // that a mishandled sort tie would silently reorder.
  function cloud(seed: number, n: number, distinct: number): Rgb[] {
    const rng = mulberry32(seed)
    const palette = Array.from({ length: distinct }, () => [Math.floor(rng() * 256), Math.floor(rng() * 256), Math.floor(rng() * 256)] as Rgb)
    return Array.from({ length: n }, () => palette[Math.floor(rng() * distinct)])
  }

  it('derives a byte-identical palette across seeded clouds and colour counts', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const distinct of [3, 5, 17, 64, 200]) {
        for (const count of [2, 3, 7, 16, 24, 32]) {
          const pixels = cloud(seed, 300, distinct)
          expect(derivePalette(toRgba(pixels), count)).toEqual(refDerive(pixels, count))
        }
      }
    }
  })

  it('partitions pixels into the same buckets, in the same order', () => {
    const pixels = cloud(99, 300, 40)
    const flat = medianCut(toRgba(pixels), 16).map(bucket => bucket.map(i => pixels[i]))
    expect(flat).toEqual(refMedianCut(pixels, 16))
  })
})

describe('mergeNearDuplicates', () => {
  it('leaves a well-separated palette alone', () => {
    const distinct: Rgb[] = [[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255]]
    expect(mergeNearDuplicates(distinct)).toEqual(distinct)
  })

  it('collapses a near-duplicate pair into its mean', () => {
    // 10 units apart on one channel → 100 squared, under the 400 default.
    expect(mergeNearDuplicates([[100, 100, 100], [110, 100, 100]])).toEqual([[105, 100, 100]])
  })

  it('guarantees no surviving pair is within the threshold', () => {
    // The postcondition that matters: it must not stop after one pass. A chain of
    // close colours has to keep collapsing until the invariant holds.
    const chain: Rgb[] = Array.from({ length: 12 }, (_, i) => [100 + i * 6, 100, 100] as Rgb)
    const out = mergeNearDuplicates(chain)
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++)
        expect(colorDist(out[i], out[j])).toBeGreaterThanOrEqual(400)
    }
  })

  it('never grows the palette, and never empties a non-empty one', () => {
    const input = ramp(30)
    const out = mergeNearDuplicates(input)
    expect(out.length).toBeLessThanOrEqual(input.length)
    expect(out.length).toBeGreaterThan(0)
  })

  it('does not mutate the palette it was given', () => {
    const input: Rgb[] = [[100, 100, 100], [110, 100, 100]]
    const before = structuredClone(input)
    mergeNearDuplicates(input)
    expect(input).toEqual(before)
  })

  it('respects a custom threshold', () => {
    const pair: Rgb[] = [[100, 100, 100], [140, 100, 100]] // 1600 apart
    expect(mergeNearDuplicates(pair, 400)).toHaveLength(2)
    expect(mergeNearDuplicates(pair, 2000)).toHaveLength(1)
  })
})

describe('paletteSortOrder', () => {
  it('returns a permutation of the input indices', () => {
    // Load-bearing: the caller remaps targetGrid through this, so a missing or
    // duplicated index silently repaints cells the wrong colour.
    const palette = ramp(24)
    const order = paletteSortOrder(palette)
    expect(order).toHaveLength(palette.length)
    expect([...order].sort((a, b) => a - b)).toEqual(palette.map((_, i) => i))
  })

  it('puts achromatic colours before chromatic ones', () => {
    const palette: Rgb[] = [[255, 0, 0], [128, 128, 128], [0, 255, 0], [0, 0, 0]]
    const ordered = paletteSortOrder(palette).map(i => palette[i])
    const firstChromatic = ordered.findIndex(c => rgbToHsl(c).s >= SAT_THRESHOLD)
    const lastAchromatic = ordered.reduce((last, c, i) => rgbToHsl(c).s < SAT_THRESHOLD ? i : last, -1)
    expect(lastAchromatic).toBeLessThan(firstChromatic)
  })

  it('sorts greys dark to light', () => {
    const greys: Rgb[] = [[200, 200, 200], [0, 0, 0], [100, 100, 100]]
    expect(paletteSortOrder(greys).map(i => greys[i])).toEqual([[0, 0, 0], [100, 100, 100], [200, 200, 200]])
  })

  it('sorts chromatic colours by hue', () => {
    const hues: Rgb[] = [[0, 0, 255], [255, 0, 0], [0, 255, 0]] // 240, 0, 120
    expect(paletteSortOrder(hues).map(i => hues[i])).toEqual([[255, 0, 0], [0, 255, 0], [0, 0, 255]])
  })

  it('handles an empty palette', () => {
    expect(paletteSortOrder([])).toEqual([])
  })
})

describe('withClassics', () => {
  it('keeps the derived colours as the prefix, so grid indices stay valid', () => {
    const derived: Rgb[] = [[10, 20, 30], [40, 50, 60]]
    expect(withClassics(derived, 8).slice(0, derived.length)).toEqual(derived)
  })

  it('fills the swatch out to the requested count', () => {
    expect(withClassics([[120, 130, 125]], 4)).toHaveLength(4)
  })

  it('adds nothing once the derived colours fill the count', () => {
    // The count is the whole swatch, so an image with enough colour of its own spends
    // every slot on itself and gets no classics at all.
    const derived: Rgb[] = [[120, 130, 125], [10, 200, 10]]
    expect(withClassics(derived, 2)).toEqual(derived)
    expect(withClassics(derived, 1)).toEqual(derived)
  })

  it('has enough candidates to fill the picker\'s largest count', () => {
    // 32 is the most the picker offers, and an all-white upload derives exactly one
    // colour — which also dedupes the white candidate away. 31 candidates would leave
    // the player one slot short, so the ramp has to carry more than that.
    expect(CLASSICS.length).toBeGreaterThan(32)
    expect(withClassics([[255, 255, 255]], 32)).toHaveLength(32)
  })

  it('keeps every candidate distinguishable from the others', () => {
    // Load-bearing for the fill: a candidate closer than the dedupe distance to an
    // earlier one can never be used, so the ramp would quietly stop filling.
    for (let i = 0; i < CLASSICS.length; i++) {
      for (let j = i + 1; j < CLASSICS.length; j++)
        expect(colorDist(CLASSICS[i], CLASSICS[j])).toBeGreaterThanOrEqual(CLASSIC_DEDUPE_DIST ** 2)
    }
  })

  it('leads with the six base colours, coarsest first', () => {
    // The fill is greedy from the front, so a two-slot gap must yield black and white
    // rather than black and the grey next to it.
    expect(withClassics([[120, 130, 125]], 3)).toEqual([[120, 130, 125], [0, 0, 0], [255, 255, 255]])
  })

  it('drops a classic the image already covers', () => {
    // Pure black is a classic; a derived near-black makes it redundant, and the ramp
    // fills the freed slot from further down instead.
    const out = withClassics([[2, 2, 2]], 32)
    expect(out).toHaveLength(32)
    expect(out).not.toContainEqual([0, 0, 0])
  })

  it('uses the dedupe distance as its cutoff', () => {
    const justInside: Rgb = [CLASSIC_DEDUPE_DIST - 2, 0, 0]
    const justOutside: Rgb = [CLASSIC_DEDUPE_DIST + 2, 0, 0]
    expect(withClassics([justInside], 8)).not.toContainEqual([0, 0, 0])
    expect(withClassics([justOutside], 8)).toContainEqual([0, 0, 0])
  })

  it('does not mutate the derived palette', () => {
    const derived: Rgb[] = [[10, 20, 30]]
    withClassics(derived, 8)
    expect(derived).toEqual([[10, 20, 30]])
  })
})

// The three stages compose into the number the GM actually sees, so the promise the
// picker makes is only kept by the composition — issue #28 was that nothing checked it.
describe('the swatch the pipeline builds', () => {
  const swatchFor = (pixels: Rgb[], count: number) =>
    withClassics(mergeNearDuplicates(derivePalette(toRgba(pixels), count)), count)

  it('never hands back more colours than the GM asked for', () => {
    for (const count of [8, 16, 24, 32])
      expect(swatchFor(ramp(200), count)).toHaveLength(count)
  })

  it('fills the count even when the image has nothing to give', () => {
    // A single flat colour — the all-white upload case. The image supplies one swatch
    // and the ramp supplies the other 31.
    const flat: Rgb[] = Array.from({ length: 100 }, () => [90, 60, 40] as Rgb)
    expect(swatchFor(flat, 32)).toHaveLength(32)
    expect(swatchFor(flat, 8)).toHaveLength(8)
  })

  it('still cannot exceed the count it was given', () => {
    // The ramp is longer than the largest request, so the cap is what holds the line.
    const flat: Rgb[] = Array.from({ length: 100 }, () => [90, 60, 40] as Rgb)
    for (const count of [1, 2, 5, 8, 16, 24, 32])
      expect(swatchFor(flat, count)).toHaveLength(count)
  })
})

describe('colorName', () => {
  it('names the achromatic ramp by lightness, with no hue', () => {
    expect(colorName('#000000')).toBe('black')
    expect(colorName('#ffffff')).toBe('white')
    expect(colorName('#202020')).toBe('dark grey')
    expect(colorName('#808080')).toBe('grey')
    expect(colorName('#d8d8d8')).toBe('light grey')
  })

  it('names a hue family with a lightness qualifier', () => {
    expect(colorName('#dc3232')).toBe('red')
    expect(colorName('#3264dc')).toBe('blue')
    expect(colorName('#b0c8ff')).toBe('pale blue')
    expect(colorName('#0a1f3d')).toBe('dark blue')
  })

  it('reads a warm dark muted colour as brown, not "dark orange"', () => {
    expect(colorName('#462d1c')).toBe('dark brown')
    expect(colorName('#8a6440')).toBe('brown')
  })

  it('never spells out the hex — always a spoken word', () => {
    // A screen reader must never hear a "#", whatever the input.
    for (const hex of ['#21110e', '#c8ff2d', '#8c7aff', '#00ffff', '#ff00ff'])
      expect(colorName(hex)).not.toContain('#')
  })
})
