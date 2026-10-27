// PNG export renderer — needs a real canvas: the pixels must match the drawing on screen, with
// untouched (-1) cells flattened onto paper rather than exported as transparent holes.

import { afterEach, describe, expect, it } from 'vitest'
import { canvasToPng, gridToPng, renderExportCanvas } from '@/lib'

const PAPER = '#ffffff'
const palette = ['#ff0000', '#0000ff']
// 3×2, one untouched cell in the middle of the top row.
const drawing = { grid: [0, -1, 1, 1, 0, 0], palette, gridW: 3, gridH: 2 }

function pixel(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  return [...canvas.getContext('2d')!.getImageData(x, y, 1, 1).data]
}

describe('renderExportCanvas', () => {
  it('draws each cell as a crisp scale × scale square', () => {
    const canvas = renderExportCanvas(drawing, PAPER, 10)
    expect([canvas.width, canvas.height]).toEqual([30, 20])
    // No off-by-one: a cell's near and far edges both keep its colour.
    expect(pixel(canvas, 20, 0)).toEqual([0, 0, 255, 255])
    expect(pixel(canvas, 29, 9)).toEqual([0, 0, 255, 255])
    expect(pixel(canvas, 0, 10)).toEqual([0, 0, 255, 255])
    expect(pixel(canvas, 10, 19)).toEqual([255, 0, 0, 255])
  })

  it('fills untouched cells with opaque paper', () => {
    const canvas = renderExportCanvas(drawing, PAPER, 10)
    expect(pixel(canvas, 15, 5)).toEqual([255, 255, 255, 255])
  })

  it('encodes a PNG of the rendered size', async () => {
    const blob = await canvasToPng(renderExportCanvas(drawing, PAPER, 4))
    expect(blob.type).toBe('image/png')
    const bitmap = await createImageBitmap(blob)
    expect([bitmap.width, bitmap.height]).toEqual([12, 8])
  })
})

describe('gridToPng', () => {
  afterEach(() => document.documentElement.style.removeProperty('--paper'))

  it('exports at the scale that first reaches 1024 px, on the theme\'s paper', async () => {
    document.documentElement.style.setProperty('--paper', '#fafaf0')
    const grid = Array.from<number>({ length: 61 * 41 }).fill(0)
    grid[61 + 1] = -1
    const bitmap = await createImageBitmap(await gridToPng({ grid, palette, gridW: 61, gridH: 41 }))
    // ceil(1024 / 61) = 17 px per cell.
    expect([bitmap.width, bitmap.height]).toEqual([1037, 697])
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
    // The untouched cell at (1, 1) spans 17..33 on both axes.
    expect(pixel(canvas, 25, 25)).toEqual([0xFA, 0xFA, 0xF0, 255])
    expect(pixel(canvas, 8, 8)).toEqual([255, 0, 0, 255])
  })
})
