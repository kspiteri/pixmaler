// Drawing canvas: cell rendering, swatch, square brush, mouse + touch input.

export interface CanvasOptions {
  gridW: number;
  gridH: number;
  palette: string[];
  targetGrid?: number[]; // if provided, renders as the reference image
  editable?: boolean;    // if false, read-only display (used for gallery/results)
  onUpdate?: (grid: number[]) => void;
  // Fires when the cursor moves to a different cell on an editable canvas, or
  // null when the cursor leaves. Used to mirror the position to a reference
  // canvas via `showMarker`.
  onHover?: (cell: { x: number; y: number } | null) => void;
}

const CELL_SIZE = 14; // px per grid cell at 1× scale — scales up on large screens

export class PixelCanvas {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private grid: number[];
  private opts: CanvasOptions;
  private selectedColor = 0;
  private brushSize = 1;
  private painting = false;
  private locked = false;
  private lastCell = -1;
  private lastCx = -1;
  private lastCy = -1;
  // Where the cursor currently sits (for refreshing the hover preview when
  // brush size changes mid-hover). Null when the cursor is off-canvas.
  private cursorCell: { x: number; y: number } | null = null;
  // Cells currently shown as a hover preview, keyed by `y * gridW + x` → original
  // palette index. We restore these when the hover moves or the cursor leaves.
  private hoverCells: Map<number, number> = new Map();
  // Cell currently highlighted by an outline marker (used on read-only canvases
  // so a cursor over the reference shows which cell it's pointing at).
  private markerCell: { x: number; y: number } | null = null;

  constructor(opts: CanvasOptions) {
    this.opts = opts;
    // Editable canvases start "blank" (-1 = untouched). Read-only canvases
    // either get the supplied targetGrid or default to all-zero. -1 cells
    // render transparent so the canvas's white background shows through.
    this.grid = opts.targetGrid
      ? [...opts.targetGrid]
      : new Array(opts.gridW * opts.gridH).fill(opts.editable ? -1 : 0);

    this.canvas = document.createElement("canvas");
    this.canvas.width = opts.gridW * CELL_SIZE;
    this.canvas.height = opts.gridH * CELL_SIZE;
    this.canvas.style.imageRendering = "pixelated";
    this.canvas.style.cursor = opts.editable ? "crosshair" : "default";
    this.canvas.style.display = "block";
    if (opts.editable) {
      this.canvas.style.background = "#fff";
      // Default border so the canvas edge is visible against a white page.
      // Call sites can override via Object.assign if they want a different look.
      this.canvas.style.border = "1px solid #ccc";
    }

    this.ctx = this.canvas.getContext("2d")!;
    this.render();

    if (opts.editable) this.attachInput();
    else this.attachReadOnlyHover();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  // Returns the current grid. Untouched cells (-1) are translated to 0 so
  // the wire format stays a valid `number[]` of palette indices.
  getGrid(): number[] {
    return this.grid.map(v => v < 0 ? 0 : v);
  }

  setGrid(grid: number[]) {
    this.grid = [...grid];
    this.render();
  }

  selectColor(index: number) {
    this.selectedColor = index;
  }

  setBrushSize(size: number) {
    this.brushSize = Math.max(1, Math.min(8, size));
    // Refresh the hover footprint immediately so the new size is visible
    // without requiring a mouse move.
    if (this.cursorCell && !this.painting) {
      this.showHover(this.cursorCell.x, this.cursorCell.y);
    }
  }

  getBrushSize(): number {
    return this.brushSize;
  }

  lock() {
    this.locked = true;
    this.painting = false;
    this.canvas.style.cursor = "default";
    this.clearHover();
  }

  isLocked(): boolean {
    return this.locked;
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  render() {
    const { gridW, gridH, palette } = this.opts;
    const ctx = this.ctx;
    // Clear first so untouched (-1) cells leave the canvas's bg visible.
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const idx = this.grid[y * gridW + x] ?? 0;
        if (idx < 0) continue;
        ctx.fillStyle = palette[idx] ?? "#000";
        ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }
  }

  // Repaint a single cell to its underlying grid colour. Used by the hover-
  // restore path so we don't re-render the whole canvas on every mousemove.
  // For untouched (-1) cells we clear instead of fill so the bg shows through.
  private repaintCell(cx: number, cy: number) {
    const { gridW, palette } = this.opts;
    const idx = this.grid[cy * gridW + cx] ?? 0;
    if (idx < 0) {
      this.ctx.clearRect(cx * CELL_SIZE, cy * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      return;
    }
    this.ctx.fillStyle = palette[idx] ?? "#000";
    this.ctx.fillRect(cx * CELL_SIZE, cy * CELL_SIZE, CELL_SIZE, CELL_SIZE);
  }

  // ── Marker (read-only hover indicator) ─────────────────────────────────────

  // Show or move an outline marker at the given cell. Pass null to clear.
  // Used on read-only canvases so a cursor reveals which cell it's over.
  showMarker(cell: { x: number; y: number } | null) {
    if (this.markerCell) this.restoreMarkerArea(this.markerCell.x, this.markerCell.y);
    this.markerCell = cell;
    if (cell) this.drawMarkerAt(cell.x, cell.y);
  }

  // The marker can spill into neighbouring cells when scaled up to hit the
  // display-pixel minimum, so restoring just one cell isn't enough. Compute
  // the bounding cell range covered by a marker centred on (cx, cy) and
  // repaint each one.
  private restoreMarkerArea(cx: number, cy: number) {
    const { gridW, gridH } = this.opts;
    const rect = this.canvas.getBoundingClientRect();
    const displayW = rect.width || this.canvas.width;
    const canvasPxPerDisplayPx = this.canvas.width / displayW;
    const minSize = Math.max(CELL_SIZE, Math.ceil(16 * canvasPxPerDisplayPx));
    // Halo `lineWidth` strokes half-outside the rect; account for the full
    // outer extent or the halo gets left behind on the next move.
    const haloWidth = Math.max(2, Math.round(3 * canvasPxPerDisplayPx));
    const outerPad = Math.ceil(haloWidth / 2) + 1;
    const half = minSize / 2;
    const cxPx = cx * CELL_SIZE + CELL_SIZE / 2;
    const cyPx = cy * CELL_SIZE + CELL_SIZE / 2;
    const x0 = Math.max(0, Math.floor((cxPx - half - outerPad) / CELL_SIZE));
    const y0 = Math.max(0, Math.floor((cyPx - half - outerPad) / CELL_SIZE));
    const x1 = Math.min(gridW - 1, Math.floor((cxPx + half + outerPad) / CELL_SIZE));
    const y1 = Math.min(gridH - 1, Math.floor((cyPx + half + outerPad) / CELL_SIZE));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        this.repaintCell(x, y);
      }
    }
  }

  // Draw a marker on the cell — used as a reference indicator driven by
  // another canvas's hover. Sized so it occupies at least ~MIN display pixels
  // regardless of how much the canvas is CSS-scaled down. On a tiny reference
  // image the marker spills into neighbouring cells; on a large one it stays
  // close to a single cell. Bright stroke + dark halo for contrast.
  private drawMarkerAt(cx: number, cy: number) {
    const ctx = this.ctx;
    const cxPx = cx * CELL_SIZE + CELL_SIZE / 2;
    const cyPx = cy * CELL_SIZE + CELL_SIZE / 2;

    // Convert "minimum display size" into canvas-pixels. If the canvas hasn't
    // been laid out yet (rect.width 0), fall back to one cell.
    const MIN_DISPLAY_PX = 16;
    const rect = this.canvas.getBoundingClientRect();
    const displayW = rect.width || this.canvas.width;
    const canvasPxPerDisplayPx = this.canvas.width / displayW;
    const minSize = Math.max(CELL_SIZE, Math.ceil(MIN_DISPLAY_PX * canvasPxPerDisplayPx));
    const half = minSize / 2;

    ctx.save();
    // Black halo first.
    ctx.lineWidth = Math.max(2, Math.round(3 * canvasPxPerDisplayPx));
    ctx.strokeStyle = "#000";
    ctx.strokeRect(cxPx - half, cyPx - half, minSize, minSize);
    // Bright accent on top.
    ctx.lineWidth = Math.max(1, Math.round(canvasPxPerDisplayPx));
    ctx.strokeStyle = "#0ff";
    ctx.strokeRect(cxPx - half, cyPx - half, minSize, minSize);
    ctx.restore();
  }

  // ── Hover preview ──────────────────────────────────────────────────────────

  // Show the brush footprint at (cx, cy) in the currently-selected colour.
  // Stores the original cell indices so we can restore them on the next move.
  private showHover(cx: number, cy: number) {
    if (this.locked) return;
    const { gridW, gridH, palette } = this.opts;
    const half = Math.floor(this.brushSize / 2);
    const next = new Map<number, number>();

    for (let dy = -half; dy < this.brushSize - half; dy++) {
      for (let dx = -half; dx < this.brushSize - half; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
        const key = ny * gridW + nx;
        // Capture original colour from the *grid* (not the canvas), so we
        // never accidentally remember a previously-painted hover preview.
        next.set(key, this.grid[key] ?? 0);
      }
    }

    // Restore any cells that were in the previous hover but not the new one.
    for (const [key] of this.hoverCells) {
      if (!next.has(key)) {
        const cy2 = Math.floor(key / gridW);
        const cx2 = key - cy2 * gridW;
        this.repaintCell(cx2, cy2);
      }
    }

    // Paint preview cells in the selected colour.
    this.ctx.fillStyle = palette[this.selectedColor] ?? "#000";
    for (const [key] of next) {
      const cy2 = Math.floor(key / gridW);
      const cx2 = key - cy2 * gridW;
      this.ctx.fillRect(cx2 * CELL_SIZE, cy2 * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    }

    this.hoverCells = next;
  }

  private clearHover() {
    if (this.hoverCells.size === 0) return;
    const { gridW } = this.opts;
    for (const [key] of this.hoverCells) {
      const cy = Math.floor(key / gridW);
      const cx = key - cy * gridW;
      this.repaintCell(cx, cy);
    }
    this.hoverCells.clear();
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  private attachInput() {
    const el = this.canvas;

    el.addEventListener("mousedown", e => {
      if (this.locked) return;
      this.painting = true;
      this.resetStroke();
      // Promote the hover preview into a real paint at the same cell.
      this.hoverCells.clear();
      this.paint(e);
    });
    el.addEventListener("mousemove", e => {
      if (this.locked) return;
      const { x, y } = this.eventCell(e.clientX, e.clientY);
      const { gridW, gridH } = this.opts;
      const inBounds = x >= 0 && y >= 0 && x < gridW && y < gridH;
      this.cursorCell = inBounds ? { x, y } : null;
      this.opts.onHover?.(this.cursorCell);
      if (this.painting) {
        this.paint(e);
      } else if (inBounds) {
        this.showHover(x, y);
      }
    });
    el.addEventListener("mouseup", () => { this.painting = false; this.resetStroke(); });
    el.addEventListener("mouseleave", () => {
      this.painting = false;
      this.resetStroke();
      this.clearHover();
      this.cursorCell = null;
      this.opts.onHover?.(null);
    });

    el.addEventListener("touchstart", e => { if (this.locked) return; e.preventDefault(); this.painting = true; this.resetStroke(); this.paintTouch(e); }, { passive: false });
    el.addEventListener("touchmove", e => { if (this.locked) return; e.preventDefault(); if (this.painting) this.paintTouch(e); }, { passive: false });
    el.addEventListener("touchend", () => { this.painting = false; this.resetStroke(); });
  }

  // Lightweight hover tracking for read-only canvases — fires `onHover` only,
  // no preview/marker (read-only canvases are typically the destination of a
  // marker driven by the editable canvas, not the source of one).
  private attachReadOnlyHover() {
    const el = this.canvas;
    el.addEventListener("mousemove", e => {
      const { x, y } = this.eventCell(e.clientX, e.clientY);
      const { gridW, gridH } = this.opts;
      const inBounds = x >= 0 && y >= 0 && x < gridW && y < gridH;
      this.opts.onHover?.(inBounds ? { x, y } : null);
    });
    el.addEventListener("mouseleave", () => this.opts.onHover?.(null));
  }

  private resetStroke() {
    this.lastCell = -1;
    this.lastCx = -1;
    this.lastCy = -1;
  }

  private paint(e: MouseEvent) {
    const { x, y } = this.eventCell(e.clientX, e.clientY);
    this.paintLine(x, y);
  }

  private paintTouch(e: TouchEvent) {
    const t = e.touches[0];
    const { x, y } = this.eventCell(t.clientX, t.clientY);
    this.paintLine(x, y);
  }

  private eventCell(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.opts.gridW / rect.width;
    const scaleY = this.opts.gridH / rect.height;
    return {
      x: Math.floor((clientX - rect.left) * scaleX),
      y: Math.floor((clientY - rect.top) * scaleY),
    };
  }

  // Bresenham line from last position to current — fills gaps on fast drags.
  private paintLine(cx: number, cy: number) {
    const { gridW, gridH } = this.opts;
    // Clamp to grid bounds before doing anything.
    cx = Math.max(0, Math.min(gridW - 1, cx));
    cy = Math.max(0, Math.min(gridH - 1, cy));

    if (this.lastCx === -1) {
      this.paintCell(cx, cy);
      this.lastCx = cx;
      this.lastCy = cy;
      return;
    }

    // Walk Bresenham line from last→current.
    let x0 = this.lastCx, y0 = this.lastCy;
    const x1 = cx, y1 = cy;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    while (true) {
      this.paintCell(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx)  { err += dx; y0 += sy; }
    }

    this.lastCx = cx;
    this.lastCy = cy;
  }

  private paintCell(cx: number, cy: number) {
    const { gridW, gridH } = this.opts;
    const cell = cy * gridW + cx;
    if (cell === this.lastCell) return;
    this.lastCell = cell;

    const half = Math.floor(this.brushSize / 2);
    let changed = false;
    for (let dy = -half; dy < this.brushSize - half; dy++) {
      for (let dx = -half; dx < this.brushSize - half; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
        const i = ny * gridW + nx;
        if (this.grid[i] !== this.selectedColor) {
          this.grid[i] = this.selectedColor;
          this.ctx.fillStyle = this.opts.palette[this.selectedColor];
          this.ctx.fillRect(nx * CELL_SIZE, ny * CELL_SIZE, CELL_SIZE, CELL_SIZE);
          changed = true;
        }
      }
    }
    if (changed) this.opts.onUpdate?.(this.getGrid());
  }
}

// ── Swatch UI ─────────────────────────────────────────────────────────────────

export interface SwatchHandle {
  element: HTMLElement;
  // Outline the swatch matching `index` to indicate "this is the colour at the
  // cell currently under the cursor". Pass null to clear.
  highlight: (index: number | null) => void;
}

export function buildSwatch(
  palette: string[],
  onSelect: (index: number) => void,
): SwatchHandle {
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;max-width:300px;align-items:center";

  const swatches: HTMLElement[] = [];
  let selectedIndex = 0;
  let highlightedIndex: number | null = null;

  const HIGHLIGHT_BORDER = "#ff0";
  const SELECTED_BORDER = "#fff";
  const DEFAULT_BORDER = "#555";
  const BASE_SIZE = 28;
  const SELECTED_SIZE = 40;

  function colourFor(i: number): string {
    if (i === selectedIndex) return SELECTED_BORDER;
    if (i === highlightedIndex) return HIGHLIGHT_BORDER;
    return DEFAULT_BORDER;
  }

  function applyState() {
    swatches.forEach((s, i) => {
      s.style.borderColor = colourFor(i);
      s.style.borderWidth = i === selectedIndex ? "3px" : "2px";
      const size = i === selectedIndex ? SELECTED_SIZE : BASE_SIZE;
      s.style.width = `${size}px`;
      s.style.height = `${size}px`;
    });
  }

  palette.forEach((hex, i) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.style.cssText = `width:${BASE_SIZE}px;height:${BASE_SIZE}px;background:${hex};border:2px solid ${DEFAULT_BORDER};cursor:pointer;padding:0;transition:width 80ms,height 80ms`;
    swatch.title = hex;
    swatch.addEventListener("click", () => {
      selectedIndex = i;
      applyState();
      onSelect(i);
    });
    swatches.push(swatch);
    wrap.appendChild(swatch);
  });

  // Apply initial state (first swatch selected by default).
  applyState();

  return {
    element: wrap,
    highlight: (index: number | null) => {
      if (index === highlightedIndex) return;
      highlightedIndex = index;
      applyState();
    },
  };
}

// ── Brush size controls ───────────────────────────────────────────────────────

export function buildBrushControls(pc: PixelCanvas): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;align-items:center;gap:8px;font-family:monospace";

  const label = document.createElement("span");
  label.textContent = `brush: ${pc.getBrushSize()}`;
  label.style.minWidth = "60px";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "1";
  slider.max = "8";
  slider.value = String(pc.getBrushSize());
  slider.style.cssText = "vertical-align:middle;width:140px";
  slider.addEventListener("input", () => {
    pc.setBrushSize(parseInt(slider.value, 10));
    label.textContent = `brush: ${pc.getBrushSize()}`;
  });

  wrap.append(slider, label);
  return wrap;
}

