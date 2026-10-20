// BP — paint, expanded: the pointer-driven stroke in headless Chromium. Drag lines, brush
// footprint, off-canvas behaviour and the no-smear-across-a-gap rule, none reachable in Node.

import { afterEach, describe, expect, it } from 'vitest'
import { cellPointer, mountCanvas, pointer } from './support'

const W = 10
const H = 10

afterEach(() => {
  document.body.replaceChildren()
})

describe('paint, expanded (browser)', () => {
  it('a drag fills the whole line of cells it crosses', () => {
    const pc = mountCanvas(W, H)
    pc.selectColor(1)
    pc.setBrushSize(1)
    const at = cellPointer(pc, W, H)
    pointer(pc.canvas, 'pointerdown', at(1, 1).x, at(1, 1).y)
    pointer(pc.canvas, 'pointermove', at(3, 1).x, at(3, 1).y)
    pointer(pc.canvas, 'pointermove', at(5, 1).x, at(5, 1).y)
    pointer(pc.canvas, 'pointerup', at(5, 1).x, at(5, 1).y)
    const grid = pc.getGrid()
    for (let cx = 1; cx <= 5; cx++)
      expect(grid[1 * W + cx]).toBe(1)
  })

  it('a larger brush paints more than one cell per press', () => {
    const pc = mountCanvas(W, H)
    pc.selectColor(1)
    pc.setBrushSize(3)
    const at = cellPointer(pc, W, H)
    pointer(pc.canvas, 'pointerdown', at(5, 5).x, at(5, 5).y)
    pointer(pc.canvas, 'pointerup', at(5, 5).x, at(5, 5).y)
    expect(pc.getGrid().filter(cell => cell === 1).length).toBeGreaterThan(1)
  })

  it('an off-canvas drag paints nothing out of range and does not grow the grid', () => {
    const pc = mountCanvas(W, H)
    pc.selectColor(1)
    pc.setBrushSize(1)
    const at = cellPointer(pc, W, H)
    const rect = pc.canvas.getBoundingClientRect()
    pointer(pc.canvas, 'pointerdown', at(9, 9).x, at(9, 9).y)
    pointer(pc.canvas, 'pointermove', rect.right + 200, at(9, 9).y)
    pointer(pc.canvas, 'pointerup', rect.right + 200, at(9, 9).y)
    expect(pc.getGrid()).toHaveLength(W * H)
    expect(pc.getGrid()[9 * W + 9]).toBe(1)
  })

  it('does not smear a line across the gap when the pointer leaves mid-drag', () => {
    const pc = mountCanvas(W, H)
    pc.selectColor(1)
    pc.setBrushSize(1)
    const at = cellPointer(pc, W, H)
    const rect = pc.canvas.getBoundingClientRect()
    pointer(pc.canvas, 'pointerdown', at(0, 0).x, at(0, 0).y)
    pointer(pc.canvas, 'pointermove', rect.right + 300, rect.bottom + 300) // leave the canvas
    pointer(pc.canvas, 'pointermove', at(9, 9).x, at(9, 9).y) // re-enter far away
    pointer(pc.canvas, 'pointerup', at(9, 9).x, at(9, 9).y)
    const grid = pc.getGrid()
    expect(grid[0]).toBe(1) // start painted
    expect(grid[9 * W + 9]).toBe(1) // re-entry painted
    expect(grid[4 * W + 4]).toBe(-1) // the diagonal between was not filled
  })
})
