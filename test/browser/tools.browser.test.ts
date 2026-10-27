// The editable canvas's tools driven by real pointer events: one block per tool, plus the
// behaviour every tool shares (eyedropper, undo). The geometry behind each footprint is
// pinned in the Node suite; this covers the input, undo and update paths around it.

import type { PixelCanvas } from '@/lib'
import { afterEach, describe, expect, it } from 'vitest'
import { discFootprint } from '@/lib'
import { cellPointer, mountCanvas, pointer } from './support'

const W = 10
const H = 10

afterEach(() => {
  document.body.replaceChildren()
})

// Press and release on one cell.
function click(pc: PixelCanvas, cx: number, cy: number, button = 0) {
  const p = cellPointer(pc, W, H)(cx, cy)
  pointer(pc.canvas, 'pointerdown', p.x, p.y, button)
  if (button === 0)
    pointer(pc.canvas, 'pointerup', p.x, p.y, button)
}

// Cells holding `colour`, as sorted `x,y` strings.
function painted(grid: number[], colour: number, gridW = W): string[] {
  return grid.flatMap((c, i) => (c === colour ? [`${i % gridW},${Math.floor(i / gridW)}`] : [])).sort()
}

async function frames(n: number): Promise<void> {
  for (let i = 0; i < n; i++)
    await new Promise(resolve => requestAnimationFrame(resolve))
}

describe('pencil', () => {
  it('a drag fills the whole line of cells it crosses', () => {
    const pc = mountCanvas(W, H)
    pc.selectColor(1)
    pc.setBrushSize(1)
    const at = cellPointer(pc, W, H)
    pointer(pc.canvas, 'pointerdown', at(1, 1).x, at(1, 1).y)
    pointer(pc.canvas, 'pointermove', at(3, 1).x, at(3, 1).y)
    pointer(pc.canvas, 'pointermove', at(5, 1).x, at(5, 1).y)
    pointer(pc.canvas, 'pointerup', at(5, 1).x, at(5, 1).y)
    expect(painted(pc.getGrid(), 1)).toEqual(['1,1', '2,1', '3,1', '4,1', '5,1'])
  })

  it('size 3 stamps a 3×3 square', () => {
    const pc = mountCanvas(W, H)
    pc.selectColor(1)
    pc.setBrushSize(3)
    click(pc, 5, 5)
    expect(painted(pc.getGrid(), 1)).toEqual(['4,4', '4,5', '4,6', '5,4', '5,5', '5,6', '6,4', '6,5', '6,6'])
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

describe('brush', () => {
  it('size 3 stamps a round plus, not the pencil square', () => {
    const pc = mountCanvas(W, H)
    pc.selectColor(1)
    pc.setTool('brush')
    pc.setBrushSize(3)
    click(pc, 5, 5)
    expect(painted(pc.getGrid(), 1)).toEqual(['4,5', '5,4', '5,5', '5,6', '6,5'])
  })
})

describe('fill', () => {
  it('fills only the clicked region, reports it, and undoes in one step', () => {
    let lastGrid: number[] | null = null
    const pc = mountCanvas(W, H, { onUpdate: (g) => { lastGrid = g } })
    pc.selectColor(1)
    pc.setBrushSize(1)
    // A pencil wall down column 4 splits the paper in two.
    const at = cellPointer(pc, W, H)
    pointer(pc.canvas, 'pointerdown', at(4, 0).x, at(4, 0).y)
    pointer(pc.canvas, 'pointermove', at(4, 9).x, at(4, 9).y)
    pointer(pc.canvas, 'pointerup', at(4, 9).x, at(4, 9).y)
    const walled = pc.getGrid()

    pc.setTool('fill')
    pc.selectColor(2)
    click(pc, 0, 0)
    const grid = pc.getGrid()
    expect(painted(grid, 2)).toHaveLength(40)
    expect(painted(grid, 2).every(c => Number(c.split(',')[0]) < 4)).toBe(true)
    expect(grid[9 * W + 9]).toBe(-1) // the far side of the wall
    expect(lastGrid).toEqual(grid) // the server sees the fill

    expect(pc.undo()).toBe(true)
    expect(pc.getGrid()).toEqual(walled)
  })
})

describe('spray', () => {
  it('builds up checker dots inside the disc while held, and stops on release', async () => {
    const S = 20
    const pc = mountCanvas(S, S)
    pc.selectColor(1)
    pc.setTool('spray')
    pc.setBrushSize(7) // within brushMaxFor(20, 20) = 8
    const at = cellPointer(pc, S, S)(10, 10)
    pointer(pc.canvas, 'pointerdown', at.x, at.y)
    const first = painted(pc.getGrid(), 1, S).length
    expect(first).toBeGreaterThan(0)

    await frames(15)
    const held = painted(pc.getGrid(), 1, S)
    expect(held.length).toBeGreaterThan(first) // holding still keeps spraying
    const disc = new Set(discFootprint(10, 10, 7, S, S))
    for (const cell of held) {
      const [x, y] = cell.split(',').map(Number)
      expect(disc.has(y * S + x)).toBe(true)
      expect((x + y) % 2).toBe(0)
    }

    pointer(pc.canvas, 'pointerup', at.x, at.y)
    const released = painted(pc.getGrid(), 1, S).length
    await frames(5)
    expect(painted(pc.getGrid(), 1, S)).toHaveLength(released)

    expect(pc.undo()).toBe(true) // the whole hold is one step
    expect(painted(pc.getGrid(), 1, S)).toEqual([])
  })

  it('pressing does not leave the hover outline painted on the canvas', () => {
    const S = 20
    const pc = mountCanvas(S, S)
    pc.selectColor(1) // #ff0000
    pc.setTool('spray')
    pc.setBrushSize(7)
    const at = cellPointer(pc, S, S)(10, 10)
    pointer(pc.canvas, 'pointermove', at.x, at.y) // shows the outline preview
    pointer(pc.canvas, 'pointerdown', at.x, at.y)
    pointer(pc.canvas, 'pointerup', at.x, at.y)
    // (10, 7) is on the outline but off the checker, so spray never paints it.
    const cellPx = pc.canvas.width / S
    const [r, g, b] = pc.canvas.getContext('2d')!.getImageData(10 * cellPx + cellPx / 2, 7 * cellPx + cellPx / 2, 1, 1).data
    expect(pc.getGrid()[7 * S + 10]).toBe(-1)
    expect([r, g, b]).not.toEqual([255, 0, 0])
  })
})

describe('every tool', () => {
  it('right-click samples the colour under the cursor and does not paint', () => {
    let picked: number | null = null
    const pc = mountCanvas(W, H, { onPick: (i) => { picked = i } })
    pc.selectColor(2)
    pc.setBrushSize(1)
    click(pc, 0, 0)
    expect(pc.getGrid()[0]).toBe(2)

    pc.selectColor(1)
    const before = pc.getGrid()
    click(pc, 0, 0, 2) // right button
    expect(picked).toBe(2)
    expect(pc.getGrid()).toEqual(before)
  })

  it('a click that changes nothing adds no undo step', () => {
    const pc = mountCanvas(W, H)
    pc.selectColor(1)
    click(pc, 2, 2) // real change
    expect(pc.canUndo()).toBe(true)
    click(pc, 2, 2) // same colour again, no change
    expect(pc.undo()).toBe(true) // one undo restores the pre-stroke grid
    expect(pc.canUndo()).toBe(false) // nothing left, so the no-op added nothing
  })
})
