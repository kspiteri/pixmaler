// BM — hover-marker mirror: the read-only original's crosshair, drawn and then
// restored pixel-for-pixel. Needs a real canvas to read back, so out of the Node suite.

import { afterEach, describe, expect, it } from 'vitest'
import { PixelCanvas } from '@/lib'
import { palette } from './support'

const W = 10
const H = 10
const RED = 1 // palette index painted across the whole original

afterEach(() => {
  document.body.replaceChildren()
})

describe('hover-marker mirror (browser)', () => {
  it('draws the crosshair around the cell and restores the image on clear', () => {
    const pc = new PixelCanvas({ gridW: W, gridH: H, palette, editable: false, targetGrid: Array.from<number>({ length: W * H }).fill(RED) })
    document.body.append(pc.canvas)
    const ctx = pc.canvas.getContext('2d')!

    // The crosshair's vertical line passes through the centre of the marked cell's column.
    const colPx = 5 * 14 + 7 // CELL_SIZE 14, cell x=5
    const row = 20 // well clear of the horizontal line at y=77

    const px = (x: number): [number, number, number, number] => {
      const d = ctx.getImageData(x, row, 1, 1).data
      return [d[0], d[1], d[2], d[3]]
    }

    // Before: the column reads as the flat red image.
    expect(px(colPx)).toEqual([255, 0, 0, 255])

    pc.showMarker({ x: 5, y: 5 })

    // Across the drawn band: a cyan core pixel and darkened halo edges, none still plain red.
    const band = ctx.getImageData(colPx - 3, row, 8, 1).data
    let sawHalo = false
    let sawCyan = false
    for (let i = 0; i < band.length; i += 4) {
      const [r, g, b] = [band[i], band[i + 1], band[i + 2]]
      if (r < 200 && g < 40 && b < 40)
        sawHalo = true // red darkened by the black halo
      if (r < 80 && g > 120 && b > 120)
        sawCyan = true // the cyan crosshair core
    }
    expect(sawHalo).toBe(true)
    expect(sawCyan).toBe(true)

    pc.showMarker(null)

    // After: the whole band is back to the flat red image, no halo left behind.
    const restored = ctx.getImageData(colPx - 3, row, 8, 1).data
    for (let i = 0; i < restored.length; i += 4)
      expect([restored[i], restored[i + 1], restored[i + 2], restored[i + 3]]).toEqual([255, 0, 0, 255])
  })
})
