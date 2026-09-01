// Geometry of the image pipeline — the part that decides how many cells a source
// becomes, and which source pixel each cell reads from.
//
// These two are the pieces that issue #4 got wrong. The old path ran the source
// through a downscale → upscale → point-sample round-trip whose destination rect
// was a few px wider than the canvas it drew into, so content fell off the right
// and bottom edges, and whose block pitch was derived from a rounded grid size
// while the layout used a fractional one, so sampling drifted along each axis.
//
// The fix made both impossible by construction: the grid *is* the downscale, so
// cell (x, y) is pixel (x, y). That is the invariant these tests pin down.

import { describe, expect, it } from 'vitest'
import {
  gridSizeFor,
  isMobileWarning,
  MOBILE_WARN_GRID,
  quantiseToPalette,
  unsupportedImage,
} from '../src/lib/pipeline'

describe('isMobileWarning', () => {
  it('warns only above the threshold, not at it', () => {
    expect(isMobileWarning(MOBILE_WARN_GRID)).toBe(false)
    expect(isMobileWarning(MOBILE_WARN_GRID + 1)).toBe(true)
    expect(isMobileWarning(1)).toBe(false)
  })

  it('agrees with the grid the pipeline actually produces', () => {
    // The GM sets scale, not cell count, so the warning has to be derived from
    // the resulting grid rather than from the slider position.
    const coarse = gridSizeFor(768, 512, 8) // 61x41
    const dense = gridSizeFor(768, 512, 50) // 384x256
    expect(isMobileWarning(Math.max(coarse.gridW, coarse.gridH))).toBe(false)
    expect(isMobileWarning(Math.max(dense.gridW, dense.gridH))).toBe(true)
  })
})

describe('gridSizeFor', () => {
  it('yields scale% of each source axis', () => {
    expect(gridSizeFor(768, 410, 8)).toEqual({ gridW: 61, gridH: 33 })
    expect(gridSizeFor(768, 410, 45)).toEqual({ gridW: 346, gridH: 185 })
    expect(gridSizeFor(100, 100, 25)).toEqual({ gridW: 25, gridH: 25 })
  })

  it('rounds rather than truncating, so an axis is never cropped to fit', () => {
    // 768 * 0.08 = 61.44 → 61; 410 * 0.08 = 32.8 → 33 (floor would give 32).
    expect(gridSizeFor(410, 410, 8)).toEqual({ gridW: 33, gridH: 33 })
  })

  it('keeps at least one cell per axis at extreme scales', () => {
    // 8 * 0.01 = 0.08 → rounds to 0, which would collapse the grid.
    expect(gridSizeFor(8, 8, 1)).toEqual({ gridW: 1, gridH: 1 })
    expect(gridSizeFor(1, 1, 1)).toEqual({ gridW: 1, gridH: 1 })
  })

  it('preserves source aspect to within rounding', () => {
    const { gridW, gridH } = gridSizeFor(768, 410, 8)
    expect(Math.abs(gridW / gridH - 768 / 410)).toBeLessThan(0.05)
  })
})

describe('quantiseToPalette', () => {
  const RED: [number, number, number] = [255, 0, 0]
  const GREEN: [number, number, number] = [0, 255, 0]
  const BLUE: [number, number, number] = [0, 0, 255]
  const palette = [RED, GREEN, BLUE]

  // Build a gridW × gridH RGBA buffer from a row-major list of colours.
  function buffer(colours: [number, number, number][]): Uint8ClampedArray {
    const rgba = new Uint8ClampedArray(colours.length * 4)
    colours.forEach(([r, g, b], i) => {
      rgba[i * 4] = r
      rgba[i * 4 + 1] = g
      rgba[i * 4 + 2] = b
      rgba[i * 4 + 3] = 255
    })
    return rgba
  }

  it('maps cell (x, y) to pixel (x, y), row-major', () => {
    // 3x2: two rows of red, green, blue.
    const grid = quantiseToPalette(buffer([RED, GREEN, BLUE, BLUE, GREEN, RED]), 3, 2, palette)
    expect(grid).toEqual([0, 1, 2, 2, 1, 0])
  })

  it('represents the last column and the last row', () => {
    // The regression from #4: content in the final column/row was discarded.
    // Only the bottom-right cell is blue, so it can only be found by reading
    // the very last pixel of the buffer.
    const colours: [number, number, number][] = [RED, RED, RED, RED, RED, BLUE]
    const grid = quantiseToPalette(buffer(colours), 3, 2, palette)
    expect(grid).toEqual([0, 0, 0, 0, 0, 2])
    expect(grid.at(-1)).toBe(2)
  })

  it('returns exactly one index per cell', () => {
    const colours = Array.from<[number, number, number]>({ length: 61 * 33 }).fill(RED)
    expect(quantiseToPalette(buffer(colours), 61, 33, palette)).toHaveLength(61 * 33)
  })

  it('snaps an off-palette colour to its nearest entry', () => {
    // Dark red is closer to red than to green or blue.
    const grid = quantiseToPalette(buffer([[120, 20, 20]]), 1, 1, palette)
    expect(grid).toEqual([0])
  })

  it('emits only valid palette indices', () => {
    const colours: [number, number, number][] = [[10, 200, 10], [200, 200, 10], [10, 10, 200], [90, 90, 90]]
    for (const index of quantiseToPalette(buffer(colours), 2, 2, palette)) {
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(palette.length)
    }
  })
})

describe('unsupportedImage', () => {
  const file = (name: string, type: string) => new File([''], name, { type })

  it('refuses vector images, which the browser will not decode', () => {
    // `createImageBitmap` rejects an SVG outright, and an `<img>` renders it anyway, so
    // without this the crop preview looks fine while the target fails.
    expect(unsupportedImage(file('logo.svg', 'image/svg+xml'))).toBe('vector')
    expect(unsupportedImage(file('logo.svg', 'image/svg'))).toBe('vector')
  })

  it('refuses anything that is not an image at all', () => {
    expect(unsupportedImage(file('deck.pdf', 'application/pdf'))).toBe('not-image')
    expect(unsupportedImage(file('notes.txt', 'text/plain'))).toBe('not-image')
  })

  it('passes the raster formats the pipeline can sample', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/avif'])
      expect(unsupportedImage(file(`shot.${type.slice(6)}`, type))).toBeNull()
  })

  it('passes HEIC, which only some browsers decode', () => {
    // Safari reads an iPhone photo; Chrome does not. Refusing it here would break the
    // browsers that can, so the decode attempt decides and reports for itself.
    expect(unsupportedImage(file('IMG_0001.heic', 'image/heic'))).toBeNull()
  })

  it('passes a file whose type the system left blank', () => {
    // An unusual extension can produce an empty type for a perfectly good PNG, so the
    // browser's own decode is a better judge than the guess.
    expect(unsupportedImage(file('screenshot', ''))).toBeNull()
  })
})
