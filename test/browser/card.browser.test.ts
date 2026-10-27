// Share card renderer — needs a real canvas: the panels must carry the exact target and drawing
// pixels on paper, on the theme's background, with the player's seat chip and name in the footer.

import type { AvatarShape, CardTheme, Seat, ShareCard } from '@/lib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cardLayout, loadFaces, renderShareCard, shareCardPng } from '@/lib'

const BG = [0x10, 0x10, 0x10, 255]
const SEAT = [0x00, 0xC4, 0x6D, 255]
const INK = [0x0E, 0x0E, 0x12, 255]
const MUTED = [0xA0, 0xA0, 0xA0, 255]
const ACCENT = [0xC8, 0xFF, 0x2D, 255]
const MARK = [0xFF, 0x00, 0xFF, 255]

const theme: CardTheme = { bg: '#101010', fg: '#f0f0f0', muted: '#a0a0a0', paper: '#ffffff', accent: '#c8ff2d', ink: '#0e0e12', edge: '#505050', accentDrop: null }
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

// A stand-in pixel mark: one solid colour, so its ink is told apart from the wordmark's.
function mark(): HTMLCanvasElement {
  const c = blank(4)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ff00ff'
  ctx.fillRect(0, 0, 4, 4)
  return c
}

// Bounds of the pixels exactly `rgba` inside a rectangle, or null when there are none.
function bounds(canvas: HTMLCanvasElement, rgba: number[], x: number, y: number, w: number, h: number): { left: number, top: number, bottom: number } | null {
  const { data } = canvas.getContext('2d')!.getImageData(x, y, w, h)
  let found: { left: number, top: number, bottom: number } | null = null
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== rgba[0] || data[i + 1] !== rgba[1] || data[i + 2] !== rgba[2] || data[i + 3] !== rgba[3])
      continue
    const px = (i / 4) % w
    const py = Math.floor(i / 4 / w)
    found = found
      ? { left: Math.min(found.left, px), top: Math.min(found.top, py), bottom: Math.max(found.bottom, py) }
      : { left: px, top: py, bottom: py }
  }
  return found
}

function count(canvas: HTMLCanvasElement, rgba: number[], x: number, y: number, w: number, h: number): number {
  const { data } = canvas.getContext('2d')!.getImageData(x, y, w, h)
  let n = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] === rgba[0] && data[i + 1] === rgba[1] && data[i + 2] === rgba[2] && data[i + 3] === rgba[3])
      n++
  }
  return n
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

afterEach(() => {
  vi.restoreAllMocks()
})

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

  it('leaves a clear gap under the art and sets the URL below the name', () => {
    const canvas = renderShareCard(card, URL, theme, blank(4), null)
    const { drawing, footer } = layout
    const artBottom = drawing.y + drawing.h
    // Past the panel's 1px edge, 32px of nothing before the footer begins.
    expect(inkIn(canvas, artBottom + 1, artBottom + 32)).toBe(0)
    // What the URL adds sits wholly below the name's baseline, 58px into the footer.
    const noUrl = renderShareCard(card, '', theme, blank(4), null)
    const changed = (top: number, bottom: number) => {
      const a = canvas.getContext('2d')!.getImageData(0, top, canvas.width, bottom - top).data
      const b = noUrl.getContext('2d')!.getImageData(0, top, canvas.width, bottom - top).data
      return a.filter((v, i) => v !== b[i]).length
    }
    expect(changed(footer.y, footer.y + 60)).toBe(0)
    expect(count(canvas, MUTED, 0, footer.y + 60, canvas.width, footer.h - 60)).toBeGreaterThan(0)
  })

  it('leads with the wordmark and trails a small mark, as the app\'s logo does', () => {
    const canvas = renderShareCard(card, URL, theme, mark(), null)
    const { header } = layout
    const word = bounds(canvas, ACCENT, header.x, header.y, header.w, header.h)!
    const sign = bounds(canvas, MARK, header.x, header.y, header.w, header.h)!
    expect(word.left).toBeLessThan(sign.left)
    expect(sign.bottom - sign.top + 1).toBeLessThanOrEqual(0.6 * (word.bottom - word.top + 1))
  })

  it('outlines each panel in the theme\'s canvas edge', () => {
    const canvas = renderShareCard(card, URL, theme, blank(4), null)
    const edge = [0x50, 0x50, 0x50, 255]
    for (const p of [layout.target, layout.drawing]) {
      expect(pixel(canvas, p.x - 1, p.y + 1)).toEqual(edge)
      expect(pixel(canvas, p.x + p.w, p.y + p.h - 1)).toEqual(edge)
      expect(pixel(canvas, p.x + 1, p.y - 1)).toEqual(edge)
      expect(pixel(canvas, p.x + 1, p.y + p.h)).toEqual(edge)
    }
  })

  // Probe points as fractions of the chip, read off each silhouette in `_avatar.scss`.
  const SILHOUETTES: Array<[AvatarShape, [number, number], [number, number]]> = [
    ['rounded', [0.5, 0.03], [0.03, 0.03]],
    ['square', [0.03, 0.03], [0.5, 1.1]],
    ['circle', [0.5, 0.03], [0.1, 0.1]],
    ['hexagon', [0.5, 0.03], [0.1, 0.1]],
    ['octagon', [0.5, 0.03], [0.05, 0.05]],
    ['leaf', [0.9, 0.1], [0.08, 0.08]],
    ['pixel', [0.5, 0.07], [0.07, 0.07]],
    ['ticket', [0.5, 0.03], [0.1, 0.1]],
    ['pebble', [0.5, 0.05], [0.05, 0.05]],
    ['blob', [0.5, 0.05], [0.05, 0.05]],
    ['shield', [0.03, 0.03], [0.05, 0.95]],
    ['stamp', [0.03, 0.1], [0.02, 0.2]],
  ]
  it.each(SILHOUETTES)('cuts the %s chip to its silhouette', (shape, inside, outside) => {
    const { chip } = layout
    const canvas = renderShareCard({ ...card, player: { name: 'Big Al', seat: { ...seat, shape } } }, URL, theme, blank(4), null)
    const at = ([fx, fy]: [number, number]) => pixel(canvas, Math.floor(chip.x + fx * chip.w), Math.floor(chip.y + fy * chip.h))
    expect(at(inside)).toEqual(SEAT)
    expect(at(outside)).toEqual(BG)
  })

  it('cuts an emoji name only between whole emoji', () => {
    const fillText = vi.spyOn(CanvasRenderingContext2D.prototype, 'fillText')
    // Every code point measures 7px, so a cut by code point would land inside an emoji.
    vi.spyOn(CanvasRenderingContext2D.prototype, 'measureText').mockImplementation(text => ({ width: [...text].length * 7 }) as TextMetrics)
    const family = '👨‍👩‍👧'
    const big = { ...card, gridW: 384, gridH: 256, target: Array.from<number>({ length: 384 * 256 }).fill(0), drawing: Array.from<number>({ length: 384 * 256 }).fill(-1), player: { name: family.repeat(200), seat: null } }
    renderShareCard(big, URL, theme, blank(4), null)
    const name = fillText.mock.calls.map(c => c[0]).find(t => t.includes('👨'))!
    vi.restoreAllMocks()
    const drawn = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(name)].map(g => g.segment)
    expect(drawn.at(-1)).toBe('…')
    expect(drawn.every(g => g === family || g === '…')).toBe(true)
  })
})

// The whole export path: seat colours arrive as `var()` references and the face comes from the
// real generator.
describe('shareCardPng', () => {
  const root = document.documentElement.style
  const TOKENS = ['--test-seat', '--ink-on-colour', '--bg', '--paper', '--canvas-edge', '--accent-fill', '--logo-shadow']
  afterEach(() => {
    TOKENS.forEach(t => root.removeProperty(t))
  })

  async function decode(blob: Blob): Promise<HTMLCanvasElement> {
    const bitmap = await createImageBitmap(blob)
    const canvas = blank(0)
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
    return canvas
  }

  async function chipPixels(seed: string): Promise<Uint8ClampedArray> {
    const canvas = await decode(await shareCardPng({ ...card, player: { name: 'Big Al', seat: { ...seat, colour: 'var(--test-seat)', seed } } }))
    const { chip } = layout
    return canvas.getContext('2d')!.getImageData(chip.x, chip.y, chip.w, chip.h).data
  }

  it('resolves a var() seat colour before filling the chip', async () => {
    root.setProperty('--test-seat', '#00c46d')
    const data = await chipPixels('')
    expect([...data.slice(4, 8)]).toEqual(SEAT)
  })

  it('draws the generated face once it has loaded, in every engine', async () => {
    root.setProperty('--test-seat', '#00c46d')
    root.setProperty('--ink-on-colour', '#0e0e12')
    await loadFaces()
    const data = await chipPixels('seed')
    let ink = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === INK[0] && data[i + 1] === INK[1] && data[i + 2] === INK[2] && data[i + 3] === 255)
        ink++
    }
    // Lines, not a filled chip.
    expect(ink).toBeGreaterThan(0)
    expect(ink).toBeLessThan(layout.chip.w * layout.chip.h)
  })

  it('takes its colours from the theme tokens', async () => {
    root.setProperty('--bg', '#202030')
    root.setProperty('--paper', '#fafaf0')
    root.setProperty('--canvas-edge', '#ff8000')
    root.setProperty('--accent-fill', '#00ffff')
    root.setProperty('--ink-on-colour', '#0e0e12')
    root.setProperty('--logo-shadow', 'none')
    const canvas = await decode(await shareCardPng({ ...card, player: { name: 'Big Al', seat: { ...seat, seed: '' } } }))
    const { target, drawing, header, chip, scale } = layout
    expect(pixel(canvas, 2, 2)).toEqual([0x20, 0x20, 0x30, 255])
    expect(pixel(canvas, drawing.x + scale, drawing.y)).toEqual([0xFA, 0xFA, 0xF0, 255])
    expect(pixel(canvas, target.x - 1, target.y + 1)).toEqual([0xFF, 0x80, 0x00, 255])
    expect(count(canvas, [0x00, 0xFF, 0xFF, 255], header.x, header.y, header.w, header.h)).toBeGreaterThan(0)
    expect(count(canvas, INK, chip.x, chip.y, chip.w, chip.h)).toBeGreaterThan(0)
  })
})
