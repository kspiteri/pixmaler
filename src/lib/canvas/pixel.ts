// The editable drawing surface: cell rendering, hover preview, the read-only crosshair
// marker, undo, and unified pointer input. Geometry lives in `./grid`, the swatch and
// brush widgets in `./tools`.

import type { Cell } from './grid'
import { brushMaxFor, defaultBrushFor } from '../aspect'
import { brushFootprint, cellAt, indexOf, linePath, xyOf } from './grid'

export interface CanvasOptions {
  gridW: number
  gridH: number
  palette: string[]
  targetGrid?: number[] // if provided, renders as the reference image
  // Editable canvases only: seed the canvas with a drawing already in progress
  // (rejoin mid-DRAWING). Ignored when `targetGrid` is set — a read-only
  // reference canvas has no in-progress state.
  initialGrid?: number[]
  editable?: boolean // if false, read-only display (used for gallery/results)
  onUpdate?: (grid: number[]) => void
  // Fires when the cursor moves to a different cell on an editable canvas, or
  // null when the cursor leaves. Used to mirror the position to a reference
  // canvas via `showMarker`.
  onHover?: (cell: { x: number, y: number } | null) => void
}

const CELL_SIZE = 14 // px per grid cell at 1× scale — scales up on large screens

// Checkerboard for unpainted cells on **editable** canvases only. `$paper` is `#ffffff`
// and the palette is median-cut from the GM's photo, so unpainted-as-transparent made
// white paint identical to nothing at all — nobody could see their own strokes.
const EMPTY_LIGHT = '#ffffff'
const EMPTY_DARK = '#f1f1f4'

// Brush sizing (see `./aspect` — `brushMaxFor` / `defaultBrushFor`) scales with
// grid resolution so the brush stays proportional to the image: small grids
// still get a 1-cell brush, large ones get a usefully chunky one.

export class PixelCanvas {
  readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private grid: number[]
  private opts: CanvasOptions
  private selectedColor = 0
  private brushSize = 1
  private brushMax = 8
  private painting = false
  private locked = false
  private lastCell = -1
  private lastCx = -1
  private lastCy = -1
  // Where the cursor currently sits (for refreshing the hover preview when
  // brush size changes mid-hover). Null when the cursor is off-canvas.
  private cursorCell: { x: number, y: number } | null = null
  // Cells currently shown as a hover preview, keyed by `y * gridW + x` → original
  // palette index. We restore these when the hover moves or the cursor leaves.
  private hoverCells: Map<number, number> = new Map()
  // Cell the crosshair marker currently sits on (used on read-only canvases so a
  // cursor over the editable canvas shows which cell it's pointing at).
  private markerCell: { x: number, y: number } | null = null
  // Halo stroke width, in canvas px, of the marker as last drawn — recorded so
  // the restore repaints exactly the band that was painted (see drawMarkerAt).
  private markerHalo = 0
  // Snapshots of the grid pushed at the start of each stroke. `undo()` pops.
  private undoStack: number[][] = []
  private static UNDO_DEPTH = 30

  constructor(opts: CanvasOptions) {
    this.opts = opts
    // Brush range scales with grid resolution (see brushMaxFor/defaultBrushFor).
    this.brushMax = brushMaxFor(opts.gridW, opts.gridH)
    this.brushSize = defaultBrushFor(opts.gridW, opts.gridH)
    // Read-only canvases render `targetGrid`. Editable canvases start blank
    // (-1 = untouched, rendered transparent so the white background shows
    // through) unless `initialGrid` restores a drawing in progress.
    const seed = opts.targetGrid ?? opts.initialGrid
    this.grid = seed
      ? [...seed]
      : Array.from<number>({ length: opts.gridW * opts.gridH }).fill(opts.editable ? -1 : 0)

    this.canvas = document.createElement('canvas')
    this.canvas.width = opts.gridW * CELL_SIZE
    this.canvas.height = opts.gridH * CELL_SIZE
    this.canvas.style.imageRendering = 'pixelated'
    this.canvas.style.cursor = opts.editable ? 'crosshair' : 'default'
    this.canvas.style.display = 'block'
    if (opts.editable) {
      // White in both themes: untouched cells (-1) render transparent onto it.
      this.canvas.style.background = '#fff'
      // The only edge this canvas gets — CanvasPair has no `.art-frame`. Themed, and
      // inline `var()` resolves against `:root` like any other declaration.
      this.canvas.style.border = '1px solid var(--canvas-edge)'
    }

    this.ctx = this.canvas.getContext('2d')!
    this.render()

    if (opts.editable)
      this.attachInput()
    else this.attachReadOnlyHover()
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  // Untouched cells stay `-1` on the wire so read-only renderers draw them transparent,
  // keeping submitted drawings looking like strokes on paper rather than filled onto
  // `palette[0]`.
  getGrid(): number[] {
    return [...this.grid]
  }

  // Notifies via `onUpdate`, exactly like a stroke or an `undo()`: its only callers are
  // the destructive Clear actions, and both the wire state and any UI mirroring
  // `canUndo()` have to catch up. Without it, clearing left the server on the old grid.
  setGrid(grid: number[]) {
    this.grid = [...grid]
    this.render()
    this.opts.onUpdate?.(this.getGrid())
  }

  // Fits the canvas's DISPLAY size to the available box, preserving the grid's aspect. The
  // bitmap is untouched, so cells stay crisp and `cellAt` keeps mapping. The scale is NOT
  // snapped to whole pixels per cell — flooring 2.818 to 2 lost 29% of the width.
  fitTo(availW: number, availH: number) {
    const { gridW, gridH } = this.opts
    if (gridW <= 0 || gridH <= 0 || availW <= 0 || availH <= 0)
      return
    const scale = Math.min(availW / gridW, availH / gridH)
    this.canvas.style.width = `${gridW * scale}px`
    this.canvas.style.height = `${gridH * scale}px`
  }

  selectColor(index: number) {
    this.selectedColor = index
  }

  setBrushSize(size: number) {
    this.brushSize = Math.max(1, Math.min(this.brushMax, size))
    // Refresh the hover footprint immediately so the new size is visible
    // without requiring a mouse move.
    if (this.cursorCell && !this.painting) {
      this.showHover(this.cursorCell.x, this.cursorCell.y)
    }
  }

  getBrushSize(): number {
    return this.brushSize
  }

  // Max brush for this grid (drives the slider's upper bound).
  getBrushMax(): number {
    return this.brushMax
  }

  lock() {
    this.locked = true
    this.painting = false
    this.canvas.style.cursor = 'default'
    this.clearHover()
  }

  isLocked(): boolean {
    return this.locked
  }

  // ── Undo ────────────────────────────────────────────────────────────────────

  // Push the current grid onto the undo stack. Called automatically at the
  // start of each paint stroke; can be called explicitly by callers before
  // destructive operations like Clear so they're undoable too.
  pushUndoSnapshot() {
    this.undoStack.push([...this.grid])
    if (this.undoStack.length > PixelCanvas.UNDO_DEPTH)
      this.undoStack.shift()
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  // Pop the most recent snapshot and restore it. Returns true if anything
  // happened. Notifies via `onUpdate` so the wire-side state catches up.
  undo(): boolean {
    if (this.locked)
      return false
    const prev = this.undoStack.pop()
    if (!prev)
      return false
    this.grid = prev
    this.clearHover()
    this.render()
    this.opts.onUpdate?.(this.getGrid())
    return true
  }

  clearUndo() {
    this.undoStack.length = 0
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  // Paint an unpainted cell's ground. On an editable canvas that is a checkerboard so
  // white paint is distinguishable from nothing (see EMPTY_LIGHT/EMPTY_DARK); on a
  // read-only one it stays transparent so `$paper` shows through as before.
  private paintEmptyCell(cx: number, cy: number) {
    const x = cx * CELL_SIZE
    const y = cy * CELL_SIZE
    if (!this.opts.editable) {
      this.ctx.clearRect(x, y, CELL_SIZE, CELL_SIZE)
      return
    }
    this.ctx.fillStyle = (cx + cy) % 2 === 0 ? EMPTY_LIGHT : EMPTY_DARK
    this.ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE)
  }

  render() {
    const { gridW, gridH, palette } = this.opts
    const ctx = this.ctx
    // Clear first: on a read-only canvas untouched (-1) cells leave the element's own
    // background visible, which is what `paintEmptyCell` preserves.
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const idx = this.grid[y * gridW + x] ?? 0
        if (idx < 0) {
          this.paintEmptyCell(x, y)
          continue
        }
        ctx.fillStyle = palette[idx] ?? '#000'
        ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
      }
    }
  }

  // Repaint a single cell to its underlying grid colour. Used by the hover-
  // restore path so we don't re-render the whole canvas on every mousemove.
  private repaintCell(cx: number, cy: number) {
    const { gridW, palette } = this.opts
    const idx = this.grid[cy * gridW + cx] ?? 0
    if (idx < 0) {
      this.paintEmptyCell(cx, cy)
      return
    }
    this.ctx.fillStyle = palette[idx] ?? '#000'
    this.ctx.fillRect(cx * CELL_SIZE, cy * CELL_SIZE, CELL_SIZE, CELL_SIZE)
  }

  // ── Marker (read-only hover indicator) ─────────────────────────────────────

  // Show or move the marker at the given cell. Pass null to clear.
  // Used on read-only canvases so a cursor reveals which cell it's over.
  showMarker(cell: { x: number, y: number } | null) {
    if (this.markerCell)
      this.restoreMarkerArea(this.markerCell.x, this.markerCell.y)
    this.markerCell = cell
    if (cell)
      this.drawMarkerAt(cell.x, cell.y)
  }

  // The crosshair spans the full canvas, so a restore repaints one column band and one
  // row band, not a box. Uses `markerHalo` as recorded when the marker was *drawn* — a
  // resize between draw and restore would otherwise leave a sliver of halo behind.
  private restoreMarkerArea(cx: number, cy: number) {
    const { gridW, gridH } = this.opts
    // `+ 1` covers the halo's outer edge, which strokes half outside the line's
    // nominal width.
    const pad = Math.ceil(this.markerHalo / 2 / CELL_SIZE) + 1
    const x0 = Math.max(0, cx - pad)
    const x1 = Math.min(gridW - 1, cx + pad)
    const y0 = Math.max(0, cy - pad)
    const y1 = Math.min(gridH - 1, cy + pad)
    for (let y = 0; y < gridH; y++) {
      for (let x = x0; x <= x1; x++) {
        this.repaintCell(x, y)
      }
    }
    for (let y = y0; y <= y1; y++) {
      for (let x = 0; x < gridW; x++) {
        this.repaintCell(x, y)
      }
    }
  }

  // A crosshair through the cell spanning both axes, driven by the editable canvas's
  // hover. Not a box: inflated to stay visible on a shrunken reference one reached ~24
  // cells wide, and `strokeRect` clipped it, pointing at a cell up to 6 off near edges.
  private drawMarkerAt(cx: number, cy: number) {
    const ctx = this.ctx
    const cxPx = cx * CELL_SIZE + CELL_SIZE / 2
    const cyPx = cy * CELL_SIZE + CELL_SIZE / 2

    // The reference canvas is CSS-scaled down hard (a 346-cell grid is a 4844px bitmap
    // in a ~240px box), so a fixed *apparent* thickness must be expressed in canvas px.
    // 1:1 before first layout, when the rect is still 0.
    const displayW = this.canvas.getBoundingClientRect().width
    const ratio = displayW ? this.canvas.width / displayW : 1
    this.markerHalo = Math.max(2, Math.round(3 * ratio))

    ctx.save()
    ctx.beginPath()
    ctx.moveTo(cxPx, 0)
    ctx.lineTo(cxPx, this.canvas.height)
    ctx.moveTo(0, cyPx)
    ctx.lineTo(this.canvas.width, cyPx)
    ctx.lineWidth = this.markerHalo
    // Not themed: this sits on the artwork, so it must read against any palette colour.
    ctx.strokeStyle = '#000'
    ctx.stroke()
    ctx.lineWidth = Math.max(1, Math.round(ratio))
    ctx.strokeStyle = '#0ff'
    ctx.stroke()
    ctx.restore()
  }

  // ── Hover preview ──────────────────────────────────────────────────────────

  // Show the brush footprint at (cx, cy) in the currently-selected colour.
  // Stores the original cell indices so we can restore them on the next move.
  private showHover(cx: number, cy: number) {
    if (this.locked)
      return
    const { gridW, gridH, palette } = this.opts
    const next = new Map<number, number>()

    for (const key of brushFootprint(cx, cy, this.brushSize, gridW, gridH)) {
      // Capture original colour from the *grid* (not the canvas), so we
      // never accidentally remember a previously-painted hover preview.
      next.set(key, this.grid[key] ?? 0)
    }

    // Restore any cells that were in the previous hover but not the new one.
    for (const [key] of this.hoverCells) {
      if (!next.has(key)) {
        const { x, y } = xyOf(key, gridW)
        this.repaintCell(x, y)
      }
    }

    // Paint preview cells in the selected colour.
    this.ctx.fillStyle = palette[this.selectedColor] ?? '#000'
    for (const [key] of next) {
      const { x, y } = xyOf(key, gridW)
      this.ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
    }

    this.hoverCells = next
  }

  private clearHover() {
    if (this.hoverCells.size === 0)
      return
    const { gridW } = this.opts
    for (const [key] of this.hoverCells) {
      const { x, y } = xyOf(key, gridW)
      this.repaintCell(x, y)
    }
    this.hoverCells.clear()
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  private attachInput() {
    const el = this.canvas
    // Don't let the browser hijack drags as scroll/pan/selection on touch —
    // we handle all pointer movement ourselves.
    el.style.touchAction = 'none'

    // Unified Pointer Events (mouse + touch + pen in one path). `setPointerCapture` on
    // pointerdown keeps every later move and up coming here even off-element, which is
    // what fixed dragging off the canvas and back silently stopping the stroke.
    el.addEventListener('pointerdown', (e) => {
      if (this.locked)
        return
      // Capture this pointer so moves outside the element still reach us.
      try { el.setPointerCapture(e.pointerId) }
      catch { /* capture is best-effort; painting still works without it */ }
      this.pushUndoSnapshot()
      this.painting = true
      this.resetStroke()
      // Promote the hover preview into a real paint at the same cell.
      this.hoverCells.clear()
      this.paintAt(e.clientX, e.clientY)
    })

    el.addEventListener('pointermove', (e) => {
      if (this.locked)
        return
      const { x, y } = this.eventCell(e.clientX, e.clientY)
      const { gridW, gridH } = this.opts
      const inBounds = x >= 0 && y >= 0 && x < gridW && y < gridH

      if (this.painting) {
        if (inBounds) {
          // Painting inside the canvas — draw, mirror the cursor for the marker.
          this.paintAt(e.clientX, e.clientY)
          this.cursorCell = { x, y }
          this.opts.onHover?.(this.cursorCell)
        }
        else {
          // Pen lifts off the paper: paint nothing while out (no edge-clamp smear) and
          // reset the stroke, so re-entry starts a fresh segment instead of drawing across
          // the gap. Capture still delivers these moves, so it resumes without a new click.
          this.resetStroke()
          this.cursorCell = null
          this.opts.onHover?.(null)
        }
        return
      }

      this.cursorCell = inBounds ? { x, y } : null
      this.opts.onHover?.(this.cursorCell)
      if (inBounds)
        this.showHover(x, y)
      else
        this.clearHover()
    })

    const endStroke = (e: PointerEvent) => {
      if (!this.painting)
        return
      this.painting = false
      this.resetStroke()
      try { el.releasePointerCapture(e.pointerId) }
      catch { /* no-op if capture was never taken */ }
    }
    el.addEventListener('pointerup', endStroke)
    el.addEventListener('pointercancel', endStroke)

    // Hides the hover preview only. An in-progress stroke is NOT ended — capture keeps
    // delivering moves so a drag can come back in — and `pointermove` already handles
    // painting nothing while out.
    el.addEventListener('pointerleave', () => {
      this.clearHover()
      if (!this.painting) {
        this.cursorCell = null
        this.opts.onHover?.(null)
      }
    })
  }

  // Lightweight hover tracking for read-only canvases — fires `onHover` only,
  // no preview/marker (read-only canvases are typically the destination of a
  // marker driven by the editable canvas, not the source of one).
  private attachReadOnlyHover() {
    const el = this.canvas
    el.addEventListener('mousemove', (e) => {
      const { x, y } = this.eventCell(e.clientX, e.clientY)
      const { gridW, gridH } = this.opts
      const inBounds = x >= 0 && y >= 0 && x < gridW && y < gridH
      this.opts.onHover?.(inBounds ? { x, y } : null)
    })
    el.addEventListener('mouseleave', () => this.opts.onHover?.(null))
  }

  private resetStroke() {
    this.lastCell = -1
    this.lastCx = -1
    this.lastCy = -1
  }

  // Paint at a viewport coordinate (works for mouse/touch/pen alike, since
  // Pointer Events normalise them). paintLine clamps to the grid.
  private paintAt(clientX: number, clientY: number) {
    const { x, y } = this.eventCell(clientX, clientY)
    this.paintLine(x, y)
  }

  private eventCell(clientX: number, clientY: number): Cell {
    const { gridW, gridH } = this.opts
    return cellAt(clientX, clientY, this.canvas.getBoundingClientRect(), gridW, gridH)
  }

  // Fills gaps on fast drags. Clamps first, so a pointer that left the canvas paints
  // along the edge rather than off it.
  private paintLine(cx: number, cy: number) {
    const { gridW, gridH } = this.opts
    cx = Math.max(0, Math.min(gridW - 1, cx))
    cy = Math.max(0, Math.min(gridH - 1, cy))

    if (this.lastCx === -1) {
      this.paintCell(cx, cy)
      this.lastCx = cx
      this.lastCy = cy
      return
    }

    for (const { x, y } of linePath(this.lastCx, this.lastCy, cx, cy))
      this.paintCell(x, y)

    this.lastCx = cx
    this.lastCy = cy
  }

  private paintCell(cx: number, cy: number) {
    const { gridW, gridH, palette } = this.opts
    const cell = indexOf(cx, cy, gridW)
    if (cell === this.lastCell)
      return
    this.lastCell = cell

    let changed = false
    for (const i of brushFootprint(cx, cy, this.brushSize, gridW, gridH)) {
      if (this.grid[i] !== this.selectedColor) {
        this.grid[i] = this.selectedColor
        const { x, y } = xyOf(i, gridW)
        this.ctx.fillStyle = palette[this.selectedColor]
        this.ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
        changed = true
      }
    }
    if (changed)
      this.opts.onUpdate?.(this.getGrid())
  }
}
