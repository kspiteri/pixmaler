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
