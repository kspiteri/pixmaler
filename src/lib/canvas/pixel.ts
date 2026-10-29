// The editable drawing surface: cell rendering, hover preview, the read-only crosshair
// marker, undo, the drawing tools, and unified pointer input. Geometry lives in `./grid`,
// the swatch and size-slider widgets in `./tools`.

import type { Cell } from './grid'
import { brushMaxFor, defaultBrushFor } from './aspect'
import { brushFootprint, cellAt, discFootprint, floodFill, indexOf, linePath, spraySample, xyOf } from './grid'

export const CANVAS_TOOLS = ['pencil', 'brush', 'fill', 'spray'] as const
export type CanvasTool = typeof CANVAS_TOOLS[number]
export const TOOL_LABELS: Record<CanvasTool, string> = { pencil: 'Pencil', brush: 'Brush', fill: 'Fill', spray: 'Spray' }
type SizedTool = Exclude<CanvasTool, 'fill'>

// A 2-wide disc is just Pencil's 2×2 square.
const TOOL_MIN: Record<SizedTool, number> = { pencil: 1, brush: 3, spray: 3 }

export interface CanvasOptions {
  gridW: number
  gridH: number
  palette: string[]
  targetGrid?: number[] // if provided, renders as the original
  // Editable canvases only: seed with a drawing already in progress (rejoin mid-DRAWING).
  // Ignored when `targetGrid` is set.
  initialGrid?: number[]
  editable?: boolean // if false, read-only display (used for gallery/results)
  onUpdate?: (grid: number[]) => void
  // Fires when the cursor moves to a different cell (null on leave), to mirror it to the original's canvas.
  onHover?: (cell: { x: number, y: number } | null) => void
  // Right-click eyedropper: the palette index sampled from the cell under the cursor.
  onPick?: (index: number) => void
  onToolChange?: (tool: CanvasTool) => void
  // Device px per cell in the backing store. Defaults to CELL_SIZE; read-only thumbnails pass
  // 1 to render at native grid resolution and let `image-rendering: pixelated` scale them up.
  cellPx?: number
}

const CELL_SIZE = 14 // px per grid cell at 1× scale — scales up on large screens

// Checkerboard for unpainted cells on **editable** canvases only: on white `$paper`,
// unpainted-as-transparent made white paint invisible against nothing.
const EMPTY_LIGHT = '#ffffff'
const EMPTY_DARK = '#f1f1f4'

// Tool sizes (see `./aspect`) scale with grid resolution so strokes stay proportional:
// small grids start at a 1-cell pencil, large ones a chunkier one.

export class PixelCanvas {
  readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private grid: number[]
  private opts: CanvasOptions
  private selectedColor = 0
  private tool: CanvasTool = 'pencil'
  // Fixed at pointerdown, so a tool switch mid-stroke applies to the next press.
  private strokeTool: CanvasTool = 'pencil'
  private sizes: Record<SizedTool, number>
  private sizeMax = 8
  private painting = false
  private locked = false
  private lastCell = -1
  private lastCx = -1
  private lastCy = -1
  // Where the cursor currently sits: where Spray's loop lands, and what the hover preview
  // redraws when the tool or its size changes. Null when the cursor is off-canvas.
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

  // Pre-stroke grid captured on pointer-down; pushed to `undoStack` only once a stroke
  // actually changes a cell, so a no-op click adds no undo step.
  private pendingSnapshot: number[] | null = null
  private strokeCommitted = false
  private sprayHandle: number | null = null

  // One controller for every DOM listener attached below; `destroy()` aborts it to detach them.
  private readonly listeners = new AbortController()

  // Device px per cell in the backing store (see CanvasOptions.cellPx).
  private readonly cellPx: number

  // Coalesce `onUpdate`: a stroke marks this dirty and schedules one rAF that fires a single
  // callback per frame; `pointerup`/`pointercancel` flush it so the final grid is delivered.
  private pendingUpdate = false
  private rafHandle: number | null = null

  constructor(opts: CanvasOptions) {
    this.opts = opts
    this.cellPx = opts.cellPx ?? CELL_SIZE
    this.sizeMax = brushMaxFor(opts.gridW, opts.gridH)
    const start = defaultBrushFor(opts.gridW, opts.gridH)
    this.sizes = {
      pencil: start,
      brush: Math.max(TOOL_MIN.brush, start),
      // A small spray covers too few checker cells to read as texture.
      spray: Math.max(TOOL_MIN.spray, Math.round(this.sizeMax * 0.75)),
    }
    // Read-only canvases render `targetGrid`; editable ones start blank (-1 = untouched,
    // rendered transparent) unless `initialGrid` restores a drawing in progress.
    const seed = opts.targetGrid ?? opts.initialGrid
    this.grid = seed
      ? [...seed]
      : Array.from<number>({ length: opts.gridW * opts.gridH }).fill(opts.editable ? -1 : 0)

    this.canvas = document.createElement('canvas')
    this.canvas.width = opts.gridW * this.cellPx
    this.canvas.height = opts.gridH * this.cellPx
    this.canvas.style.imageRendering = 'pixelated'
    this.canvas.style.cursor = opts.editable ? 'crosshair' : 'inherit'
    this.canvas.style.display = 'block'
    if (opts.editable) {
      // The drawing's paper (--paper): untouched cells (-1) render transparent onto it.
      this.canvas.style.background = 'var(--paper)'
      // The only edge this canvas gets — DrawBoard has no `.art-frame`.
      this.canvas.style.border = '1px solid var(--canvas-edge)'
    }

    this.ctx = this.canvas.getContext('2d')!
    this.render()

    if (opts.editable)
      this.attachInput()
    else this.attachReadOnlyHover()
  }

  // Detaches every DOM listener this instance attached. Call when replacing or discarding a
  // canvas (e.g. a fresh PixelThumb per grid change) so nothing outlives its element.
  destroy(): void {
    this.stopSpray()
    this.discardPendingUpdate()
    this.listeners.abort()
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  // Untouched cells stay `-1` on the wire so read-only renderers draw them transparent,
  // keeping drawings as strokes on paper rather than filled onto `palette[0]`.
  getGrid(): number[] {
    return [...this.grid]
  }

  // Notifies via `onUpdate` like a stroke or `undo()` — its callers are the Clear actions,
  // and the wire state must catch up or the server is left on the old grid.
  setGrid(grid: number[]) {
    this.grid = [...grid]
    this.render()
    this.discardPendingUpdate()
    this.opts.onUpdate?.(this.getGrid())
  }

  // Fits the canvas's DISPLAY size to the box, preserving aspect (bitmap untouched, cells
  // stay crisp). Scale is NOT snapped to whole px per cell — flooring 2.818 to 2 lost 29%.
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

  setTool(tool: CanvasTool) {
    if (tool === this.tool)
      return
    this.tool = tool
    this.refreshHover()
    this.opts.onToolChange?.(tool)
  }

  getTool(): CanvasTool {
    return this.tool
  }

  // A no-op on Fill.
  setToolSize(size: number) {
    if (this.tool === 'fill')
      return
    this.sizes[this.tool] = Math.max(TOOL_MIN[this.tool], Math.min(this.sizeMax, size))
    this.refreshHover()
  }

  // 0 on Fill, which has no size.
  getToolSize(): number {
    return this.tool === 'fill' ? 0 : this.sizes[this.tool]
  }

  getToolSizeMin(): number {
    return this.tool === 'fill' ? 0 : TOOL_MIN[this.tool]
  }

  getToolSizeMax(): number {
    return this.sizeMax
  }

  lock() {
    this.locked = true
    this.painting = false
    this.stopSpray()
    this.canvas.style.cursor = 'default'
    this.clearHover()
  }

  isLocked(): boolean {
    return this.locked
  }

  // ── Undo ────────────────────────────────────────────────────────────────────

  // Push the current grid onto the undo stack. Called at the start of each stroke, or
  // explicitly before a destructive Clear so that's undoable too.
  pushUndoSnapshot() {
    this.commitSnapshot([...this.grid])
  }

  private commitSnapshot(snap: number[]) {
    this.undoStack.push(snap)
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
    this.discardPendingUpdate()
    this.opts.onUpdate?.(this.getGrid())
    return true
  }

  clearUndo() {
    this.undoStack.length = 0
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  // Paint an unpainted cell's ground: a checkerboard on an editable canvas (so white paint
  // shows against nothing), transparent on a read-only one so `$paper` shows through.
  private paintEmptyCell(cx: number, cy: number) {
    const px = this.cellPx
    const x = cx * px
    const y = cy * px
    if (!this.opts.editable) {
      this.ctx.clearRect(x, y, px, px)
      return
    }
    this.ctx.fillStyle = (cx + cy) % 2 === 0 ? EMPTY_LIGHT : EMPTY_DARK
    this.ctx.fillRect(x, y, px, px)
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
        ctx.fillRect(x * this.cellPx, y * this.cellPx, this.cellPx, this.cellPx)
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

  // The crosshair spans the full canvas, so a restore repaints one column band and one row
  // band, not a box. Uses `markerHalo` as recorded at *draw* time — else a resize between
  // draw and restore leaves a sliver of halo behind.
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

  // A crosshair through the cell spanning both axes, driven by the editable canvas's hover.
  // Not a box: a `strokeRect` inflated to stay visible on a shrunken original canvas clipped
  // and pointed up to 6 cells off near the edges.
  private drawMarkerAt(cx: number, cy: number) {
    const ctx = this.ctx
    const cxPx = cx * CELL_SIZE + CELL_SIZE / 2
    const cyPx = cy * CELL_SIZE + CELL_SIZE / 2

    // The original's canvas is CSS-scaled down hard, so a fixed *apparent* thickness must be
    // expressed in canvas px. 1:1 before first layout, when the rect is still 0.
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

  private refreshHover() {
    if (this.cursorCell && !this.painting)
      this.showHover(this.cursorCell.x, this.cursorCell.y)
  }

  private footprint(cx: number, cy: number, tool: CanvasTool): number[] {
    const { gridW, gridH } = this.opts
    switch (tool) {
      case 'pencil':
        return brushFootprint(cx, cy, this.sizes.pencil, gridW, gridH)
      case 'brush':
        return discFootprint(cx, cy, this.sizes.brush, gridW, gridH)
      case 'spray':
        return discFootprint(cx, cy, this.sizes.spray, gridW, gridH)
      case 'fill':
        return brushFootprint(cx, cy, 1, gridW, gridH)
    }
  }

  // Show the active tool's footprint at (cx, cy) in the currently-selected colour.
  // Stores the original cell indices so we can restore them on the next move.
  private showHover(cx: number, cy: number) {
    if (this.locked)
      return
    const { gridW, palette } = this.opts
    const next = new Map<number, number>()

    let cells = this.footprint(cx, cy, this.tool)
    if (this.tool === 'spray') {
      // Outline only: a solid preview would overstate what a burst covers.
      const disc = new Set(cells)
      cells = cells.filter((i) => {
        const x = i % gridW
        return x === 0 || x === gridW - 1 || !disc.has(i - 1) || !disc.has(i + 1) || !disc.has(i - gridW) || !disc.has(i + gridW)
      })
    }
    for (const key of cells) {
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
    const { signal } = this.listeners
    // Don't let the browser hijack drags as scroll/pan/selection on touch —
    // we handle all pointer movement ourselves.
    el.style.touchAction = 'none'

    // Unified Pointer Events (mouse + touch + pen in one path). `setPointerCapture` on
    // pointerdown keeps later moves and up coming here even off-element, so a drag off the
    // canvas and back doesn't silently stop the stroke.
    el.addEventListener('pointerdown', (e) => {
      if (this.locked)
        return
      // Only the primary button paints. Right-click samples the colour under the cursor
      // (eyedropper) via onPick; every other button is ignored, never painting.
      if (e.button !== 0) {
        if (e.button === 2)
          this.pickAt(e.clientX, e.clientY)
        return
      }
      // A second finger mustn't restart the stroke or start a second spray loop.
      if (this.painting)
        return
      if (this.tool === 'fill') {
        this.fillAt(e.clientX, e.clientY)
        return
      }
      try { el.setPointerCapture(e.pointerId) }
      catch { /* capture is best-effort; painting still works without it */ }
      // Snapshot the pre-stroke grid, but defer pushing it until a cell actually changes
      // (in paintCell), so a no-op click leaves no undo step.
      this.pendingSnapshot = [...this.grid]
      this.strokeCommitted = false
      this.painting = true
      this.strokeTool = this.tool
      this.resetStroke()
      if (this.strokeTool === 'spray') {
        // The outline preview isn't paint, so restore it rather than promote it.
        this.clearHover()
        const { x, y } = this.eventCell(e.clientX, e.clientY)
        const { gridW, gridH } = this.opts
        this.cursorCell = x >= 0 && y >= 0 && x < gridW && y < gridH ? { x, y } : null
        this.startSpray()
      }
      else {
        // Promote the hover preview into a real paint at the same cell.
        this.hoverCells.clear()
        this.paintAt(e.clientX, e.clientY)
      }
    }, { signal })

    el.addEventListener('pointermove', (e) => {
      if (this.locked)
        return
      const { x, y } = this.eventCell(e.clientX, e.clientY)
      const { gridW, gridH } = this.opts
      const inBounds = x >= 0 && y >= 0 && x < gridW && y < gridH

      if (this.painting) {
        if (inBounds) {
          // Spray's frame loop reads `cursorCell` rather than painting on move.
          if (this.strokeTool !== 'spray')
            this.paintAt(e.clientX, e.clientY)
          this.cursorCell = { x, y }
          this.opts.onHover?.(this.cursorCell)
        }
        else {
          // Pen lifts off the paper: paint nothing while out (no edge-clamp smear) and reset
          // the stroke, so re-entry starts a fresh segment rather than drawing across the gap.
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
    }, { signal })

    const endStroke = (e: PointerEvent) => {
      if (!this.painting)
        return
      this.painting = false
      this.stopSpray()
      this.pendingSnapshot = null
      this.resetStroke()
      // Deliver the final grid immediately, bypassing the per-frame coalesce.
      this.flushUpdate()
      try { el.releasePointerCapture(e.pointerId) }
      catch { /* no-op if capture was never taken */ }
    }
    el.addEventListener('pointerup', endStroke, { signal })
    el.addEventListener('pointercancel', endStroke, { signal })
    // Capture ends with the pointer even when its pointerup never reaches us, so a stroke can't stay stuck.
    el.addEventListener('lostpointercapture', endStroke, { signal })

    // Hides the hover preview only. An in-progress stroke is NOT ended — capture keeps
    // delivering moves so a drag can come back in.
    el.addEventListener('pointerleave', () => {
      this.clearHover()
      if (!this.painting) {
        this.cursorCell = null
        this.opts.onHover?.(null)
      }
    }, { signal })
    // Right-click drives the eyedropper, so never let the browser menu pop over the art.
    el.addEventListener('contextmenu', e => e.preventDefault(), { signal })
  }

  // Lightweight hover tracking for read-only canvases — fires `onHover` only, no
  // preview/marker (they're the destination of a marker, not its source).
  private attachReadOnlyHover() {
    const el = this.canvas
    const { signal } = this.listeners
    el.addEventListener('mousemove', (e) => {
      const { x, y } = this.eventCell(e.clientX, e.clientY)
      const { gridW, gridH } = this.opts
      const inBounds = x >= 0 && y >= 0 && x < gridW && y < gridH
      this.opts.onHover?.(inBounds ? { x, y } : null)
    }, { signal })
    el.addEventListener('mouseleave', () => this.opts.onHover?.(null), { signal })
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

  // Eyedropper: sample the painted colour at a viewport point into the active swatch via
  // onPick. Untouched cells (-1) have no colour, so a pick there is a no-op.
  private pickAt(clientX: number, clientY: number) {
    const { gridW, gridH } = this.opts
    const { x, y } = this.eventCell(clientX, clientY)
    if (x < 0 || y < 0 || x >= gridW || y >= gridH)
      return
    const index = this.grid[indexOf(x, y, gridW)] ?? -1
    if (index >= 0)
      this.opts.onPick?.(index)
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
    const cell = indexOf(cx, cy, this.opts.gridW)
    if (cell === this.lastCell)
      return
    this.lastCell = cell

    if (this.recolour(this.footprint(cx, cy, this.strokeTool)))
      this.strokeChanged()
  }

  // Lazily record the pre-stroke snapshot the first time this stroke changes a cell.
  private strokeChanged() {
    if (this.pendingSnapshot && !this.strokeCommitted) {
      this.commitSnapshot(this.pendingSnapshot)
      this.strokeCommitted = true
    }
    this.scheduleUpdate()
  }

  private startSpray() {
    const tick = () => {
      const c = this.cursorCell
      if (c && this.recolour(spraySample(c.x, c.y, this.sizes.spray, this.opts.gridW, this.opts.gridH)))
        this.strokeChanged()
      this.sprayHandle = requestAnimationFrame(tick)
    }
    tick()
  }

  private stopSpray() {
    if (this.sprayHandle !== null)
      cancelAnimationFrame(this.sprayHandle)
    this.sprayHandle = null
  }

  private fillAt(clientX: number, clientY: number) {
    const { gridW, gridH } = this.opts
    const { x, y } = this.eventCell(clientX, clientY)
    const cells = floodFill(this.grid, gridW, gridH, x, y, this.selectedColor)
    if (cells.length === 0)
      return
    this.commitSnapshot([...this.grid])
    this.hoverCells.clear()
    this.recolour(cells)
    this.pendingUpdate = true
    this.flushUpdate()
  }

  private recolour(cells: number[]): boolean {
    const { gridW, palette } = this.opts
    let changed = false
    this.ctx.fillStyle = palette[this.selectedColor]
    for (const i of cells) {
      if (this.grid[i] === this.selectedColor)
        continue
      this.grid[i] = this.selectedColor
      const { x, y } = xyOf(i, gridW)
      this.ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
      changed = true
    }
    return changed
  }

  // Mark the grid dirty and schedule a single `onUpdate` for the next frame, so a drag firing
  // dozens of cell changes yields one full-grid copy + callback per frame instead of per cell.
  private scheduleUpdate() {
    this.pendingUpdate = true
    if (this.rafHandle !== null)
      return
    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = null
      this.flushUpdate()
    })
  }

  // Deliver any pending update now and cancel the scheduled frame.
  private flushUpdate() {
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle)
      this.rafHandle = null
    }
    if (!this.pendingUpdate)
      return
    this.pendingUpdate = false
    this.opts.onUpdate?.(this.getGrid())
  }

  // Drop any pending update without delivering it — paths that call `onUpdate` directly
  // (undo/setGrid) or discard the canvas (destroy) use this to cancel the scheduled frame.
  private discardPendingUpdate() {
    this.pendingUpdate = false
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle)
      this.rafHandle = null
    }
  }
}
