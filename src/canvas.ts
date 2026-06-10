// Drawing canvas: grid rendering, swatch, square brush, mouse + touch input.


export interface CanvasOptions {
  gridW: number;
  gridH: number;
  palette: string[];
  targetGrid?: number[]; // if provided, renders as the reference image
  editable?: boolean;    // if false, read-only display (used for gallery/results)
  onUpdate?: (grid: number[]) => void;
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

  constructor(opts: CanvasOptions) {
    this.opts = opts;
    this.grid = opts.targetGrid ? [...opts.targetGrid] : new Array(opts.gridW * opts.gridH).fill(0);

    this.canvas = document.createElement("canvas");
    this.canvas.width = opts.gridW * CELL_SIZE;
    this.canvas.height = opts.gridH * CELL_SIZE;
    this.canvas.style.imageRendering = "pixelated";
    this.canvas.style.cursor = opts.editable ? "crosshair" : "default";
    this.canvas.style.display = "block";

    this.ctx = this.canvas.getContext("2d")!;
    this.render();

    if (opts.editable) this.attachInput();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  getGrid(): number[] {
    return [...this.grid];
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
  }

  getBrushSize(): number {
    return this.brushSize;
  }

  lock() {
    this.locked = true;
    this.painting = false;
    this.canvas.style.cursor = "default";
  }

  isLocked(): boolean {
    return this.locked;
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  render() {
    const { gridW, gridH, palette } = this.opts;
    const ctx = this.ctx;
    for (let y = 0; y < gridH; y++) {
      for (let x = 0; x < gridW; x++) {
        const idx = this.grid[y * gridW + x] ?? 0;
        ctx.fillStyle = palette[idx] ?? "#000";
        ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
      }
    }
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  private attachInput() {
    const el = this.canvas;

    el.addEventListener("mousedown", e => { if (this.locked) return; this.painting = true; this.resetStroke(); this.paint(e); });
    el.addEventListener("mousemove", e => { if (this.painting && !this.locked) this.paint(e); });
    el.addEventListener("mouseup", () => { this.painting = false; this.resetStroke(); });
    el.addEventListener("mouseleave", () => { this.painting = false; this.resetStroke(); });

    el.addEventListener("touchstart", e => { if (this.locked) return; e.preventDefault(); this.painting = true; this.resetStroke(); this.paintTouch(e); }, { passive: false });
    el.addEventListener("touchmove", e => { if (this.locked) return; e.preventDefault(); if (this.painting) this.paintTouch(e); }, { passive: false });
    el.addEventListener("touchend", () => { this.painting = false; this.resetStroke(); });
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

export function buildSwatch(
  palette: string[],
  onSelect: (index: number) => void,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;max-width:300px";

  const swatches: HTMLElement[] = [];

  palette.forEach((hex, i) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.style.cssText = `width:28px;height:28px;background:${hex};border:2px solid #555;cursor:pointer;padding:0`;
    swatch.title = hex;
    swatch.addEventListener("click", () => {
      swatches.forEach(s => s.style.borderColor = "#555");
      swatch.style.borderColor = "#fff";
      onSelect(i);
    });
    swatches.push(swatch);
    wrap.appendChild(swatch);
  });

  // Select first color by default.
  if (swatches[0]) swatches[0].style.borderColor = "#fff";

  return wrap;
}

// ── Brush size controls ───────────────────────────────────────────────────────

export function buildBrushControls(pc: PixelCanvas): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;align-items:center;gap:8px;font-family:monospace";

  const label = document.createElement("span");
  label.textContent = `brush: ${pc.getBrushSize()}`;

  const dec = document.createElement("button");
  dec.type = "button";
  dec.textContent = "−";
  dec.addEventListener("click", () => {
    pc.setBrushSize(pc.getBrushSize() - 1);
    label.textContent = `brush: ${pc.getBrushSize()}`;
  });

  const inc = document.createElement("button");
  inc.textContent = "+";
  inc.addEventListener("click", () => {
    pc.setBrushSize(pc.getBrushSize() + 1);
    label.textContent = `brush: ${pc.getBrushSize()}`;
  });

  wrap.append(dec, label, inc);
  return wrap;
}
