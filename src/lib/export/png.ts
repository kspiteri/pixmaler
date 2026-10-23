// Renders a grid to a standalone PNG: nearest-neighbour at an integer scale, flattened onto paper
// so untouched (-1) cells match the on-screen drawing instead of exporting as transparent holes.

export interface ExportGrid {
  grid: number[]
  palette: string[]
  gridW: number
  gridH: number
}

// Long edge the export reaches at least; the scale stays an integer so every cell is a crisp square.
const EXPORT_MIN_LONG_EDGE = 1024

export function exportScale(gridW: number, gridH: number): number {
  return Math.ceil(EXPORT_MIN_LONG_EDGE / Math.max(gridW, gridH, 1))
}

// The drawing's paper, resolved from the theme so no colour literal lives in TS.
export function paperColour(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()
}

// Paints a grid onto paper at (left, top), each cell a scale × scale square.
export function paintGrid(ctx: CanvasRenderingContext2D, src: ExportGrid, paper: string, scale: number, left = 0, top = 0): void {
  const { grid, palette, gridW, gridH } = src
  ctx.fillStyle = paper
  ctx.fillRect(left, top, gridW * scale, gridH * scale)
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      const idx = grid[y * gridW + x] ?? -1
      if (idx < 0)
        continue
      ctx.fillStyle = palette[idx] ?? paper
      ctx.fillRect(left + x * scale, top + y * scale, scale, scale)
    }
  }
}

export function renderExportCanvas(src: ExportGrid, paper: string, scale = exportScale(src.gridW, src.gridH)): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = src.gridW * scale
  canvas.height = src.gridH * scale
  paintGrid(canvas.getContext('2d')!, src, paper, scale)
  return canvas
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png')
  })
}

export function gridToPng(src: ExportGrid): Promise<Blob> {
  return canvasToPng(renderExportCanvas(src, paperColour()))
}
