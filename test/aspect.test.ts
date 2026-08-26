// Grid-shape helpers: brush sizing, the `--art-ratio` value, the drawing shell's
// row/column choice, and the target-shape geometry that replaced "whatever ratio
// the upload happened to be".
//
// An arbitrary ratio meant the drawing shell could not fit the canvas to its box
// reliably — it overflowed its parent and got clipped, putting the grid's last
// columns outside the window. Three known shapes make the fit predictable, so
// these are the invariants that keep it that way.

import { describe, expect, it } from 'vitest'
import {
  artRatio,
  brushMaxFor,
  CROP_MIN_ZOOM,
  cropRect,
  defaultBrushFor,
  FULL_CROP,
  maxCropSize,
  nearestRatioFor,
  orientationFor,
  ratioBox,
  TARGET_RATIO_IDS,
  TARGET_RATIOS,
} from '../src/lib/aspect'

describe('brushMaxFor', () => {
  it('scales with the longest side', () => {
    expect(brushMaxFor(160, 80)).toBe(20)
    expect(brushMaxFor(80, 160)).toBe(20)
  })

  it('never drops below 8, so a small grid still has a usable range', () => {
    // A single cell already dominates a tiny image; the slider still needs travel.
    expect(brushMaxFor(8, 8)).toBe(8)
    expect(brushMaxFor(1, 1)).toBe(8)
  })

  it('caps at 40 on a dense grid', () => {
    expect(brushMaxFor(512, 512)).toBe(40)
    expect(brushMaxFor(384, 171)).toBe(40)
  })
})

describe('defaultBrushFor', () => {
  it('gives a stroke that shows up without touching the slider', () => {
    // ~1/64 of the longest side. 384 cells is where `brush: 6` comes from.
    expect(defaultBrushFor(384, 171)).toBe(6)
    expect(defaultBrushFor(128, 128)).toBe(2)
  })

  it('stays at least one cell', () => {
    expect(defaultBrushFor(1, 1)).toBe(1)
    expect(defaultBrushFor(61, 27)).toBe(1)
  })

  it('never exceeds its own maximum', () => {
    for (const [w, h] of [[1, 1], [61, 41], [128, 128], [384, 171], [512, 512]])
      expect(defaultBrushFor(w, h)).toBeLessThanOrEqual(brushMaxFor(w, h))
  })
})

describe('artRatio', () => {
  it('formats the grid for the CSS aspect-ratio property', () => {
    expect(artRatio(61, 41)).toBe('61 / 41')
    expect(artRatio(22, 22)).toBe('22 / 22')
  })

  it('degrades to 1 / 1 rather than collapsing a slot to zero height', () => {
    for (const [w, h] of [[0, 10], [10, 0], [-5, 5], [0, 0]])
      expect(artRatio(w, h)).toBe('1 / 1')
  })
})

describe('orientationFor', () => {
  it('sits the canvases side by side when the viewport is relatively wider', () => {
    expect(orientationFor(22, 22, 1600, 900)).toBe('row')
  })

  it('stacks them when the viewport is relatively taller', () => {
    expect(orientationFor(61, 27, 900, 1600)).toBe('column')
  })

  it('prefers a row when the ratios match exactly', () => {
    expect(orientationFor(3, 2, 1500, 1000)).toBe('row')
  })

  it('falls back to a row on degenerate input', () => {
    const cases: [number, number, number, number][] = [
      [0, 10, 100, 100],
      [10, 0, 100, 100],
      [10, 10, 0, 100],
      [10, 10, 100, 0],
    ]
    for (const [gw, gh, vw, vh] of cases)
      expect(orientationFor(gw, gh, vw, vh)).toBe('row')
  })
})

describe('nearestRatioFor', () => {
  it('matches each shape to itself', () => {
    expect(nearestRatioFor(1200, 800)).toBe('landscape') // exactly 3:2
    expect(nearestRatioFor(800, 800)).toBe('square')
    expect(nearestRatioFor(800, 1200)).toBe('portrait') // exactly 2:3
  })

  it('rounds a panorama to landscape and a tower to portrait', () => {
    expect(nearestRatioFor(1568, 697)).toBe('landscape') // 2.25:1
    expect(nearestRatioFor(697, 1568)).toBe('portrait')
  })

  it('treats the two steps away from square symmetrically', () => {
    // The boundary sits at the geometric mean of the two shapes, so "one notch
    // toward landscape" and "one notch toward portrait" are the same distance.
    // A raw w/h compare would put the landscape boundary at 1.25 and the portrait
    // one at 0.833, biasing every square-ish portrait into landscape.
    const landscapeEdge = Math.sqrt(1.5) // ≈1.2247, midpoint of 1:1 and 3:2
    const portraitEdge = Math.sqrt(2 / 3) // ≈0.8165, midpoint of 1:1 and 2:3
    expect(nearestRatioFor(landscapeEdge * 1.02 * 1000, 1000)).toBe('landscape')
    expect(nearestRatioFor(landscapeEdge * 0.98 * 1000, 1000)).toBe('square')
    expect(nearestRatioFor(portraitEdge * 0.98 * 1000, 1000)).toBe('portrait')
    expect(nearestRatioFor(portraitEdge * 1.02 * 1000, 1000)).toBe('square')
    // The two boundaries are reciprocals — that is the symmetry.
    expect(landscapeEdge * portraitEdge).toBeCloseTo(1, 10)
  })

  it('falls back to a real shape on a degenerate source', () => {
    expect(TARGET_RATIO_IDS).toContain(nearestRatioFor(0, 0))
    expect(TARGET_RATIO_IDS).toContain(nearestRatioFor(-5, 10))
  })
})

describe('ratioBox', () => {
  it('puts maxSide on the longer axis and keeps the shape', () => {
    expect(ratioBox('landscape', 768)).toEqual({ w: 768, h: 512 })
    expect(ratioBox('portrait', 768)).toEqual({ w: 512, h: 768 })
    expect(ratioBox('square', 768)).toEqual({ w: 768, h: 768 })
  })

  it('never returns a zero axis at a tiny cap', () => {
    for (const id of TARGET_RATIO_IDS) {
      const { w, h } = ratioBox(id, 1)
      expect(w).toBeGreaterThanOrEqual(1)
      expect(h).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('maxCropSize', () => {
  it('fills the source when the shape already matches', () => {
    expect(maxCropSize(1200, 800, 'landscape')).toEqual({ sw: 1200, sh: 800 })
  })

  it('trims the overlong axis only', () => {
    // 2.25:1 source into 3:2 — full height, narrower width.
    expect(maxCropSize(1568, 697, 'landscape')).toEqual({ sw: 1046, sh: 697 })
    // Square source into 3:2 — full width, shorter height.
    expect(maxCropSize(800, 800, 'landscape')).toEqual({ sw: 800, sh: 533 })
  })

  it('always fits inside the source', () => {
    for (const id of TARGET_RATIO_IDS) {
      const { sw, sh } = maxCropSize(1568, 697, id)
      expect(sw).toBeLessThanOrEqual(1568)
      expect(sh).toBeLessThanOrEqual(697)
    }
  })
})

describe('cropRect', () => {
  it('centres a full crop', () => {
    // 1046 wide inside 1568 leaves 522 to split.
    expect(cropRect(1568, 697, 'landscape', FULL_CROP)).toEqual({ sx: 261, sy: 0, sw: 1046, sh: 697 })
  })

  it('pans along the trimmed axis', () => {
    const left = cropRect(1568, 697, 'landscape', { cx: 0, cy: 0.5, zoom: 1 })
    const right = cropRect(1568, 697, 'landscape', { cx: 1, cy: 0.5, zoom: 1 })
    expect(left.sx).toBe(0)
    expect(right.sx).toBe(1568 - 1046)
    expect(left.sw).toBe(right.sw)
  })

  it('stays inside the source however far the centre is pushed', () => {
    for (const cx of [-5, -0.2, 0, 0.5, 1, 1.4, 9]) {
      for (const cy of [-5, 0.5, 9]) {
        for (const zoom of [CROP_MIN_ZOOM, 0.5, 1]) {
          const r = cropRect(1568, 697, 'landscape', { cx, cy, zoom })
          expect(r.sx).toBeGreaterThanOrEqual(0)
          expect(r.sy).toBeGreaterThanOrEqual(0)
          expect(r.sx + r.sw).toBeLessThanOrEqual(1568)
          expect(r.sy + r.sh).toBeLessThanOrEqual(697)
        }
      }
    }
  })

  it('keeps the requested shape at every zoom', () => {
    const want = TARGET_RATIOS.landscape.w / TARGET_RATIOS.landscape.h
    for (const zoom of [CROP_MIN_ZOOM, 0.45, 0.8, 1]) {
      const { sw, sh } = cropRect(1568, 697, 'landscape', { cx: 0.5, cy: 0.5, zoom })
      expect(Math.abs(sw / sh - want)).toBeLessThan(0.01)
    }
  })

  it('clamps zoom to the usable range', () => {
    const tooSmall = cropRect(1568, 697, 'landscape', { cx: 0.5, cy: 0.5, zoom: 0 })
    const atFloor = cropRect(1568, 697, 'landscape', { cx: 0.5, cy: 0.5, zoom: CROP_MIN_ZOOM })
    const tooBig = cropRect(1568, 697, 'landscape', { cx: 0.5, cy: 0.5, zoom: 4 })
    const atMax = cropRect(1568, 697, 'landscape', { cx: 0.5, cy: 0.5, zoom: 1 })
    expect(tooSmall).toEqual(atFloor)
    expect(tooBig).toEqual(atMax)
  })

  it('defaults to the full frame', () => {
    expect(cropRect(1568, 697, 'landscape')).toEqual(cropRect(1568, 697, 'landscape', FULL_CROP))
  })
})
