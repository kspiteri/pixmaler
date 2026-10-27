// The editable canvas's tools driven by real pointer events: one block per tool, plus the
// behaviour every tool shares (eyedropper, undo). The geometry behind each footprint is
// pinned in the Node suite; this covers the input, undo and update paths around it.

import type { PixelCanvas } from '@/lib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CANVAS_TOOLS, discFootprint } from '@/lib'
import { cellPointer, destroyCanvases, mountCanvas, pointer } from './support'

const W = 10
const H = 10

afterEach(() => {
  destroyCanvases()
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
    pc.setToolSize(1)
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
    pc.setToolSize(3)
    click(pc, 5, 5)
    expect(painted(pc.getGrid(), 1)).toEqual(['4,4', '4,5', '4,6', '5,4', '5,5', '5,6', '6,4', '6,5', '6,6'])
  })

  it('an off-canvas drag paints nothing out of range and does not grow the grid', () => {
    const pc = mountCanvas(W, H)
    pc.selectColor(1)
    pc.setToolSize(1)
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
    pc.setToolSize(1)
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

  it('a tool switch mid-stroke applies to the next press, not the stroke in progress', () => {
    const pc = mountCanvas(W, H)
    pc.selectColor(1)
    pc.setToolSize(3)
    const at = cellPointer(pc, W, H)
    pointer(pc.canvas, 'pointerdown', at(2, 2).x, at(2, 2).y)
    pc.setTool('fill')
    pointer(pc.canvas, 'pointermove', at(6, 2).x, at(6, 2).y)
    pointer(pc.canvas, 'pointerup', at(6, 2).x, at(6, 2).y)
    // Still Pencil's 3×3 stamp at the far end, not Fill's single cell.
    expect(pc.getGrid()[1 * W + 7]).toBe(1)
    expect(pc.getGrid()[3 * W + 7]).toBe(1)
  })

  it('reports the finished stroke to onUpdate as soon as the pointer lifts', () => {
    let reported = null as number[] | null
    const pc = mountCanvas(W, H, { onUpdate: (g) => { reported = g } })
    pc.selectColor(1)
    pc.setToolSize(1)
    click(pc, 1, 1)
    expect(reported?.[1 * W + 1]).toBe(1)
    expect(reported).toEqual(pc.getGrid())
  })
})

describe('brush', () => {
  it('size 3 stamps a round plus, not the pencil square', () => {
    const pc = mountCanvas(W, H)
    pc.selectColor(1)
    pc.setTool('brush')
    pc.setToolSize(3)
    click(pc, 5, 5)
    expect(painted(pc.getGrid(), 1)).toEqual(['4,5', '5,4', '5,5', '5,6', '6,5'])
  })
})

describe('fill', () => {
  it('fills only the clicked region, reports it, and undoes in one step', () => {
    let lastGrid: number[] | null = null
    const pc = mountCanvas(W, H, { onUpdate: (g) => { lastGrid = g } })
    pc.selectColor(1)
    pc.setToolSize(1)
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
    expect(painted(grid, 2).filter(c => Number(c.split(',')[0]) >= 4)).toEqual([])
    expect(grid[9 * W + 9]).toBe(-1) // the far side of the wall
    expect(lastGrid).toEqual(grid) // the server sees the fill

    expect(pc.undo()).toBe(true)
    expect(pc.getGrid()).toEqual(walled)
  })

  it('acts once on press: a drag across the wall fills nothing beyond it', () => {
    const pc = mountCanvas(W, H)
    pc.selectColor(1)
    pc.setToolSize(1)
    const at = cellPointer(pc, W, H)
    pointer(pc.canvas, 'pointerdown', at(4, 0).x, at(4, 0).y)
    pointer(pc.canvas, 'pointermove', at(4, 9).x, at(4, 9).y)
    pointer(pc.canvas, 'pointerup', at(4, 9).x, at(4, 9).y)

    pc.setTool('fill')
    pc.selectColor(2)
    pointer(pc.canvas, 'pointerdown', at(0, 0).x, at(0, 0).y)
    pointer(pc.canvas, 'pointermove', at(8, 5).x, at(8, 5).y)
    pointer(pc.canvas, 'pointerup', at(8, 5).x, at(8, 5).y)
    expect(pc.getGrid()[5 * W + 8]).toBe(-1)
    expect(painted(pc.getGrid(), 2)).toHaveLength(40)
    pc.undo()
    expect(painted(pc.getGrid(), 2)).toEqual([])
  })
})

describe('spray', () => {
  // A fixed walk instead of Math.random, so every burst is the same on every run.
  beforeEach(() => {
    let k = 0
    vi.spyOn(Math, 'random').mockImplementation(() => (k++ * 0.618034) % 1)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const S = 20

  // A 20×20 canvas with Spray at size 7 (the largest size there is 8) in red.
  function sprayCanvas() {
    const pc = mountCanvas(S, S)
    pc.selectColor(1)
    pc.setTool('spray')
    pc.setToolSize(7)
    return { pc, at: cellPointer(pc, S, S) }
  }

  function pixel(pc: PixelCanvas, cx: number, cy: number): number[] {
    const cellPx = pc.canvas.width / S
    return [...pc.canvas.getContext('2d')!.getImageData(cx * cellPx + cellPx / 2, cy * cellPx + cellPx / 2, 1, 1).data.slice(0, 3)]
  }

  it('builds up checker dots inside the disc while held, and stops on release', async () => {
    const { pc, at } = sprayCanvas()
    pointer(pc.canvas, 'pointerdown', at(10, 10).x, at(10, 10).y)
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

    pointer(pc.canvas, 'pointerup', at(10, 10).x, at(10, 10).y)
    const released = pc.getGrid()
    await frames(5)
    expect(pc.getGrid()).toEqual(released)

    expect(pc.undo()).toBe(true) // the whole hold is one step
    expect(painted(pc.getGrid(), 1, S)).toEqual([])
  })

  it('previews only the disc outline, and pressing leaves none of it painted', () => {
    const { pc, at } = sprayCanvas()
    pointer(pc.canvas, 'pointermove', at(10, 10).x, at(10, 10).y)
    expect(pixel(pc, 10, 7)).toEqual([255, 0, 0]) // on the outline
    expect(pixel(pc, 10, 10)).toEqual([255, 255, 255]) // inside stays empty paper

    pointer(pc.canvas, 'pointerdown', at(10, 10).x, at(10, 10).y)
    pointer(pc.canvas, 'pointerup', at(10, 10).x, at(10, 10).y)
    // (10, 7) is off the checker, so spray never paints it: back to the dark empty square.
    expect(pc.getGrid()[7 * S + 10]).toBe(-1)
    expect(pixel(pc, 10, 7)).toEqual([241, 241, 244])
  })

  it('a drag moves where bursts land instead of painting a trail', async () => {
    const { pc, at } = sprayCanvas()
    pointer(pc.canvas, 'pointerdown', at(5, 10).x, at(5, 10).y)
    const pressed = pc.getGrid()
    pointer(pc.canvas, 'pointermove', at(12, 10).x, at(12, 10).y)
    pointer(pc.canvas, 'pointermove', at(15, 10).x, at(15, 10).y)
    expect(pc.getGrid()).toEqual(pressed) // moving alone paints nothing

    await frames(10)
    const disc = new Set(discFootprint(15, 10, 7, S, S))
    const added = pc.getGrid().flatMap((c, i) => (c !== pressed[i] ? [i] : []))
    expect(added.length).toBeGreaterThan(0)
    expect(added.filter(i => !disc.has(i))).toEqual([])
    pointer(pc.canvas, 'pointerup', at(15, 10).x, at(15, 10).y)
  })

  it.each(['lock', 'destroy'] as const)('%s() stops a held spray', async (stop) => {
    const { pc, at } = sprayCanvas()
    pointer(pc.canvas, 'pointerdown', at(10, 10).x, at(10, 10).y)
    pc[stop]()
    const stopped = pc.getGrid()
    await frames(5)
    expect(pc.getGrid()).toEqual(stopped)
  })

  it('switching to Pencil mid-hold keeps spraying, and Pencil takes the next press', async () => {
    const { pc, at } = sprayCanvas()
    pointer(pc.canvas, 'pointerdown', at(10, 10).x, at(10, 10).y)
    pc.setTool('pencil')
    pointer(pc.canvas, 'pointermove', at(14, 10).x, at(14, 10).y)
    await frames(5)
    pointer(pc.canvas, 'pointerup', at(14, 10).x, at(14, 10).y)
    expect(painted(pc.getGrid(), 1, S).filter((c) => {
      const [x, y] = c.split(',').map(Number)
      return (x + y) % 2 !== 0
    })).toEqual([])

    pointer(pc.canvas, 'pointerdown', at(2, 3).x, at(2, 3).y) // odd cell: only Pencil can paint it
    pointer(pc.canvas, 'pointerup', at(2, 3).x, at(2, 3).y)
    expect(pc.getGrid()[3 * S + 2]).toBe(1)
  })

  it('a second press while spraying leaves nothing spraying after release', async () => {
    const { pc, at } = sprayCanvas()
    pointer(pc.canvas, 'pointerdown', at(10, 10).x, at(10, 10).y)
    pointer(pc.canvas, 'pointerdown', at(10, 10).x, at(10, 10).y) // a second finger
    pointer(pc.canvas, 'pointerup', at(10, 10).x, at(10, 10).y)
    const released = pc.getGrid()
    pointer(pc.canvas, 'pointermove', at(4, 4).x, at(4, 4).y) // hover elsewhere
    await frames(10)
    expect(pc.getGrid()).toEqual(released)
  })
})

describe('every tool', () => {
  it.each(CANVAS_TOOLS)('right-click with %s samples the colour under the cursor and does not paint', (tool) => {
    let picked = null as number | null
    const pc = mountCanvas(W, H, { onPick: (i) => { picked = i } })
    pc.selectColor(2)
    pc.setToolSize(1)
    click(pc, 0, 0)
    expect(pc.getGrid()[0]).toBe(2)

    pc.setTool(tool)
    pc.selectColor(1)
    const before = pc.getGrid()
    click(pc, 0, 0, 2) // right button
    expect(picked).toBe(2)
    expect(pc.getGrid()).toEqual(before)
  })

  it.each(['pencil', 'brush', 'fill'] as const)('a %s click that changes nothing adds no undo step', (tool) => {
    const pc = mountCanvas(W, H)
    pc.selectColor(1)
    pc.setTool(tool)
    click(pc, 2, 2) // real change
    expect(pc.canUndo()).toBe(true)
    click(pc, 2, 2) // same colour again, no change
    expect(pc.undo()).toBe(true) // one undo restores the pre-stroke grid
    expect(pc.canUndo()).toBe(false) // nothing left, so the no-op added nothing
  })
})
