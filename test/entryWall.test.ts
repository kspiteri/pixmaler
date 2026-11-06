// The Entry wall's physics: a hung piece swinging about its nail, the drag's swing limit, the
// re-roll on a knock, and the contact that lets two frames knock each other.
//
// The scene keeps its pieces in module state and runs on one rAF loop, so each test re-imports
// the module for an empty wall, stubs `requestAnimationFrame` dead, and steps `advance(dt)`.

import type { Mock } from 'vitest'
import type { Contact, Piece, PieceGeometry } from '../src/views/entry/wall'
import type * as WallModule from '../src/views/entry/wall'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TARGET_RATIO_IDS, TARGET_RATIOS } from '../src/lib/canvas/aspect'

const DEG = 180 / Math.PI
const FRAME = 1 / 60
// The agreed limits, written out rather than imported: a retune of `wall.ts` must fail here.
const HARD = 20 // deg, the hook the swing can never pass
const SOFT = 12 // deg, where the resistance starts

let wall: typeof WallModule

beforeEach(async () => {
  vi.resetModules()
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  wall = await import('../src/views/entry/wall')
})

interface Spec extends Partial<PieceGeometry> {
  tilt?: number // multiples of `$wonk-art`
  range?: number
}

function hang(spec: Spec = {}): { piece: Piece, write: Mock } {
  const geometry: PieceGeometry = { pivotX: 0, pivotY: 0, halfWidth: 100, height: 200, ...spec }
  const write = vi.fn()
  const piece = wall.addPiece({
    tilt: spec.tilt ?? 0,
    range: spec.range ?? 2,
    measure: () => geometry,
    write: (deg: number) => write(deg),
  })
  wall.measureAll()
  return { piece, write }
}

function advance(frames: number, onFrame?: (i: number) => void): void {
  for (let i = 0; i < frames; i++) {
    wall.advance(FRAME)
    onFrame?.(i)
  }
}

// A point on the arc the grabbed spot travels: `turn` degrees around the nail, so equal turns
// are equal amounts of pointer travel.
function onArc(piece: Piece, turn: number, radius = 200): [number, number] {
  const t = turn / DEG
  return [piece.geometry.pivotX + radius * Math.sin(t), piece.geometry.pivotY + radius * Math.cos(t)]
}

function depthBetween(left: Piece, right: Piece): number {
  return wall.deepestContact(left, right)?.depth ?? 0
}

// mulberry32: the knock tests need many rolls, and chance is not an assertion.
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
}

describe('a hung piece', () => {
  it('hangs at the tilt it was given', () => {
    const { piece } = hang({ tilt: 1 })
    expect(piece.rest).toBeCloseTo(1.5, 10)
    expect(wall.angleOf(piece) * DEG).toBeCloseTo(1.5, 10)
  })

  it('is still at that tilt after the scene runs with nothing touching it', () => {
    const { piece, write } = hang({ tilt: -2 })
    advance(180)
    expect(piece.offset).toBe(0)
    expect(piece.velocity).toBe(0)
    expect(wall.angleOf(piece) * DEG).toBeCloseTo(-3, 10)
    expect(write).toHaveBeenLastCalledWith(-3)
  })
})

describe('the pendulum', () => {
  it('settles back to its rest tilt, overshooting at least once on the way', () => {
    const { piece } = hang({ tilt: 1 })
    piece.offset = 10 / DEG
    const trace: number[] = []
    advance(600, () => trace.push(piece.offset))

    // Underdamped: it crosses its rest angle and comes back the other side.
    expect(Math.min(...trace)).toBeLessThan(-0.5 / DEG)
    expect(Math.max(...trace)).toBeLessThanOrEqual(10 / DEG)
    expect(Math.abs(piece.offset) * DEG).toBeLessThan(0.05)
    expect(wall.angleOf(piece) * DEG).toBeCloseTo(1.5, 1)
  })

  it('shrinks every swing rather than running on', () => {
    const { piece } = hang()
    piece.offset = 10 / DEG
    const peaks: number[] = []
    let last = piece.offset
    let rising = false
    advance(600, () => {
      const climbing = Math.abs(piece.offset) > Math.abs(last)
      if (rising && !climbing)
        peaks.push(Math.abs(last))
      rising = climbing
      last = piece.offset
    })

    expect(peaks.length).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < peaks.length; i++)
      expect(peaks[i]).toBeLessThan(peaks[i - 1])
  })
})

describe('a drag', () => {
  it('carries the frame to the pointer, either side of the nail', () => {
    const { piece } = hang()
    const { pivotX, pivotY } = piece.geometry
    // The grabbed spot, 200px below the nail, and where it has swung to.
    const held = (): number => pivotX - 200 * Math.sin(wall.angleOf(piece))

    wall.grab(piece, pivotX, pivotY + 200)
    wall.drag(piece, pivotX - 60, pivotY + 190)
    advance(120)
    expect(piece.offset).toBeGreaterThan(0)
    expect(Math.abs(held() - (pivotX - 60))).toBeLessThan(8)

    wall.drag(piece, pivotX + 60, pivotY + 190)
    advance(120)
    expect(piece.offset).toBeLessThan(0)
    expect(Math.abs(held() - (pivotX + 60))).toBeLessThan(8)
  })

  it('picks the frame up where it is, without a jump', () => {
    const { piece } = hang({ tilt: 2 })
    piece.offset = 6 / DEG
    const before = wall.angleOf(piece)

    // Grabbed well off to one side, then held still: the frame must not swing to the pointer.
    wall.grab(piece, ...onArc(piece, -30))
    expect(piece.target).toBe(piece.offset)
    wall.drag(piece, ...onArc(piece, -30))
    advance(60)
    expect(wall.angleOf(piece)).toBeCloseTo(before, 6)
  })

  it('takes the same path whether a frame arrives whole or in pieces', async () => {
    // The drag spring is stiff enough that a dropped frame has to be walked in sub-steps.
    const held = async (dt: number, frames: number): Promise<number> => {
      vi.resetModules()
      wall = await import('../src/views/entry/wall')
      const { piece } = hang()
      wall.grab(piece, ...onArc(piece, 0))
      wall.drag(piece, ...onArc(piece, -16))
      for (let i = 0; i < frames; i++)
        wall.advance(dt)
      return piece.offset
    }

    expect(await held(0.05, 1)).toBeCloseTo(await held(1 / 120, 6), 9)
  })

  it('ignores the pointer once the frame is let go', () => {
    const { piece } = hang()
    wall.grab(piece, ...onArc(piece, 0))
    wall.drag(piece, ...onArc(piece, -10))
    wall.release(piece)
    let live = true
    for (let i = 0; i < 900 && live; i++)
      live = wall.advance(FRAME)

    const resting = wall.angleOf(piece)
    const target = piece.target
    wall.drag(piece, ...onArc(piece, -40))

    expect(piece.target).toBe(target)
    expect(wall.angleOf(piece)).toBe(resting)
    // And the wall stays asleep rather than being woken by a stray move.
    expect(wall.advance(FRAME)).toBe(false)
  })
})

describe('the swing limit', () => {
  it('squashes travel past the soft band and never reaches the hook', () => {
    const steps = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40]
    const angles = steps.map(turn => wall.resist(turn / DEG) * DEG)
    const gains = angles.slice(1).map((a, i) => a - angles[i])

    // Below the soft band the drag is one-for-one.
    expect(angles[3]).toBeCloseTo(12, 10)
    for (let i = 3; i < gains.length; i++)
      expect(gains[i]).toBeLessThan(gains[i - 1])
    expect(angles[angles.length - 1]).toBeLessThan(HARD)
    // However far the pointer asks, the easing stops a clear degree short of the hook, so the
    // drag spring's overshoot has somewhere to go instead of dead-stopping on the clamp.
    for (const ask of [90, 180, 400]) {
      expect(wall.resist(ask / DEG) * DEG).toBeLessThan(HARD - 1)
      expect(wall.resist(-ask / DEG) * DEG).toBeGreaterThan(1 - HARD)
    }
  })

  it('buys less and less angle for equal arcs of pointer travel', () => {
    const { piece } = hang()
    wall.grab(piece, ...onArc(piece, 0))
    const asked: number[] = []
    for (let turn = -4; turn >= -40; turn -= 4) {
      wall.drag(piece, ...onArc(piece, turn))
      asked.push(piece.target * DEG)
    }

    const gains = asked.slice(1).map((a, i) => a - asked[i])
    const past = asked.findIndex(a => a > SOFT)
    expect(past).toBeGreaterThan(0)
    for (let i = past; i < gains.length; i++)
      expect(gains[i]).toBeLessThan(gains[i - 1])
  })

  it('never swings a piece past the hook, however far the pointer is dragged', () => {
    const { piece } = hang({ tilt: 2 })
    wall.grab(piece, ...onArc(piece, 0))
    let worst = 0
    for (let turn = 0; turn >= -170; turn -= 2) {
      wall.drag(piece, ...onArc(piece, turn))
      advance(4, () => { worst = Math.max(worst, Math.abs(piece.offset)) })
    }
    expect(worst * DEG).toBeLessThanOrEqual(HARD + 1e-9)
    // And it does reach for the hook — a drag that moved nothing would pass the line above.
    expect(worst * DEG).toBeGreaterThan(SOFT)

    // And the same the other way, straight to the far side.
    wall.drag(piece, ...onArc(piece, 170))
    advance(240, () => { worst = Math.max(worst, Math.abs(piece.offset)) })
    expect(worst * DEG).toBeLessThanOrEqual(HARD + 1e-9)
  })
})

describe('a knock', () => {
  it('re-rolls inside the range, never straight and never where it was', () => {
    const random = seeded(20_260_413)
    vi.spyOn(Math, 'random').mockImplementation(random)
    const { piece } = hang({ tilt: 1, range: 2 })

    for (let i = 0; i < 400; i++) {
      const was = piece.rest
      const held = wall.angleOf(piece)
      wall.knock(piece)
      expect(Math.abs(piece.rest)).toBeGreaterThanOrEqual(0.6)
      expect(Math.abs(piece.rest)).toBeLessThanOrEqual(piece.range)
      expect(Math.abs(piece.rest - was)).toBeGreaterThanOrEqual(0.3)
      // The offset absorbs the new rest, so the piece swings into it rather than jumping.
      expect(wall.angleOf(piece)).toBeCloseTo(held, 12)
    }
  })

  it('re-rolls inside a range given the other way round', () => {
    vi.spyOn(Math, 'random').mockImplementation(seeded(3))
    const { piece } = hang({ tilt: 1, range: -2 })
    expect(piece.range).toBe(3)

    for (let i = 0; i < 100; i++) {
      wall.knock(piece)
      expect(Math.abs(piece.rest)).toBeGreaterThanOrEqual(0.6)
      expect(Math.abs(piece.rest)).toBeLessThanOrEqual(3)
    }
  })

  it('keeps inside a range tighter than the straightness floor', () => {
    vi.spyOn(Math, 'random').mockImplementation(seeded(5))
    const { piece } = hang({ tilt: 1, range: 0.2 })
    expect(piece.range).toBeCloseTo(0.3, 10)

    for (let i = 0; i < 100; i++) {
      wall.knock(piece)
      expect(Math.abs(piece.rest)).toBeGreaterThan(0)
      expect(Math.abs(piece.rest)).toBeLessThanOrEqual(piece.range)
    }
  })

  it('swings into the new rest and settles there', () => {
    vi.spyOn(Math, 'random').mockImplementation(seeded(7))
    const { piece, write } = hang({ tilt: 1, range: 2 })
    wall.knock(piece)
    const rest = piece.rest
    expect(rest).not.toBe(1.5)
    expect(write).not.toHaveBeenCalled()

    advance(600)
    expect(piece.offset).toBe(0)
    expect(write).toHaveBeenLastCalledWith(rest)
  })

  it('re-rolls on a tap and leaves a real drag where it was', () => {
    vi.spyOn(Math, 'random').mockImplementation(seeded(11))
    const tapped = hang({ tilt: 1, range: 2 }).piece
    wall.grab(tapped, ...onArc(tapped, 0))
    wall.drag(tapped, tapped.geometry.pivotX + 2, tapped.geometry.pivotY + 200)
    wall.release(tapped)
    expect(tapped.rest).not.toBe(1.5)

    // Hung clear of the tapped one: two pieces on the same nail would push each other about.
    const dragged = hang({ tilt: 1, range: 2, pivotX: 600 }).piece
    wall.grab(dragged, ...onArc(dragged, 0))
    wall.drag(dragged, ...onArc(dragged, -10))
    wall.release(dragged)
    expect(dragged.rest).toBe(1.5)
    advance(600)
    expect(dragged.offset).toBe(0)
  })
})

// A room's target and its drawings always share one grid, so both frames on a wall carry the
// same ratio and differ only in size — as the wall's own two do. Built from the picker's
// ratios, so a fourth one lands here the day it is added. `gap` is the clearance between the
// facing edges when both hang straight.
function frame(width: number, ratio: { w: number, h: number }, extra: Spec = {}): Spec {
  return { halfWidth: width / 2, height: Math.round((width * ratio.h) / ratio.w), ...extra }
}

const PORTRAIT = TARGET_RATIOS.portrait

const SHAPES: { name: string, left: Spec, right: Spec, gap?: number }[] = [
  ...TARGET_RATIO_IDS.map((id) => {
    const ratio = TARGET_RATIOS[id]
    return {
      name: `two ${ratio.label} frames, the second smaller and hung lower`,
      left: frame(216, ratio),
      right: frame(180, ratio, { pivotY: 16 }),
    }
  }),
  { name: 'nails at very different heights', left: frame(216, PORTRAIT), right: frame(216, PORTRAIT, { pivotY: 120 }) },
  { name: 'a larger neighbour hung higher', left: frame(180, PORTRAIT, { pivotY: 100 }), right: frame(240, PORTRAIT) },
]

function pair(shape: { left: Spec, right: Spec, gap?: number }): { left: Piece, right: Piece } {
  const left = hang({ ...shape.left, pivotX: 0 }).piece
  const span = (shape.left.halfWidth ?? 100) + (shape.right.halfWidth ?? 100) + (shape.gap ?? 12)
  const right = hang({ ...shape.right, pivotX: span }).piece
  return { left, right }
}

function contactBetween(left: Piece, right: Piece): Contact {
  const hit = wall.deepestContact(left, right)
  if (!hit)
    throw new Error('the pieces are not touching')
  return hit
}

// Where a point on a piece's edge sits on the wall.
function screenY(piece: Piece, localX: number, localY: number): number {
  const t = wall.angleOf(piece)
  return piece.geometry.pivotY + localX * Math.sin(t) + localY * Math.cos(t)
}

// The deepest overlap, worked out rather than sampled: both facing edges are straight, so the
// gap between them is linear in height and deepest at one end of the span they share.
function deepestOverlap(left: Piece, right: Piece): number {
  const edge = (piece: Piece, localX: number) => {
    const t = wall.angleOf(piece)
    const at = (y: number): number => {
      const localY = (y - piece.geometry.pivotY - localX * Math.sin(t)) / Math.cos(t)
      return piece.geometry.pivotX + localX * Math.cos(t) - localY * Math.sin(t)
    }
    const ends = [screenY(piece, localX, 0), screenY(piece, localX, piece.geometry.height)]
    return { at, top: Math.min(...ends), bottom: Math.max(...ends) }
  }
  const l = edge(left, left.geometry.halfWidth)
  const r = edge(right, -right.geometry.halfWidth)
  const top = Math.max(l.top, r.top)
  const bottom = Math.min(l.bottom, r.bottom)
  if (bottom < top)
    return 0
  return Math.max(0, l.at(top) - r.at(top), l.at(bottom) - r.at(bottom))
}

describe('two pieces meeting', () => {
  it.each(SHAPES)('pushes $name apart and keeps them apart', (shape) => {
    const { left, right } = pair(shape)
    // Leant into each other hard enough to overlap, then let go.
    left.offset = -8 / DEG
    right.offset = 8 / DEG
    const overlap = depthBetween(left, right)
    expect(overlap).toBeGreaterThan(1)

    let worst = 0
    advance(900, () => { worst = Math.max(worst, depthBetween(left, right)) })

    expect(worst).toBeLessThanOrEqual(overlap + 1e-6)
    expect(wall.deepestContact(left, right)).toBeNull()
    expect(Math.abs(left.offset) * DEG).toBeLessThanOrEqual(HARD + 1e-9)
    expect(Math.abs(right.offset) * DEG).toBeLessThanOrEqual(HARD + 1e-9)
  })

  it.each(SHAPES)('meets $name at one point on both frames', (shape) => {
    const { left, right } = pair(shape)
    left.offset = -8 / DEG
    right.offset = 8 / DEG
    const hit = contactBetween(left, right)

    expect(hit.leftY).toBeGreaterThanOrEqual(0)
    expect(hit.leftY).toBeLessThanOrEqual(left.geometry.height)
    expect(hit.rightY).toBeGreaterThanOrEqual(0)
    expect(hit.rightY).toBeLessThanOrEqual(right.geometry.height)
    // One point on the wall, read off two frames hung at their own heights.
    expect(screenY(left, left.geometry.halfWidth, hit.leftY))
      .toBeCloseTo(screenY(right, -right.geometry.halfWidth, hit.rightY), 6)
  })

  it.each(SHAPES)('measures how far $name have overlapped', (shape) => {
    const { left, right } = pair(shape)
    left.offset = -8 / DEG
    right.offset = 8 / DEG
    const truth = deepestOverlap(left, right)
    const found = contactBetween(left, right).depth

    expect(truth).toBeGreaterThan(1)
    // Closed form, not sampled: it lands on the deepest point rather than near it.
    expect(found).toBeCloseTo(truth, 9)
  })

  it('never touches a piece hung clear above it', () => {
    // Their columns cross, but one frame ends long before the other begins.
    const left = hang({ ...frame(200, PORTRAIT), pivotX: 0, pivotY: 0 }).piece
    const right = hang({ ...frame(200, PORTRAIT), pivotX: 150, pivotY: 400 }).piece
    expect(wall.deepestContact(left, right)).toBeNull()

    advance(300)
    expect(left.offset).toBe(0)
    expect(right.offset).toBe(0)
  })

  it('carries a swing into the neighbour and takes it out of the striker', () => {
    const { left, right } = pair(SHAPES[0])
    // Negative is the bottom of the frame swinging towards its neighbour.
    left.velocity = -3
    const struck = right.velocity

    let frames = 0
    while (depthBetween(left, right) === 0 && frames < 300) {
      wall.advance(FRAME)
      frames++
    }
    expect(frames).toBeLessThan(300)
    const incoming = left.velocity
    wall.advance(FRAME)

    expect(struck).toBe(0)
    expect(right.velocity).toBeLessThan(-0.1)
    expect(left.velocity).toBeGreaterThan(incoming)
  })

  it('never leaves a contact with more than it went in', () => {
    const { left, right } = pair(SHAPES[0])
    left.velocity = -6
    // Kinetic plus the pendulum's own potential, in the units the integrator works in.
    const energy = (): number => [left, right]
      .reduce((total, p) => total + 0.5 * p.velocity ** 2 + 18 * (1 - Math.cos(p.offset)), 0)
    const started = energy()

    let fastest = 0
    advance(600, () => {
      fastest = Math.max(fastest, Math.abs(left.velocity), Math.abs(right.velocity))
      expect(energy()).toBeLessThanOrEqual(started)
    })
    expect(fastest).toBeLessThanOrEqual(6)
  })

  it('bounces back softer than it struck', () => {
    const { left, right } = pair(SHAPES[1])
    left.velocity = -4
    advance(600)
    expect(Math.abs(left.velocity)).toBeLessThan(4)
    expect(wall.deepestContact(left, right)).toBeNull()
  })
})

describe('two pieces resting against each other', () => {
  it('reaches a steady lean instead of jittering', () => {
    // Rest tilts alone put these two in contact: both lean towards the gap between them.
    const left = hang({ tilt: -2, halfWidth: 100, height: 200, pivotX: 0 }).piece
    const right = hang({ tilt: 2, halfWidth: 100, height: 200, pivotX: 212 }).piece
    expect(depthBetween(left, right)).toBeGreaterThan(1)

    let live = true
    for (let i = 0; i < 1800 && live; i++)
      live = wall.advance(FRAME)

    const settled = [wall.angleOf(left), wall.angleOf(right)]
    advance(120)
    expect(wall.angleOf(left) * DEG).toBeCloseTo(settled[0] * DEG, 3)
    expect(wall.angleOf(right) * DEG).toBeCloseTo(settled[1] * DEG, 3)
    // The loop stops: a resting contact never reaches zero speed, so it stops on stillness.
    expect(live).toBe(false)
  })
})
