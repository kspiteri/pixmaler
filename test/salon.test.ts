// The salon wall's 3-row packing (#87): a piece's grid span is keyed to the GM's aspect ratio,
// and every hung item — piece, original or filler — fits the three-row band. These pin the span
// contract so a revert to the old 12-row equal-area maths (which spanned up to 6 rows) fails.

import type { GalleryMsg, Submission } from '../src/lib/protocol/types'
import { describe, expect, it } from 'vitest'
import { useSalonWall } from '../src/lib/composables/useSalonWall'

const palette = ['#111', '#222', '#333', '#444']
const cells = (n: number) => Array.from({ length: n }, (_, i) => i % palette.length)

function gallery(gridW: number, gridH: number, count = 6): GalleryMsg {
  const submissions: Submission[] = Array.from({ length: count }, (_, i) => ({ submissionId: `s${i}`, grid: cells(gridW * gridH) }))
  return { type: 'gallery', submissions, palette, gridW, gridH }
}
function wall(g: GalleryMsg, target: number[] | null = null) {
  return useSalonWall(g, g.submissions, target).wallItems.value
}
const pieces = (g: GalleryMsg) => wall(g).filter(i => i.kind === 'piece')

describe('useSalonWall span', () => {
  it('gives a portrait piece a tall 1×2 span', () => {
    for (const p of pieces(gallery(20, 30)))
      expect([p.colSpan, p.rowSpan]).toEqual([1, 2])
  })

  it('gives a landscape piece a wide 2×1 span', () => {
    for (const p of pieces(gallery(30, 20)))
      expect([p.colSpan, p.rowSpan]).toEqual([2, 1])
  })

  it('gives a square piece the 1×1 unit', () => {
    for (const p of pieces(gallery(24, 24)))
      expect([p.colSpan, p.rowSpan]).toEqual([1, 1])
  })

  it('gives every real piece the same span — they all share the GM ratio', () => {
    const spans = new Set(pieces(gallery(20, 30, 8)).map(p => `${p.colSpan}x${p.rowSpan}`))
    expect(spans.size).toBe(1)
  })

  it('keeps every hung item inside the three-row band, even at extreme ratios', () => {
    // Includes a very wide (90×20) and very tall (20×90) target: the span must clamp into the
    // band rather than escaping it, which is what a 12-row grid could not do.
    for (const [w, h] of [[20, 30], [30, 20], [24, 24], [90, 20], [20, 90]] as const) {
      for (const item of wall(gallery(w, h), cells(w * h))) {
        expect(item.rowSpan).toBeGreaterThanOrEqual(1)
        expect(item.rowSpan).toBeLessThanOrEqual(3)
        expect(item.colSpan).toBeGreaterThanOrEqual(1)
        expect(item.colSpan).toBeLessThanOrEqual(3)
      }
    }
  })
})
