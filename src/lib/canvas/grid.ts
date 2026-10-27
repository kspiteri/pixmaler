// Pure cell geometry for the drawing canvas: pointer→cell mapping, brush footprints and
// line walking. No DOM, no canvas, no notion of a canvas pixel — `CELL_SIZE` deliberately
// stays in `./pixel`, which is what lets all of this be tested in plain node.

export interface Cell {
  x: number
  y: number
}

// The part of a `DOMRect` the mapping needs. Structural so a test passes a literal.
export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export function indexOf(x: number, y: number, gridW: number): number {
  return y * gridW + x
}

export function xyOf(index: number, gridW: number): Cell {
  const y = Math.floor(index / gridW)
  return { x: index - y * gridW, y }
}

// Viewport coordinate → cell, divided per axis so a rect off the grid's ratio maps rather
// than squashes. **May return cells outside the grid**, and callers rely on it: that is
// how the input path tells "painting inside" from "the pen lifted off the paper".
export function cellAt(clientX: number, clientY: number, rect: Rect, gridW: number, gridH: number): Cell {
  const scaleX = gridW / rect.width
  const scaleY = gridH / rect.height
  return {
    x: Math.floor((clientX - rect.left) * scaleX),
    y: Math.floor((clientY - rect.top) * scaleY),
  }
}

// Cell indices a square brush covers, clipped to the grid rather than clamped onto its
// edge. Even sizes are **asymmetric, biased up-left** — brush 2 covers x-1..x, brush 4
// covers x-2..x+1 — because `half` floors. Changing that shifts every even brush.
export function brushFootprint(cx: number, cy: number, brush: number, gridW: number, gridH: number): number[] {
  const half = Math.floor(brush / 2)
  const out: number[] = []
  for (let dy = -half; dy < brush - half; dy++) {
    for (let dx = -half; dx < brush - half; dx++) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH)
        continue
      out.push(ny * gridW + nx)
    }
  }
  return out
}

// The `- 0.5` makes size 3 a plus rather than the full 3×3 square.
export function discFootprint(cx: number, cy: number, size: number, gridW: number, gridH: number): number[] {
  const half = Math.floor(size / 2)
  const offset = size % 2 === 0 ? 0.5 : 0
  const limit = Math.max(0, (size / 2) ** 2 - 0.5)
  const out: number[] = []
  for (let dy = -half; dy < size - half; dy++) {
    for (let dx = -half; dx < size - half; dx++) {
      if ((dx + offset) ** 2 + (dy + offset) ** 2 > limit)
        continue
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH)
        continue
      out.push(ny * gridW + nx)
    }
  }
  return out
}

// 4-connected, so a 1-cell diagonal outline holds the fill in. Paper (-1) fills like a colour.
export function floodFill(grid: number[], gridW: number, gridH: number, x: number, y: number, colour: number): number[] {
  if (x < 0 || x >= gridW || y < 0 || y >= gridH)
    return []
  const start = indexOf(x, y, gridW)
  const from = grid[start]
  if (from === colour)
    return []
  const seen = new Uint8Array(grid.length)
  const out: number[] = []
  const stack = [start]
  seen[start] = 1
  const visit = (n: number) => {
    if (!seen[n] && grid[n] === from) {
      seen[n] = 1
      stack.push(n)
    }
  }
  while (stack.length > 0) {
    const i = stack.pop()!
    out.push(i)
    const cx = i % gridW
    if (cx > 0)
      visit(i - 1)
    if (cx < gridW - 1)
      visit(i + 1)
    if (i >= gridW)
      visit(i - gridW)
    if (i < grid.length - gridW)
      visit(i + gridW)
  }
  return out
}

// Of the disc's checker cells; about 3% of the whole disc per burst.
const SPRAY_RATE = 0.06

// The checker is global so overlapping sprays share it and a held spray caps at a 50% dither.
export function spraySample(cx: number, cy: number, size: number, gridW: number, gridH: number, random: () => number = Math.random): number[] {
  const candidates = discFootprint(cx, cy, size, gridW, gridH).filter((i) => {
    const { x, y } = xyOf(i, gridW)
    return (x + y) % 2 === 0
  })
  if (candidates.length === 0)
    return []
  const count = Math.max(1, Math.round(candidates.length * SPRAY_RATE))
  const out: number[] = []
  for (let n = 0; n < count; n++)
    out.push(candidates[Math.floor(random() * candidates.length)])
  return out
}

// Bresenham walk, start→end, **including both endpoints**. The caller suppresses the
// repeated start cell by tracking the last cell it painted; moving that dedupe in here
// would change which cells an update reports.
export function linePath(x0: number, y0: number, x1: number, y1: number): Cell[] {
  const out: Cell[] = []
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let x = x0
  let y = y0
  while (true) {
    out.push({ x, y })
    if (x === x1 && y === y1)
      break
    const e2 = 2 * err
    if (e2 > -dy) { err -= dy; x += sx }
    if (e2 < dx) { err += dx; y += sy }
  }
  return out
}
