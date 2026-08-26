// Drawing canvas: cell rendering, swatch, square brush, mouse + touch input.

import { brushMaxFor, defaultBrushFor } from './aspect'

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

  // Returns the current grid. Untouched cells remain `-1` on the wire so
  // read-only renderers can draw them as transparent (showing the canvas's
  // white background through), keeping submitted drawings looking like
  // strokes on paper rather than filled onto palette[0].
  getGrid(): number[] {
    return [...this.grid]
  }

  // Replace the whole grid. Notifies via `onUpdate`, exactly like a stroke or an
  // `undo()` does: its only callers are the destructive Clear actions, and both
  // the wire-side state (DRAWING's auto-submit) and any UI mirroring `canUndo()`
  // have to catch up the same way. Without the notify, clearing mid-round left
  // the server holding the pre-clear drawing until the next stroke.
  setGrid(grid: number[]) {
    this.grid = [...grid]
    this.render()
    this.opts.onUpdate?.(this.getGrid())
  }

  // Fit the canvas's DISPLAY size (CSS width/height) into the given available
  // box while preserving the grid's aspect ratio (Pattern A — Piskel-style
  // fit-zoom). The drawing bitmap (`canvas.width/height`) is never touched, so:
  //   - pointer→cell mapping stays correct — `eventCell` reads
  //     `getBoundingClientRect()` and divides per axis, so any display size
  //     works as long as the box keeps the grid's aspect ratio, which a single
  //     shared `scale` guarantees (no squish);
  //   - pixels stay crisp via `image-rendering: pixelated`.
  //
  // The scale is deliberately NOT snapped to whole display pixels per cell: flooring
  // 384 cells in a 1082px slot from 2.818 to 2 px/cell lost 29% of the width. The cost
  // is that adjacent cells can differ by one display pixel, invisible at these sizes.
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
    const half = Math.floor(this.brushSize / 2)
    const next = new Map<number, number>()

    for (let dy = -half; dy < this.brushSize - half; dy++) {
      for (let dx = -half; dx < this.brushSize - half; dx++) {
        const nx = cx + dx; const ny = cy + dy
        if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH)
          continue
        const key = ny * gridW + nx
        // Capture original colour from the *grid* (not the canvas), so we
        // never accidentally remember a previously-painted hover preview.
        next.set(key, this.grid[key] ?? 0)
      }
    }

    // Restore any cells that were in the previous hover but not the new one.
    for (const [key] of this.hoverCells) {
      if (!next.has(key)) {
        const cy2 = Math.floor(key / gridW)
        const cx2 = key - cy2 * gridW
        this.repaintCell(cx2, cy2)
      }
    }

    // Paint preview cells in the selected colour.
    this.ctx.fillStyle = palette[this.selectedColor] ?? '#000'
    for (const [key] of next) {
      const cy2 = Math.floor(key / gridW)
      const cx2 = key - cy2 * gridW
      this.ctx.fillRect(cx2 * CELL_SIZE, cy2 * CELL_SIZE, CELL_SIZE, CELL_SIZE)
    }

    this.hoverCells = next
  }

  private clearHover() {
    if (this.hoverCells.size === 0)
      return
    const { gridW } = this.opts
    for (const [key] of this.hoverCells) {
      const cy = Math.floor(key / gridW)
      const cx = key - cy * gridW
      this.repaintCell(cx, cy)
    }
    this.hoverCells.clear()
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  private attachInput() {
    const el = this.canvas
    // Don't let the browser hijack drags as scroll/pan/selection on touch —
    // we handle all pointer movement ourselves.
    el.style.touchAction = 'none'

    // Unified Pointer Events (mouse + touch + pen in one path). On pointerdown
    // we `setPointerCapture`, so every subsequent pointermove/up is delivered to
    // this canvas even when the cursor leaves it — fixing the bug where dragging
    // off the canvas and back (button still held) silently stopped painting.
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
          // Pen lifts off the paper: while out of bounds we paint nothing (no
          // edge-clamp smear), and reset the stroke so re-entry begins a fresh
          // segment rather than drawing a line across the off-canvas gap.
          // Capture still delivers these moves, so re-entry resumes without a
          // new click.
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

    // Pointer leaving the element hides the hover preview. An in-progress stroke
    // is NOT ended (capture keeps delivering moves so the user can drag back in
    // and continue) — but pointermove handles the "paint nothing while out"
    // behaviour; here we just clear the visual preview/marker.
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

  private eventCell(clientX: number, clientY: number): { x: number, y: number } {
    const rect = this.canvas.getBoundingClientRect()
    const scaleX = this.opts.gridW / rect.width
    const scaleY = this.opts.gridH / rect.height
    return {
      x: Math.floor((clientX - rect.left) * scaleX),
      y: Math.floor((clientY - rect.top) * scaleY),
    }
  }

  // Bresenham line from last position to current — fills gaps on fast drags.
  private paintLine(cx: number, cy: number) {
    const { gridW, gridH } = this.opts
    // Clamp to grid bounds before doing anything.
    cx = Math.max(0, Math.min(gridW - 1, cx))
    cy = Math.max(0, Math.min(gridH - 1, cy))

    if (this.lastCx === -1) {
      this.paintCell(cx, cy)
      this.lastCx = cx
      this.lastCy = cy
      return
    }

    // Walk Bresenham line from last→current.
    let x0 = this.lastCx; let y0 = this.lastCy
    const x1 = cx; const y1 = cy
    const dx = Math.abs(x1 - x0); const dy = Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1; const sy = y0 < y1 ? 1 : -1
    let err = dx - dy
    while (true) {
      this.paintCell(x0, y0)
      if (x0 === x1 && y0 === y1)
        break
      const e2 = 2 * err
      if (e2 > -dy) { err -= dy; x0 += sx }
      if (e2 < dx) { err += dx; y0 += sy }
    }

    this.lastCx = cx
    this.lastCy = cy
  }

  private paintCell(cx: number, cy: number) {
    const { gridW, gridH } = this.opts
    const cell = cy * gridW + cx
    if (cell === this.lastCell)
      return
    this.lastCell = cell

    const half = Math.floor(this.brushSize / 2)
    let changed = false
    for (let dy = -half; dy < this.brushSize - half; dy++) {
      for (let dx = -half; dx < this.brushSize - half; dx++) {
        const nx = cx + dx; const ny = cy + dy
        if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH)
          continue
        const i = ny * gridW + nx
        if (this.grid[i] !== this.selectedColor) {
          this.grid[i] = this.selectedColor
          this.ctx.fillStyle = this.opts.palette[this.selectedColor]
          this.ctx.fillRect(nx * CELL_SIZE, ny * CELL_SIZE, CELL_SIZE, CELL_SIZE)
          changed = true
        }
      }
    }
    if (changed)
      this.opts.onUpdate?.(this.getGrid())
  }
}

// ── Swatch UI ─────────────────────────────────────────────────────────────────

export interface SwatchHandle {
  element: HTMLElement
  // Outline the swatch matching `index` to indicate "this is the colour at the
  // cell currently under the cursor". Pass null to clear.
  highlight: (index: number | null) => void
}

export function buildSwatch(
  palette: string[],
  onSelect: (index: number) => void,
): SwatchHandle {
  // Builds a 4-column grid of clickable colour buttons. Behaviour lives
  // here; appearance (sizes, gaps, borders) lives in the consuming Vue
  // component's scoped CSS via :deep(.swatch__cell) etc.

  const wrap = document.createElement('div')
  wrap.className = 'swatch'

  const cells: HTMLElement[] = []
  let selectedIndex = 0
  let highlightedIndex: number | null = null

  function applyState() {
    cells.forEach((cell, i) => {
      cell.classList.toggle('swatch__cell--selected', i === selectedIndex)
      cell.classList.toggle(
        'swatch__cell--highlighted',
        i !== selectedIndex && i === highlightedIndex,
      )
    })
  }

  palette.forEach((hex, i) => {
    const cell = document.createElement('button')
    cell.type = 'button'
    cell.className = 'swatch__cell'
    // Background colour is per-instance and not stylable from CSS without
    // CSS custom properties — inline is the right escape hatch here.
    cell.style.background = hex
    cell.title = hex
    cell.addEventListener('click', () => {
      selectedIndex = i
      applyState()
      onSelect(i)
    })
    cells.push(cell)
    wrap.appendChild(cell)
  })

  // Apply initial state (first swatch selected by default).
  applyState()

  return {
    element: wrap,
    highlight: (index: number | null) => {
      if (index === highlightedIndex)
        return
      highlightedIndex = index
      applyState()
    },
  }
}

// ── Brush size controls ───────────────────────────────────────────────────────

export function buildBrushControls(pc: PixelCanvas): HTMLElement {
  // Behaviour only — appearance lives in the consuming Vue component's CSS.
  const wrap = document.createElement('div')
  wrap.className = 'brush'

  const slider = document.createElement('input')
  slider.className = 'brush__slider'
  slider.type = 'range'
  slider.min = '1'
  slider.max = String(pc.getBrushMax())
  slider.value = String(pc.getBrushSize())

  const label = document.createElement('span')
  label.className = 'brush__label'
  label.textContent = `brush: ${pc.getBrushSize()}`

  slider.addEventListener('input', () => {
    pc.setBrushSize(Number.parseInt(slider.value, 10))
    label.textContent = `brush: ${pc.getBrushSize()}`
  })

  wrap.append(slider, label)
  return wrap
}
