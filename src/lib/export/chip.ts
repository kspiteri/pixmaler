// The seat chip for a canvas: the same silhouettes as `_avatar.scss` (the small `PlayerTag` chip),
// filled with the seat colour, with the face (or the initial, if the face can't load) in chip ink.
// Rendered on its own square canvas so masks and bites never touch the card behind it.

import type { AvatarShape } from '../protocol/types'

type Corner = number | DOMPointInit
type Shape = (ctx: CanvasRenderingContext2D, s: number) => void

function polygon(points: Array<[number, number]>): Shape {
  return (ctx, s) => {
    ctx.beginPath()
    points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x * s, y * s) : ctx.lineTo(x * s, y * s))
    ctx.closePath()
    ctx.fill()
  }
}

// Corner radii as fractions of the side, in CSS order (top-left, top-right, bottom-right, bottom-left);
// `roundRect` scales oversize radii down exactly as `border-radius` does.
function rounded(radii: Array<number | [number, number]>): Shape {
  return (ctx, s) => {
    const corners: Corner[] = radii.map(r => typeof r === 'number' ? r * s : { x: r[0] * s, y: r[1] * s })
    ctx.beginPath()
    if (typeof ctx.roundRect === 'function')
      ctx.roundRect(0, 0, s, s, corners)
    else
      ctx.rect(0, 0, s, s)
    ctx.fill()
  }
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}

const SHAPES: Record<AvatarShape, Shape> = {
  rounded: rounded([0.25, 0.25, 0.25, 0.25]),
  square: (ctx, s) => ctx.fillRect(0, 0, s, s),
  circle: (ctx, s) => disc(ctx, s / 2, s / 2, s / 2),
  hexagon: polygon([[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]]),
  octagon: polygon([[0.3, 0], [0.7, 0], [1, 0.3], [1, 0.7], [0.7, 1], [0.3, 1], [0, 0.7], [0, 0.3]]),
  leaf: rounded([0.5, 0.15, 0.5, 0.15]),
  pixel: polygon([[1 / 7, 0], [6 / 7, 0], [6 / 7, 1 / 7], [1, 1 / 7], [1, 6 / 7], [6 / 7, 6 / 7], [6 / 7, 1], [1 / 7, 1], [1 / 7, 6 / 7], [0, 6 / 7], [0, 1 / 7], [1 / 7, 1 / 7]]),
  // A quarter-disc bitten from each corner: 30% of a 51% tile's diagonal.
  ticket: (ctx, s) => {
    ctx.fillRect(0, 0, s, s)
    ctx.globalCompositeOperation = 'destination-out'
    const r = 0.3 * 0.51 * Math.SQRT2 * s
    for (const [x, y] of [[0, 0], [s, 0], [0, s], [s, s]])
      disc(ctx, x, y, r)
    ctx.globalCompositeOperation = 'source-over'
  },
  pebble: rounded([[0.45, 0.55], [0.55, 0.45], [0.4, 0.6], [0.6, 0.4]]),
  blob: rounded([[0.6, 0.4], [0.4, 0.6], [0.55, 0.4], [0.45, 0.6]]),
  shield: polygon([[0, 0], [1, 0], [1, 0.62], [0.78, 0.88], [0.5, 1], [0.22, 0.88], [0, 0.62]]),
  // An 80% square inside a 5 × 5 ring of discs, which scallops the edge.
  stamp: (ctx, s) => {
    ctx.fillRect(0.1 * s, 0.1 * s, 0.8 * s, 0.8 * s)
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++)
        disc(ctx, (i + 0.5) * 0.2 * s, (j + 0.5) * 0.2 * s, 0.096 * s)
    }
  },
}

export interface ChipPaint {
  shape: AvatarShape
  initial: string
  // Resolved CSS colours, not `var()` references.
  fill: string
  ink: string
}

export function renderChip(chip: ChipPaint, size: number, face: CanvasImageSource | null, font: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = chip.fill
  SHAPES[chip.shape](ctx, size)
  // Everything after this lands only where the silhouette is.
  ctx.globalCompositeOperation = 'source-atop'
  if (face) {
    // The face's lines are opaque black on transparent: recolour them to ink, as the CSS mask does.
    const tint = document.createElement('canvas')
    tint.width = tint.height = size
    const t = tint.getContext('2d')!
    t.drawImage(face, 0, 0, size, size)
    t.globalCompositeOperation = 'source-in'
    t.fillStyle = chip.ink
    t.fillRect(0, 0, size, size)
    ctx.drawImage(tint, 0, 0)
  }
  else {
    ctx.fillStyle = chip.ink
    ctx.font = `700 ${Math.round(size / 2)}px ${font}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(chip.initial, size / 2, size / 2)
  }
  return canvas
}
