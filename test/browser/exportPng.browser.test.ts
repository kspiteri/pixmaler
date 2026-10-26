// PNG export renderer — needs a real canvas: the pixels must match the drawing on screen, with
// untouched (-1) cells flattened onto paper rather than exported as transparent holes.

import { describe, expect, it } from 'vitest'
import { canvasToPng, renderExportCanvas } from '@/lib'

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
