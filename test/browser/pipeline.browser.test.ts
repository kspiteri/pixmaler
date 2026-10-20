// BP2 — image pipeline, browser half: the real decode→crop→flatten→sample glue over a
// canvas, plus the live alpha scan. None reachable without a DOM, so out of the Node suite.

import { afterEach, describe, expect, it } from 'vitest'
import { hasTransparency, processImage, sampleImage } from '@/lib'

// Draw a known image and hand it back as a PNG File, so the pipeline decodes real bytes.
async function imageFile(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  draw(canvas.getContext('2d')!)
  const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png'))
  return new File([blob], 'known.png', { type: 'image/png' })
}

// A drawn canvas as an ImageBitmap, for the direct-bitmap functions.
async function bitmap(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): Promise<ImageBitmap> {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  draw(canvas.getContext('2d')!)
  return createImageBitmap(canvas)
}

// Parse a palette hex into its RGB channels.
function rgbOf(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('image pipeline, browser half', () => {
  it('decodes, crops and samples a two-colour source into a grid of those colours', async () => {
    // Left half red, right half green, in a square so the square ratio keeps the whole image.
    const file = await imageFile(64, 64, (ctx) => {
      ctx.fillStyle = '#ff0000'
      ctx.fillRect(0, 0, 32, 64)
      ctx.fillStyle = '#00ff00'
      ctx.fillRect(32, 0, 32, 64)
    })

    const result = await processImage(file, 8, 16, 'square')
    const { gridW, targetGrid, palette } = result

    // A cell well inside the left band is red-dominant; one inside the right band is green-dominant.
    const [lr, lg, lb] = rgbOf(palette[targetGrid[1 * gridW + 1]])
    const [rr, rg, rb] = rgbOf(palette[targetGrid[1 * gridW + (gridW - 2)]])
    expect(lr).toBeGreaterThan(lg)
    expect(lr).toBeGreaterThan(lb)
    expect(rg).toBeGreaterThan(rr)
    expect(rg).toBeGreaterThan(rb)
  })

  it('flattens a transparent source onto the chosen background, not black', async () => {
    // Left half opaque red, right half left transparent.
    const file = await imageFile(32, 32, (ctx) => {
      ctx.fillStyle = '#ff0000'
      ctx.fillRect(0, 0, 16, 32)
    })

    // Background green shows through the transparent half after the flatten.
    const { gridW, rgba } = await sampleImage(file, 8, 'square', undefined, '#00ff00')

    const far = (1 * gridW + (gridW - 1)) * 4
    const [r, g, b] = [rgba[far], rgba[far + 1], rgba[far + 2]]
    expect(g).toBeGreaterThan(r)
    expect(g).toBeGreaterThan(b)
    expect(r + g + b).toBeGreaterThan(0) // flattened, so not the black a bare transparent pixel reads as

    const near = (1 * gridW + 1) * 4
    expect(rgba[near]).toBeGreaterThan(rgba[near + 1]) // opaque red survived
  })

  it('reports transparency only when a pixel is less than fully opaque', async () => {
    const opaque = await bitmap(8, 8, (ctx) => {
      ctx.fillStyle = '#ff0000'
      ctx.fillRect(0, 0, 8, 8)
    })
    expect(hasTransparency(opaque)).toBe(false)

    const holed = await bitmap(8, 8, (ctx) => {
      ctx.fillStyle = '#ff0000'
      ctx.fillRect(0, 0, 8, 8)
      ctx.clearRect(0, 0, 1, 1) // a single transparent pixel is enough
    })
    expect(hasTransparency(holed)).toBe(true)
  })
})
