// Share card renderer — needs a real canvas: the panels must carry the exact target and drawing
// pixels on paper, on the theme's background, with the player's seat chip and name in the footer.

import type { CardTheme, Seat, ShareCard } from '@/lib'
import { afterEach, describe, expect, it } from 'vitest'
import { cardLayout, loadFaces, renderShareCard, shareCardPng } from '@/lib'

const BG = [0x10, 0x10, 0x10, 255]
const SEAT = [0x00, 0xC4, 0x6D, 255]
const INK = [0x0E, 0x0E, 0x12, 255]

const theme: CardTheme = { bg: '#101010', fg: '#f0f0f0', muted: '#a0a0a0', paper: '#ffffff', accent: '#c8ff2d', ink: '#0e0e12', accentDrop: null }
const seat: Seat = { colour: '#00c46d', shape: 'square', initial: 'B', seed: 'seed', lean: 0 }
// 3×2 (landscape, so stacked): the target is all red; the drawing paints only its first cell blue.
const card: ShareCard = {
  gridW: 3,
  gridH: 2,
  palette: ['#ff0000', '#0000ff'],
  target: [0, 0, 0, 0, 0, 0],
  drawing: [1, -1, -1, -1, -1, -1],
  player: { name: 'Big Al', seat },
}
const URL = 'example.test/pixmaler'
const layout = cardLayout(card.gridW, card.gridH)

function blank(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = size
  return c
}

// A stand-in face: opaque black lines in the middle half, transparent around them.
function face(): HTMLCanvasElement {
  const c = blank(4)
  const ctx = c.getContext('2d')!
  ctx.fillRect(1, 1, 2, 2)
  return c
}

function pixel(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  return [...canvas.getContext('2d')!.getImageData(x, y, 1, 1).data]
}

// Pixels in a horizontal band that differ from the background: zero means nothing was drawn there.
function inkIn(canvas: HTMLCanvasElement, top: number, bottom: number): number {
  const { data } = canvas.getContext('2d')!.getImageData(0, top, canvas.width, bottom - top)
  let ink = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== BG[0] || data[i + 1] !== BG[1] || data[i + 2] !== BG[2])
      ink++
  }
  return ink
}

// Non-background pixels inside a rectangle.
function inkInRect(canvas: HTMLCanvasElement, x: number, y: number, w: number, h: number): number {
  const { data } = canvas.getContext('2d')!.getImageData(x, y, w, h)
  let ink = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== BG[0] || data[i + 1] !== BG[1] || data[i + 2] !== BG[2])
      ink++
  }
  return ink
}

describe('renderShareCard', () => {
  it('draws at the layout size on the theme background', () => {
    const canvas = renderShareCard(card, URL, theme, blank(4), null)
    expect([canvas.width, canvas.height]).toEqual([layout.width, layout.height])
    expect(pixel(canvas, 2, 2)).toEqual(BG)
  })

  it('paints the target and the drawing in their panels, untouched cells on paper', () => {
    const canvas = renderShareCard(card, URL, theme, blank(4), null)
    const { target, drawing, scale } = layout
    expect(pixel(canvas, target.x + target.w - 1, target.y + target.h - 1)).toEqual([255, 0, 0, 255])
    expect(pixel(canvas, drawing.x, drawing.y)).toEqual([0, 0, 255, 255])
    expect(pixel(canvas, drawing.x + scale, drawing.y)).toEqual([255, 255, 255, 255])
  })

  it('draws the seat chip in its colour and silhouette', () => {
    const { chip } = layout
    const square = renderShareCard(card, URL, theme, blank(4), null)
    expect(pixel(square, chip.x + 1, chip.y + 1)).toEqual(SEAT)
    const circle = renderShareCard({ ...card, player: { name: 'Big Al', seat: { ...seat, shape: 'circle' } } }, URL, theme, blank(4), null)
    expect(pixel(circle, chip.x + 1, chip.y + 1)).toEqual(BG)
    expect(pixel(circle, chip.x + chip.w / 2, chip.y + 2)).toEqual(SEAT)
  })

  it('recolours the face to chip ink and keeps the seat colour around it', () => {
    const { chip } = layout
    const canvas = renderShareCard(card, URL, theme, blank(4), face())
    expect(pixel(canvas, chip.x + chip.w / 2, chip.y + chip.h / 2)).toEqual(INK)
    expect(pixel(canvas, chip.x + 2, chip.y + 2)).toEqual(SEAT)
  })

  it('clips the face to the silhouette', () => {
    const { chip } = layout
    const opaque = blank(4)
    opaque.getContext('2d')!.fillRect(0, 0, 4, 4)
    const canvas = renderShareCard({ ...card, player: { name: 'Big Al', seat: { ...seat, shape: 'circle' } } }, URL, theme, blank(4), opaque)
    expect(pixel(canvas, chip.x + 1, chip.y + 1)).toEqual(BG)
    expect(pixel(canvas, chip.x + chip.w / 2, chip.y + 2)).toEqual(INK)
  })

  it('draws the initial in chip ink when there is no face', () => {
    const { chip } = layout
    const canvas = renderShareCard(card, URL, theme, blank(4), null)
    const { data } = canvas.getContext('2d')!.getImageData(chip.x, chip.y, chip.w, chip.h)
    let ink = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === INK[0] && data[i + 1] === INK[1] && data[i + 2] === INK[2])
        ink++
    }
    expect(ink).toBeGreaterThan(0)
  })

  it('keeps the chip upright whatever the seat\'s lean: shared images carry no wonk', () => {
    const { chip } = layout
    for (const lean of [1, -1]) {
      const canvas = renderShareCard({ ...card, player: { name: 'Big Al', seat: { ...seat, lean } } }, URL, theme, blank(4), null)
      expect(pixel(canvas, chip.x + 1, chip.y + 1)).toEqual(SEAT)
    }
  })

  it('leaves the chip out for a player with no seat, and the whole tag out with no player', () => {
    const { chip, footer } = layout
    const noSeat = renderShareCard({ ...card, player: { name: 'Big Al', seat: null } }, URL, theme, blank(4), null)
    expect(pixel(noSeat, chip.x + 1, chip.y + 1)).toEqual(BG)
    // The name sits in the footer's upper half; the URL takes its place when there's no player.
    const nameBand = (c: HTMLCanvasElement) => inkIn(c, footer.y + 22, footer.y + 34)
    expect(nameBand(noSeat)).toBeGreaterThan(0)
    expect(nameBand(renderShareCard({ ...card, player: null }, URL, theme, blank(4), null))).toBe(0)
  })

  it('cuts a name too wide for the card instead of running past its edge', () => {
    // A large landscape grid gives the narrowest footer; 24 wide letters (the name cap) overflow it.
    const big = { ...card, gridW: 384, gridH: 256, target: Array.from<number>({ length: 384 * 256 }).fill(0), drawing: Array.from<number>({ length: 384 * 256 }).fill(-1), player: { name: 'W'.repeat(24), seat } }
    const l = cardLayout(384, 256)
    const canvas = renderShareCard(big, URL, theme, blank(4), null)
    const pad = l.footer.x
    expect(inkInRect(canvas, l.width - pad, l.footer.y + 14, pad, 60)).toBe(0)
  })

  it('keeps the light theme\'s wordmark shadow off everything after it', () => {
    const canvas = renderShareCard(card, URL, { ...theme, accentDrop: '#485f01' }, blank(4), null)
    const { target } = layout
    // Just below the target panel, in the gap: a leaked shadow would darken it.
    expect(pixel(canvas, target.x + target.w - 2, target.y + target.h + 3)).toEqual(BG)
  })
})

// The whole export path: seat colours arrive as `var()` references and the face comes from the
// real generator, whose viewBox-only SVG Firefox only draws once it's given a size.
describe('shareCardPng', () => {
  const root = document.documentElement.style
  afterEach(() => {
    root.removeProperty('--test-seat')
    root.removeProperty('--ink-on-colour')
  })

  async function chipPixels(seed: string): Promise<Uint8ClampedArray> {
    const blob = await shareCardPng({ ...card, player: { name: 'Big Al', seat: { ...seat, colour: 'var(--test-seat)', seed } } })
    const bitmap = await createImageBitmap(blob)
    const canvas = blank(0)
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    const { chip } = layout
    return ctx.getImageData(chip.x, chip.y, chip.w, chip.h).data
  }

  it('resolves a var() seat colour before filling the chip', async () => {
    root.setProperty('--test-seat', '#00c46d')
    const data = await chipPixels('')
    expect([...data.slice(4, 8)]).toEqual(SEAT)
  })

  // Order matters: this runs before the face generator has loaded in this file.
  it('never waits for the face generator: before it loads, the chip shows the initial', async () => {
    root.setProperty('--test-seat', '#00c46d')
    root.setProperty('--ink-on-colour', '#0e0e12')
    const [beforeLoad, initialOnly] = await Promise.all([chipPixels('seed'), chipPixels('')])
    expect(beforeLoad).toEqual(initialOnly)
  })

  it('draws the generated face once it has loaded, in every engine', async () => {
    root.setProperty('--test-seat', '#00c46d')
    root.setProperty('--ink-on-colour', '#0e0e12')
    await loadFaces()
    // An empty seed has no face, so that chip shows the initial; a real seed must differ from it.
    const [withFace, initialOnly] = await Promise.all([chipPixels('seed'), chipPixels('')])
    expect(withFace).not.toEqual(initialOnly)
  })
})
