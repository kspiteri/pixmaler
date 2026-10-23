// The share card: logo, then the round's target beside or above the drawing, then the player's
// tag (seat chip and name, as `PlayerTag` shows it) and the site URL. Landscape grids stack;
// square and portrait ones sit side by side. Colours come from the viewer's theme at export time.

import type { Seat } from '../player/seats'
import { appHref, asset } from '../assets'
import { faceUri } from '../player/face'
import { renderChip } from './chip'
import { canvasToPng, paintGrid } from './png'

export interface CardPlayer {
  name: string
  // The seat chip beside the name; null for a player missing from the roster (name alone).
  // `colour` may be a `var()` reference; `shareCardPng` resolves it before drawing.
  seat: Seat | null
}

export interface ShareCard {
  gridW: number
  gridH: number
  palette: string[]
  target: number[]
  drawing: number[]
  // Null in Paint when no name was ever chosen; the footer then shows only the URL.
  player: CardPlayer | null
}

export interface CardRect { x: number, y: number, w: number, h: number }

export interface CardLayout {
  width: number
  height: number
  // Pixels per grid cell in each panel; always an integer so cells stay crisp.
  scale: number
  stacked: boolean
  header: CardRect
  target: CardRect
  drawing: CardRect
  footer: CardRect
  chip: CardRect
}

export interface CardTheme {
  bg: string
  fg: string
  muted: string
  paper: string
  accent: string
  // Chip ink: the face and initial on any seat colour.
  ink: string
  // The wordmark's drop on the light theme (`--logo-shadow`); null where the theme has none.
  accentDrop: string | null
}

// The card's long edge stays at or under this; the panel scale is the largest integer that fits.
const CARD_LONG_EDGE = 1600
const PAD = 64
const HEADER = 120
const FOOTER = 100
const GAP = 48

const MARK_PX = 56
const WORDMARK_PX = 56
const NAME_PX = 44
const URL_PX = 26
const CHIP_PX = 56
const CHIP_GAP = 16
const DISPLAY_FONT = 'Fredoka, sans-serif'
const BODY_FONT = '"Plus Jakarta Sans", sans-serif'

export function cardLayout(gridW: number, gridH: number): CardLayout {
  const stacked = gridW > gridH
  const fit = stacked
    ? Math.min((CARD_LONG_EDGE - 2 * PAD - HEADER - FOOTER - GAP) / (2 * gridH), (CARD_LONG_EDGE - 2 * PAD) / gridW)
    : Math.min((CARD_LONG_EDGE - 2 * PAD - GAP) / (2 * gridW), (CARD_LONG_EDGE - 2 * PAD - HEADER - FOOTER) / gridH)
  const scale = Math.max(1, Math.floor(fit))
  const panelW = gridW * scale
  const panelH = gridH * scale
  const artW = stacked ? panelW : 2 * panelW + GAP
  const artH = stacked ? 2 * panelH + GAP : panelH
  const artTop = PAD + HEADER
  const footerTop = artTop + artH
  return {
    width: 2 * PAD + artW,
    height: 2 * PAD + HEADER + artH + FOOTER,
    scale,
    stacked,
    header: { x: PAD, y: PAD, w: artW, h: HEADER },
    target: { x: PAD, y: artTop, w: panelW, h: panelH },
    drawing: stacked
      ? { x: PAD, y: artTop + panelH + GAP, w: panelW, h: panelH }
      : { x: PAD + panelW + GAP, y: artTop, w: panelW, h: panelH },
    footer: { x: PAD, y: footerTop, w: artW, h: FOOTER },
    // Centred on the name's capitals, which sit on a baseline 58px into the footer.
    chip: { x: PAD, y: footerTop + 14, w: CHIP_PX, h: CHIP_PX },
  }
}

export function cardTheme(): CardTheme {
  const css = getComputedStyle(document.documentElement)
  const token = (name: string) => css.getPropertyValue(name).trim()
  return {
    bg: token('--bg'),
    fg: token('--fg'),
    muted: token('--fg-60'),
    paper: token('--paper'),
    accent: token('--accent'),
    ink: token('--ink-on-colour'),
    accentDrop: token('--logo-shadow') === 'none' ? null : token('--accent-ink'),
  }
}

// "kspiteri.github.io/pixmaler": the address a friend can type, no scheme or trailing slash.
export function siteUrl(): string {
  return `${location.host}${appHref()}`.replace(/\/+$/, '')
}

// Splits into what a reader sees as single characters, so a cut never breaks a joined emoji
// (👨‍👩‍👧, 👍🏽, flags); code points where `Intl.Segmenter` is missing.
function graphemes(text: string): string[] {
  if (typeof Intl.Segmenter !== 'function')
    return [...text]
  return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(s => s.segment)
}

// Shortens to fit `max` px with an ellipsis, cutting only between whole visible characters.
function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max)
    return text
  const chars = graphemes(text)
  while (chars.length > 0 && ctx.measureText(`${chars.join('')}…`).width > max)
    chars.pop()
  return `${chars.join('')}…`
}

// `face` is the seat's generated face; null draws the initial instead, as the app does if the face can't load.
export function renderShareCard(card: ShareCard, url: string, theme: CardTheme, mark: CanvasImageSource, face: CanvasImageSource | null): HTMLCanvasElement {
  const layout = cardLayout(card.gridW, card.gridH)
  const canvas = document.createElement('canvas')
  canvas.width = layout.width
  canvas.height = layout.height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, layout.width, layout.height)

  const { header, footer, chip } = layout
  const midY = header.y + header.h / 2
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(mark, header.x, midY - MARK_PX / 2, MARK_PX, MARK_PX)
  ctx.font = `700 ${WORDMARK_PX}px ${DISPLAY_FONT}`
  ctx.textBaseline = 'middle'
  const wordX = header.x + MARK_PX + 20
  if (theme.accentDrop) {
    ctx.shadowColor = theme.accentDrop
    ctx.shadowOffsetX = 1
    ctx.shadowOffsetY = 2
    ctx.shadowBlur = 4
  }
  ctx.fillStyle = theme.accent
  ctx.fillText('PIX', wordX, midY)
  ctx.shadowColor = 'transparent'
  ctx.fillStyle = theme.fg
  ctx.fillText('MALER', wordX + ctx.measureText('PIX').width, midY)

  const dims = { palette: card.palette, gridW: card.gridW, gridH: card.gridH }
  paintGrid(ctx, { ...dims, grid: card.target }, theme.paper, layout.scale, layout.target.x, layout.target.y)
  paintGrid(ctx, { ...dims, grid: card.drawing }, theme.paper, layout.scale, layout.drawing.x, layout.drawing.y)

  ctx.textBaseline = 'alphabetic'
  const { player } = card
  if (player) {
    let nameX = footer.x
    if (player.seat) {
      const { shape, initial, colour } = player.seat
      // Upright: shared images carry no wonk.
      ctx.drawImage(renderChip({ shape, initial, fill: colour, ink: theme.ink }, chip.w, face, DISPLAY_FONT), chip.x, chip.y)
      nameX = chip.x + chip.w + CHIP_GAP
    }
    ctx.font = `700 ${NAME_PX}px ${DISPLAY_FONT}`
    ctx.fillStyle = theme.fg
    ctx.fillText(fitText(ctx, player.name, footer.x + footer.w - nameX), nameX, footer.y + 58)
  }
  ctx.font = `500 ${URL_PX}px ${BODY_FONT}`
  ctx.fillStyle = theme.muted
  ctx.fillText(fitText(ctx, url, footer.w), footer.x, footer.y + (player ? 96 : 60))
  return canvas
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.src = src
  await img.decode()
  return img
}

// The face SVG has only a viewBox; Firefox won't draw an SVG with no intrinsic size onto a canvas.
function withIntrinsicSize(uri: string): string {
  const comma = uri.indexOf(',')
  const svg = decodeURIComponent(uri.slice(comma + 1))
  if (/^<svg[^>]*\swidth=/.test(svg))
    return uri
  return uri.slice(0, comma + 1) + encodeURIComponent(svg.replace('<svg ', '<svg width="256" height="256" '))
}

// Only a face the generator has already made: the share click never waits on loading DiceBear
// (Paint warms it on open). Null, or a face that fails to decode, falls back to the initial.
async function loadFace(seed: string): Promise<HTMLImageElement | null> {
  const uri = faceUri(seed)
  if (!uri)
    return null
  try {
    return await loadImage(withIntrinsicSize(uri))
  }
  catch {
    return null
  }
}

function resolveColour(colour: string): string {
  const ref = /^var\((--[\w-]+)\)$/.exec(colour.trim())
  return ref ? getComputedStyle(document.documentElement).getPropertyValue(ref[1]).trim() : colour
}

export async function shareCardPng(card: ShareCard): Promise<Blob> {
  const url = siteUrl()
  const seat = card.player?.seat ?? null
  // Canvas text never waits for a webfont, so load them first; one that fails to load leaves
  // the card in a system face rather than failing it.
  const [mark, face] = await Promise.all([
    loadImage(asset('mark.svg')),
    seat ? loadFace(seat.seed) : null,
    document.fonts.load(`700 ${WORDMARK_PX}px Fredoka`, `PIXMALER${card.player?.name ?? ''}`).catch(() => []),
    document.fonts.load(`500 ${URL_PX}px "Plus Jakarta Sans"`, url).catch(() => []),
  ])
  const drawn = card.player && seat
    ? { ...card, player: { ...card.player, seat: { ...seat, colour: resolveColour(seat.colour) } } }
    : card
  return canvasToPng(renderShareCard(drawn, url, cardTheme(), mark, face))
}
