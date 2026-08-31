// Pure cell geometry extracted from `PixelCanvas` (#30). These are the behaviours the
// canvas depends on and that a careless tidy-up would silently change: even brushes are
// asymmetric, footprints clip rather than clamp, and `cellAt` is allowed to return cells
// outside the grid because the input path uses that to detect the pen leaving the canvas.

import { describe, expect, it } from 'vitest'
import { brushFootprint, cellAt, indexOf, linePath, xyOf } from '../src/lib/canvas/grid'

function rect(over: Partial<{ left: number, top: number, width: number, height: number }> = {}) {
  return { left: 0, top: 0, width: 200, height: 200, ...over }
}

describe('indexOf / xyOf', () => {
  it('round-trip for every cell of a non-square grid', () => {
    const gridW = 7
    const gridH = 5
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++)
        expect(xyOf(indexOf(x, y, gridW), gridW)).toEqual({ x, y })
    }
  })

  it('walks row-major, so index 0 is the top-left and gridW starts the second row', () => {
    expect(indexOf(0, 0, 7)).toBe(0)
    expect(xyOf(7, 7)).toEqual({ x: 0, y: 1 })
    expect(xyOf(8, 7)).toEqual({ x: 1, y: 1 })
  })
})

describe('cellAt', () => {
  it('maps a pointer inside the box to the cell under it', () => {
    // 200px over 20 cells is 10px each, so 55px in is cell 5.
    expect(cellAt(55, 155, rect(), 20, 20)).toEqual({ x: 5, y: 15 })
  })

  it('subtracts the box offset, so the mapping is viewport-relative', () => {
    expect(cellAt(155, 105, rect({ left: 100, top: 50 }), 20, 20)).toEqual({ x: 5, y: 5 })
  })

  it('returns cells outside the grid rather than clamping', () => {
    // Load-bearing: `attachInput` uses out-of-bounds results to tell "painting inside"
    // from "the pen lifted off the paper". Clamping here re-introduces the edge smear.
    expect(cellAt(50, 100, rect({ left: 100, top: 50 }), 20, 20)).toEqual({ x: -5, y: 5 })
    expect(cellAt(400, 100, rect(), 20, 20).x).toBeGreaterThan(19)
  })

  it('divides per axis, so a box off the grid ratio maps rather than squashes', () => {
    expect(cellAt(150, 100, rect({ width: 400, height: 100 }), 20, 20)).toEqual({ x: 7, y: 20 })
  })

  it('floors rather than rounds, so a cell owns its whole width', () => {
    // Cell 5 spans 50..59.99; 59 must not round up into cell 6.
    expect(cellAt(50, 50, rect(), 20, 20).x).toBe(5)
    expect(cellAt(59, 59, rect(), 20, 20).x).toBe(5)
    expect(cellAt(60, 60, rect(), 20, 20).x).toBe(6)
  })

  it('degrades to a non-finite cell before first layout, which callers survive', () => {
    // Pinned, not fixed (#30): a zero-size element receives no pointer events, so this is
    // unreachable. `paintLine` clamps Infinity to the last cell; NaN reaches the grid as a
    // string key that `getGrid()`'s spread drops. No visual effect, nothing on the wire.
    const zero = rect({ left: 100, top: 50, width: 0, height: 0 })
    expect(cellAt(150, 100, zero, 20, 20)).toEqual({ x: Infinity, y: Infinity })
    expect(cellAt(100, 50, zero, 20, 20).x).toBeNaN()
  })
})

describe('brushFootprint', () => {
  const extent = (cells: number[], gridW: number) => {
    const xs = cells.map(i => xyOf(i, gridW).x)
    const ys = cells.map(i => xyOf(i, gridW).y)
    return { x: [Math.min(...xs), Math.max(...xs)], y: [Math.min(...ys), Math.max(...ys)] }
  }

  it('covers exactly the centre cell at brush 1', () => {
    expect(brushFootprint(5, 5, 1, 20, 20)).toEqual([indexOf(5, 5, 20)])
  })

  it('centres odd brushes on the cell', () => {
    expect(extent(brushFootprint(5, 5, 3, 20, 20), 20)).toEqual({ x: [4, 6], y: [4, 6] })
    expect(extent(brushFootprint(5, 5, 5, 20, 20), 20)).toEqual({ x: [3, 7], y: [3, 7] })
  })

  it('biases even brushes up and left, because `half` floors', () => {
    // Deliberate and load-bearing: "fixing" this shifts every even brush half a cell.
    expect(extent(brushFootprint(5, 5, 2, 20, 20), 20)).toEqual({ x: [4, 5], y: [4, 5] })
    expect(extent(brushFootprint(5, 5, 4, 20, 20), 20)).toEqual({ x: [3, 6], y: [3, 6] })
    expect(extent(brushFootprint(5, 5, 6, 20, 20), 20)).toEqual({ x: [2, 7], y: [2, 7] })
  })

  it('has brush² cells when it fits entirely inside the grid', () => {
    for (const brush of [1, 2, 3, 4, 7, 8])
      expect(brushFootprint(10, 10, brush, 24, 24)).toHaveLength(brush * brush)
  })

  it('clips at an edge rather than clamping onto it', () => {
    // Clamping would pile the whole brush onto the corner cell and paint a solid block.
    const corner = brushFootprint(0, 0, 3, 20, 20)
    expect(corner).toHaveLength(4)
    expect(corner.map(i => xyOf(i, 20))).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ])
  })

  it('yields nothing for a centre far outside the grid', () => {
    expect(brushFootprint(-50, -50, 3, 20, 20)).toEqual([])
    expect(brushFootprint(80, 80, 3, 20, 20)).toEqual([])
  })

  it('only ever yields in-range, unique indices', () => {
    for (const brush of [1, 2, 5, 40]) {
      for (const [cx, cy] of [[0, 0], [23, 17], [-3, 9], [12, 30]]) {
        const cells = brushFootprint(cx, cy, brush, 24, 18)
        expect(new Set(cells).size).toBe(cells.length)
        for (const i of cells) {
          expect(i).toBeGreaterThanOrEqual(0)
          expect(i).toBeLessThan(24 * 18)
        }
      }
    }
  })
})

describe('linePath', () => {
  it('includes both endpoints, in start-to-end order', () => {
    // The caller dedupes the repeated start cell against `lastCell`; dropping it here
    // would change which cells an update reports.
    const path = linePath(2, 2, 5, 2)
    expect(path[0]).toEqual({ x: 2, y: 2 })
    expect(path.at(-1)).toEqual({ x: 5, y: 2 })
  })

  it('yields a single cell when start and end are the same', () => {
    expect(linePath(3, 4, 3, 4)).toEqual([{ x: 3, y: 4 }])
  })

  it('walks horizontal and vertical runs one cell at a time', () => {
    expect(linePath(0, 0, 3, 0)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }])
    expect(linePath(0, 0, 0, 3)).toEqual([{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }])
  })

  it('walks a perfect diagonal in both directions', () => {
    expect(linePath(0, 0, 2, 2)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])
    expect(linePath(2, 2, 0, 0)).toEqual([{ x: 2, y: 2 }, { x: 1, y: 1 }, { x: 0, y: 0 }])
  })

  it('picks the same cells as Bresenham on a steep slope, not a neighbouring set', () => {
    // The endpoint and no-gap tests both survive a one-off error-term comparison, so the
    // exact sequence has to be pinned: `e2 >= -dy` still walks an 8-connected path between
    // the right endpoints, but shifts 15% of all lines by a cell.
    expect(linePath(0, 0, 1, 2)).toEqual([{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 2 }])
    expect(linePath(0, 0, 2, 4)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
      { x: 2, y: 4 },
    ])
  })

  it('never leaves a gap, whatever the slope or direction', () => {
    // The whole point of the walk: a fast drag must not dot the line. Every step has to
    // be 8-connected to the one before it.
    for (const [x0, y0, x1, y1] of [
      [0, 0, 11, 3],
      [11, 3, 0, 0],
      [0, 0, 3, 11],
      [3, 11, 0, 0],
      [5, 5, -4, 9],
      [7, 2, 7, 19],
      [0, 9, 19, 0],
    ]) {
      const path = linePath(x0, y0, x1, y1)
      for (let i = 1; i < path.length; i++) {
        const dx = Math.abs(path[i].x - path[i - 1].x)
        const dy = Math.abs(path[i].y - path[i - 1].y)
        expect(Math.max(dx, dy)).toBe(1)
      }
    }
  })
})
