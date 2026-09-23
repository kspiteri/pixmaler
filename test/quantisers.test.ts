// The candidate quantisers for #107 (Wu, seeded k-means) and the comparison metrics. These pin
// the two properties the /quantise page depends on: the palette is bounded by the requested
// count and separates well-separated colours, and — critically — both are **deterministic**, so
// the same image never yields a different target between runs.

import type { Rgb } from '../src/lib/canvas/palette'
import { describe, expect, it } from 'vitest'
import { kmeansQuantiser, wuQuantiser } from '../src/lib/canvas/quantisers'
import { distinctColoursUsed, paletteSpread, quantiseError } from '../src/lib/canvas/quantisers/metrics'

// A cloud of four well-separated colours, `per` copies each, in a fixed order.
const CORNERS: Rgb[] = [[0, 0, 0], [230, 20, 20], [20, 220, 40], [30, 40, 240]]
function cloud(per: number): Rgb[] {
  const out: Rgb[] = []
  for (let i = 0; i < per; i++) {
    for (const c of CORNERS)
      out.push([...c] as Rgb)
  }
  return out
}
const keyOf = (palette: Rgb[]): string => palette.map(c => c.join(',')).sort().join(' | ')

describe.each([
  ['wu', wuQuantiser],
  ['k-means', kmeansQuantiser],
] as const)('%s quantiser', (_name, quantise) => {
  it('returns no more colours than requested', () => {
    expect(quantise(cloud(50), 4).length).toBeLessThanOrEqual(4)
    expect(quantise(cloud(50), 16).length).toBeLessThanOrEqual(16)
  })

  it('is deterministic — the same pixels give the same palette', () => {
    const pixels = cloud(50)
    expect(keyOf(quantise(pixels, 8))).toBe(keyOf(quantise([...pixels], 8)))
  })

  it('keeps every channel in range', () => {
    for (const [r, g, b] of quantise(cloud(50), 8)) {
      for (const v of [r, g, b]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(255)
      }
    }
  })

  it('recovers four well-separated clusters at count 4', () => {
    // Each cluster is a single colour, so the bucket means land back on the corners exactly.
    expect(keyOf(quantise(cloud(64), 4))).toBe(keyOf(CORNERS))
  })

  it('returns nothing for an empty cloud', () => {
    expect(quantise([], 8)).toEqual([])
  })
})

describe('metrics', () => {
  it('counts the distinct palette entries a target actually paints with', () => {
    expect(distinctColoursUsed([0, 0, 2, 2, 5])).toBe(3)
    expect(distinctColoursUsed([])).toBe(0)
  })

  it('reports zero spread for a palette too small to have neighbours', () => {
    expect(paletteSpread([])).toBe(0)
    expect(paletteSpread([[1, 2, 3]])).toBe(0)
  })

  it('reports a larger spread for colours further apart', () => {
    const tight = paletteSpread([[0, 0, 0], [5, 0, 0], [10, 0, 0]])
    const wide = paletteSpread([[0, 0, 0], [120, 0, 0], [240, 0, 0]])
    expect(wide).toBeGreaterThan(tight)
  })

  it('is zero error when every cell already sits on its palette colour', () => {
    // rgba for two cells: black then red; palette [black, red]; grid maps each to itself.
    const rgba = new Uint8ClampedArray([0, 0, 0, 255, 230, 20, 20, 255])
    expect(quantiseError(rgba, [[0, 0, 0], [230, 20, 20]], [0, 1])).toBe(0)
  })

  it('grows the error as the assigned colour drifts from the source', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 255])
    const near = quantiseError(rgba, [[10, 0, 0]], [0])
    const far = quantiseError(rgba, [[200, 0, 0]], [0])
    expect(far).toBeGreaterThan(near)
    expect(near).toBe(10) // sqrt of (10² averaged over one cell)
  })
})
