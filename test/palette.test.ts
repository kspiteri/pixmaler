// Colour science: median-cut derivation, near-duplicate merging, swatch ordering,
// and the quantiser every grid cell goes through.
//
// Split out of `pipeline.ts` so it can be tested without a canvas. These are the
// invariants the swatch and the target both depend on — a palette that is longer
// than the wire allows, or an ordering that loses the index mapping, corrupts
// every drawing in the round rather than just looking wrong.

import type { Rgb } from '../src/lib/palette'
import { describe, expect, it } from 'vitest'
import {
  CLASSIC_DEDUPE_DIST,
  CLASSICS,
  colorDist,
  derivePalette,
  hexToRgb,
  medianCut,
  mergeNearDuplicates,
  nearestIndex,
  paletteSortOrder,

  rgbToHex,
  rgbToHsl,
  SAT_THRESHOLD,
  withClassics,
} from '../src/lib/palette'

// A deterministic spread of colours; no randomness, so a failure is reproducible.
function ramp(n: number): Rgb[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / Math.max(1, n - 1)
    return [Math.round(255 * t), Math.round(255 * (1 - t)), (i * 37) % 256] as Rgb
  })
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
  it('splits to a power of two buckets', () => {
    expect(medianCut(ramp(64), 0)).toHaveLength(1)
    expect(medianCut(ramp(64), 1)).toHaveLength(2)
    expect(medianCut(ramp(64), 4)).toHaveLength(16)
  })

  it('keeps every pixel — buckets partition the input', () => {
    const pixels = ramp(64)
    const total = medianCut(pixels, 4).reduce((n, b) => n + b.length, 0)
    expect(total).toBe(64)
  })

  it('sorts its input in place, which callers must expect', () => {
    // Documented, not accidental: copying 262144 triples per run would be waste.
    // Anything needing the original order has to copy first.
    const pixels: Rgb[] = [[255, 0, 0], [0, 0, 0], [128, 0, 0]]
    const before = [...pixels]
    medianCut(pixels, 1)
    expect(pixels).not.toEqual(before)
    expect(pixels).toHaveLength(3)
  })

  it('handles an empty cloud without recursing forever', () => {
    expect(medianCut([], 4)).toEqual([[]])
  })

  it('splits on the widest channel', () => {
    // Blue varies across the full range, red and green not at all, so the split
    // must separate low blue from high blue.
    const pixels: Rgb[] = [[10, 10, 0], [10, 10, 255], [10, 10, 10], [10, 10, 240]]
    const [low, high] = medianCut(pixels, 1)
    expect(Math.max(...low.map(p => p[2]))).toBeLessThan(Math.min(...high.map(p => p[2])))
  })
})

describe('derivePalette', () => {
  it('returns one colour per non-empty bucket', () => {
    expect(derivePalette(ramp(64), 16)).toHaveLength(16)
    expect(derivePalette(ramp(64), 8)).toHaveLength(8)
  })

  it('rounds the request up to a power of two, so 24 can yield 32', () => {
    // Depth is ceil(log2(colorCount)), so a non-power-of-two request overshoots.
    // The picker offers 24; this is what it actually produces.
    expect(derivePalette(ramp(64), 24)).toHaveLength(32)
  })

  it('averages each bucket rather than picking a member', () => {
    // Two pixels, depth 1 → one bucket each, so each colour survives exactly.
    expect(derivePalette([[0, 0, 0], [10, 20, 30]], 2)).toEqual([[0, 0, 0], [10, 20, 30]])
    // Both in one bucket at depth 0 → the mean.
    expect(derivePalette([[0, 0, 0], [10, 20, 30]], 1)).toEqual([[5, 10, 15]])
  })

  it('emits channels inside 0..255 as whole numbers', () => {
    for (const [r, g, b] of derivePalette(ramp(50), 16)) {
      for (const v of [r, g, b]) {
        expect(Number.isInteger(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(255)
      }
    }
  })

  it('never returns an empty palette for a non-empty cloud', () => {
    expect(derivePalette([[7, 7, 7]], 16).length).toBeGreaterThan(0)
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
    expect(withClassics(derived).slice(0, derived.length)).toEqual(derived)
  })

  it('appends every classic when none is close to a derived colour', () => {
    expect(withClassics([[120, 130, 125]])).toHaveLength(1 + CLASSICS.length)
  })

  it('drops a classic the image already covers', () => {
    // Pure black is a classic; a derived near-black makes it redundant.
    const out = withClassics([[2, 2, 2]])
    expect(out).toHaveLength(CLASSICS.length) // black dropped, 5 added
    expect(out).not.toContainEqual([0, 0, 0])
  })

  it('uses the dedupe distance as its cutoff', () => {
    const justInside: Rgb = [CLASSIC_DEDUPE_DIST - 2, 0, 0]
    const justOutside: Rgb = [CLASSIC_DEDUPE_DIST + 2, 0, 0]
    expect(withClassics([justInside])).not.toContainEqual([0, 0, 0])
    expect(withClassics([justOutside])).toContainEqual([0, 0, 0])
  })

  it('does not mutate the derived palette', () => {
    const derived: Rgb[] = [[10, 20, 30]]
    withClassics(derived)
    expect(derived).toEqual([[10, 20, 30]])
  })
})
