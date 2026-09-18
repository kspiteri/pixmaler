// The salon gallery-wall layout engine. Turns a set of drawings into hung "wall items" —
// real drawings, the GM's target as a non-votable "original", and fabricated muted filler
// frames woven between them for salon density. Every span, tilt, offset and filler grid is
// seeded off the drawing's id (or a fixed constant), so a server push — which re-sends the
// gallery on every vote — never re-rolls the hang.

import type { MaybeRefOrGetter } from 'vue'
import type { ServerMsg, Submission } from '../protocol/types'
import { computed, toValue } from 'vue'

type Gallery = Extract<ServerMsg, { type: 'gallery' }>

export interface WallItem {
  kind: 'piece' | 'filler' | 'original'
  key: string
  rowSpan: number
  colSpan: number
  rot: number
  dx: number
  dy: number
  grid: number[]
  gw: number
  gh: number
  submissionId?: string
  realIndex?: number
}

// Layout feel: the grid gap, tilt/offset ranges, and roughly how many fillers hang per drawing.
const TUNE = { gapPx: 18, maxRotDeg: 2.5, maxNudgePx: 4, fillersPerPainting: 4 }

// Grid gap between frames, exported so the wall element can set `--wall-gap` from one source.
export const SALON_GAP_PX = TUNE.gapPx

// Filler frame shapes (row/col spans) — a mix of squares and rectangles so the wall reads varied.
const FILLER_SHAPES: [number, number][] = [
  [1, 1],
  [2, 2],
  [3, 3],
  [2, 3],
  [3, 4],
  [2, 4],
  [3, 2],
  [4, 3],
  [4, 2],
  [1, 2],
  [2, 1],
]

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hashId(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function wobble(rng: () => number) {
  return {
    rot: +((rng() - 0.5) * 2 * TUNE.maxRotDeg).toFixed(2),
    dx: Math.round((rng() - 0.5) * 2 * TUNE.maxNudgePx),
    dy: Math.round((rng() - 0.5) * 2 * TUNE.maxNudgePx),
  }
}
// Equal-area span per ratio (~24 cells), landing on the exact aspect: 4×6 / 5×5 / 6×4.
function spanFor(ratio: number): { rowSpan: number, colSpan: number } {
  return {
    rowSpan: Math.max(2, Math.round(Math.sqrt(24 / ratio))),
    colSpan: Math.max(2, Math.round(Math.sqrt(24 * ratio))),
  }
}
// Filler grid dims matching the frame's random shape, so the faded art isn't stretched.
function fillerDims(rowSpan: number, colSpan: number): { gw: number, gh: number } {
  const base = 28
  return colSpan >= rowSpan
    ? { gw: base, gh: Math.max(6, Math.round((base * rowSpan) / colSpan)) }
    : { gw: Math.max(6, Math.round((base * colSpan) / rowSpan)), gh: base }
}
// A fabricated decorative grid from the room's own palette (faded via CSS so it recedes).
function makeFillerGrid(seed: number, w: number, h: number, palette: string[]): number[] {
  const rng = mulberry32(seed)
  const pick = () => Math.floor(rng() * palette.length)
  const a = pick()
  const b = pick()
  const cc = pick()
  const pattern = Math.floor(rng() * 4)
  const k = 2 + Math.floor(rng() * 4)
  const grid: number[] = Array.from({ length: w * h })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let idx: number
      switch (pattern) {
        case 0: idx = [a, b, cc][(x + y) % 3]; break
        case 1: idx = (Math.floor(x / k) + Math.floor(y / k)) % 2 ? a : b; break
        case 2: idx = [a, b, cc][Math.floor(x / k) % 3]; break
        default: {
          const dx = x - w / 2
          const dy = y - h / 2
          idx = [a, b, cc][Math.floor(Math.hypot(dx, dy) / k) % 3]
        }
      }
      grid[y * w + x] = idx
    }
  }
  return grid
}

// The per-item inline style: grid span plus the CSS custom props the tilt/offset rule reads.
export function salonItemStyle(item: WallItem) {
  return {
    'gridRow': `span ${item.rowSpan}`,
    'gridColumn': `span ${item.colSpan}`,
    '--rot': `${item.rot}deg`,
    '--dx': `${item.dx}px`,
    '--dy': `${item.dy}px`,
  }
}

// Build the hung wall from the (already shuffled) submissions. `targetGrid`, when present, is
// dropped in around the middle as the non-votable "original".
export function useSalonWall(
  gallery: MaybeRefOrGetter<Gallery | null>,
  ordered: MaybeRefOrGetter<Submission[]>,
  targetGrid: MaybeRefOrGetter<number[] | null>,
) {
  const wallItems = computed<WallItem[]>(() => {
    const g = toValue(gallery)
    if (!g)
      return []
    const subs = toValue(ordered)
    const target = toValue(targetGrid)
    const pspan = spanFor(g.gridW / g.gridH)
    const items: WallItem[] = []
    let fillers = 0
    subs.forEach((sub, realIndex) => {
      const rng = mulberry32(hashId(sub.submissionId))
      if (realIndex === Math.floor(subs.length / 2) && target) {
        items.push({ kind: 'original', key: '__original', ...pspan, ...wobble(mulberry32(99991)), grid: target, gw: g.gridW, gh: g.gridH })
      }
      items.push({ kind: 'piece', key: sub.submissionId, ...pspan, ...wobble(rng), grid: sub.grid, gw: g.gridW, gh: g.gridH, submissionId: sub.submissionId, realIndex })
      const nFillers = TUNE.fillersPerPainting + Math.floor(rng() * 3) - 1
      for (let i = 0; i < nFillers; i++) {
        const [rowSpan, colSpan] = FILLER_SHAPES[Math.floor(rng() * FILLER_SHAPES.length)]
        const { gw, gh } = fillerDims(rowSpan, colSpan)
        fillers++
        items.push({ kind: 'filler', key: `f${fillers}`, rowSpan, colSpan, ...wobble(rng), grid: makeFillerGrid(fillers * 131 + 7, gw, gh, g.palette), gw, gh })
      }
    })
    return items
  })

  return { wallItems }
}
