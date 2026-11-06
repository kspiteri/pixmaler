// The Entry wall as one physical scene. Each hung piece is a rigid pendulum about the nail at
// its top-centre, and the pieces knock each other: a contact needs both bodies inside the same
// step, so one rAF loop drives every piece rather than one loop each.

const DEG = 180 / Math.PI

// `$wonk-art` from `mixins/_wonk.scss`, in degrees. Resting tilts and knock bounds arrive as
// multiples of it; a knock itself lands anywhere inside the bound.
export const WONK_ART = 1.5
const MIN_TILT = 0.6 // deg: a knock never leaves a piece hanging dead straight
const MIN_CHANGE = 0.3 // deg: nor leaves it where it already was

// One pendulum for every piece: ω² and damping give a ~1.5s swing that dies in a few passes.
const OMEGA_SQ = 18
const DAMPING = 1.8
// The drag spring. A piece trails the pointer and overshoots when it stops — that lag is the
// whole sensation of weight.
const DRAG_K = 90
const DRAG_DAMPING = 9
// Resistance ramps from SOFT; HARD is the hook the piece can never swing past. The drag
// spring overshoots its target by about a fifth, so the easing aims short of the hook by that
// much — aim it at the hook and every firm drag ends pinned against it instead of easing.
const SOFT = 12 / DEG
const HARD = 20 / DEG
const OVERSHOOT = 0.85
const MAX_STEP = 1 / 120 // s; a long frame is integrated in sub-steps of this
const TAP_PX = 5
// Below this the nail is too close to the pointer to read a direction from, in px.
const MIN_LEVER = 16

// Contact: how much of a knock comes back, and the share of any overlap pushed out per step.
const BOUNCE = 0.4
const CONTACT_BIAS = 0.3

// Pieces leaning on each other never fully stop, so the loop ends on stillness over several
// frames rather than on rest.
const QUIET_FRAMES = 18
const QUIET_SPEED = 0.02
const QUIET_TRAVEL = 2e-4
const SNAP = 0.01 // rad

export interface PieceGeometry {
  pivotX: number
  pivotY: number
  halfWidth: number
  height: number
}

export interface Piece {
  rest: number // deg, the tilt it hangs at
  offset: number // rad from `rest`
  velocity: number // rad/s
  target: number // rad the drag pulls towards
  dragging: boolean
  touching: boolean // resting against a neighbour, so not free to snap back
  grabOffset: number // rad between the grabbed bearing and the offset at that moment
  dragDistance: number // px of pointer path since the grab
  lastX: number
  lastY: number
  prior: number // rad, the offset at the start of the frame
  geometry: PieceGeometry
  readonly range: number // deg, the bound a knock may re-roll within
  readonly measure: () => PieceGeometry
  readonly write: (deg: number) => void
}

const pieces: Piece[] = []
let raf = 0
let frameTime = 0
let quiet = 0

export function addPiece(spec: {
  tilt: number // multiples of `$wonk-art`
  range: number // multiples of `$wonk-art`
  measure: () => PieceGeometry
  write: (deg: number) => void
}): Piece {
  const piece: Piece = {
    rest: spec.tilt * WONK_ART,
    offset: 0,
    velocity: 0,
    target: 0,
    dragging: false,
    touching: false,
    grabOffset: 0,
    dragDistance: 0,
    lastX: 0,
    lastY: 0,
    prior: 0,
    geometry: { pivotX: 0, pivotY: 0, halfWidth: 0, height: 0 },
    range: Math.abs(spec.range) * WONK_ART,
    measure: spec.measure,
    write: spec.write,
  }
  pieces.push(piece)
  return piece
}

export function removePiece(piece: Piece): void {
  const i = pieces.indexOf(piece)
  if (i >= 0)
    pieces.splice(i, 1)
  if (!pieces.length && raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
}

export function angleOf(piece: Piece): number {
  return piece.rest / DEG + piece.offset
}

// Past SOFT the extra travel is squashed into the room left before the hook, leaving the drag
// spring's overshoot somewhere to go.
export function resist(angle: number): number {
  const over = Math.abs(angle) - SOFT
  if (over <= 0)
    return angle
  const span = (HARD - SOFT) * OVERSHOOT
  return Math.sign(angle) * (SOFT + span * Math.tanh(over / span))
}

function clampToHook(piece: Piece): void {
  if (Math.abs(piece.offset) > HARD) {
    piece.offset = Math.sign(piece.offset) * HARD
    if (Math.sign(piece.velocity) === Math.sign(piece.offset))
      piece.velocity = 0
  }
}

// How far a point on a piece's edge travels along the wall per radian of swing, which turns a
// push along the wall into one about the nail.
function travelPerRadian(piece: Piece, localX: number, localY: number): number {
  const angle = angleOf(piece)
  return -localX * Math.sin(angle) - localY * Math.cos(angle)
}

export interface Contact {
  depth: number
  leftY: number
  rightY: number
}

// The deepest overlap between one piece's right edge and the next one's left edge, or `null`
// when they are clear. Both edges are straight lines, so their separation changes at a steady
// rate down the wall and the deepest point is always an end of the stretch they share: where
// the lower nail's edge begins, or where the shorter piece's edge stops.
//
// A frame more than about 2.75× wider than tall reaches further sideways on its bottom corner
// than along its edge, and a leaning pair of them jams against each other instead of swinging
// back. The picker tops out at 3:2, so nothing the game can draw gets near it.
export function deepestContact(left: Piece, right: Piece): Contact | null {
  const leftAngle = angleOf(left)
  const rightAngle = angleOf(right)
  const leftSin = Math.sin(leftAngle)
  const leftCos = Math.cos(leftAngle)
  const rightSin = Math.sin(rightAngle)
  const rightCos = Math.cos(rightAngle)

  const leftX = left.geometry.halfWidth
  const rightX = -right.geometry.halfWidth
  // Where each facing edge starts and ends on screen; tilting slides it up or down the wall.
  const leftTop = left.geometry.pivotY + leftX * leftSin
  const rightTop = right.geometry.pivotY + rightX * rightSin
  const from = Math.max(leftTop, rightTop)
  const to = Math.min(leftTop + left.geometry.height * leftCos, rightTop + right.geometry.height * rightCos)
  if (from > to)
    return null

  let deepest: Contact | null = null
  for (const screenY of [from, to]) {
    const leftY = (screenY - leftTop) / leftCos
    const rightY = (screenY - rightTop) / rightCos
    const depth = (left.geometry.pivotX + leftX * leftCos - leftY * leftSin)
      - (right.geometry.pivotX + rightX * rightCos - rightY * rightSin)
    if (depth > 0 && (!deepest || depth > deepest.depth))
      deepest = { depth, leftY, rightY }
  }
  return deepest
}

// One pass over each pair, at the deepest overlap: the bounce first, so a knock carries into
// the neighbour, then a share of the overlap pushed back out. Pieces in contact are marked,
// because a piece being leaned on is not free to snap back onto its tilt.
function resolveContacts(): void {
  for (const piece of pieces)
    piece.touching = false

  for (let i = 0; i < pieces.length - 1; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i]
      const b = pieces[j]
      const leftFirst = a.geometry.pivotX <= b.geometry.pivotX
      const left = leftFirst ? a : b
      const right = leftFirst ? b : a
      const hit = deepestContact(left, right)
      if (!hit)
        continue

      const leftTravel = travelPerRadian(left, left.geometry.halfWidth, hit.leftY)
      const rightTravel = travelPerRadian(right, -right.geometry.halfWidth, hit.rightY)
      const denominator = leftTravel * leftTravel + rightTravel * rightTravel
      if (denominator < 1e-9)
        continue

      left.touching = true
      right.touching = true

      // How fast the gap is opening; only a pair still closing on each other bounces.
      const separating = rightTravel * right.velocity - leftTravel * left.velocity
      if (separating < 0) {
        const impulse = -(1 + BOUNCE) * separating / denominator
        left.velocity -= impulse * leftTravel
        right.velocity += impulse * rightTravel
      }

      const push = CONTACT_BIAS * hit.depth / denominator
      left.offset -= push * leftTravel
      right.offset += push * rightTravel
      clampToHook(left)
      clampToHook(right)
    }
  }
}

function integrate(dt: number): void {
  for (const piece of pieces) {
    if (piece.dragging)
      piece.velocity += (DRAG_K * (piece.target - piece.offset) - DRAG_DAMPING * piece.velocity) * dt
    else
      piece.velocity += (-OMEGA_SQ * Math.sin(piece.offset) - DAMPING * piece.velocity) * dt
    piece.offset += piece.velocity * dt
    clampToHook(piece)
  }
  resolveContacts()
}

// One frame of the scene: sub-stepped integration with contacts, the writes, then the
// stillness accounting. `false` once everything has been still long enough to stop.
export function advance(dt: number): boolean {
  let remaining = dt
  for (const piece of pieces)
    piece.prior = piece.offset
  while (remaining > 0) {
    const sub = Math.min(MAX_STEP, remaining)
    integrate(sub)
    remaining -= sub
  }

  let travel = 0
  let speed = 0
  let held = false
  for (const piece of pieces) {
    piece.write(piece.rest + piece.offset * DEG)
    travel = Math.max(travel, Math.abs(piece.offset - piece.prior))
    speed = Math.max(speed, Math.abs(piece.velocity))
    held ||= piece.dragging
  }

  quiet = !held && travel < QUIET_TRAVEL && speed < QUIET_SPEED ? quiet + 1 : 0
  if (quiet < QUIET_FRAMES)
    return true

  // Land on the advertised tilt rather than a hair off it, unless the piece is being leaned
  // on — that offset is a real one and holding it is the whole point of the contact.
  for (const piece of pieces) {
    if (!piece.touching && Math.abs(piece.offset) < SNAP) {
      piece.offset = 0
      piece.velocity = 0
      piece.write(piece.rest)
    }
  }
  return false
}

function step(now: number): void {
  const dt = Math.min(0.05, (now - frameTime) / 1000)
  frameTime = now
  raf = advance(dt) ? requestAnimationFrame(step) : 0
}

function run(): void {
  quiet = 0
  if (raf)
    return
  frameTime = performance.now()
  raf = requestAnimationFrame(step)
}

// The pointer's bearing from the nail, negated: a positive CSS rotation carries a point below
// the pivot the other way, so this is the angle that brings the grabbed point to the pointer.
function bearing(piece: Piece, x: number, y: number): number {
  return -Math.atan2(x - piece.geometry.pivotX, Math.max(MIN_LEVER, y - piece.geometry.pivotY))
}

// A knock: a new resting tilt, never dead straight and never where it already was. The current
// angle is held across the change, so the piece swings into the new rest rather than jumping.
export function knock(piece: Piece): void {
  // A range below the floor keeps its own bound: the piece stays inside what it was given.
  const floor = Math.min(MIN_TILT, piece.range)
  const previous = piece.rest
  let next = previous
  for (let i = 0; i < 8 && Math.abs(next - previous) < MIN_CHANGE; i++) {
    const magnitude = floor + Math.random() * (piece.range - floor)
    next = (Math.random() < 0.5 ? -1 : 1) * magnitude
  }
  piece.offset += (previous - next) / DEG
  piece.rest = next
  run()
}

// Every piece is remeasured, not just the grabbed one: a contact needs both bodies placed,
// and the wall resizes with the viewport.
export function measureAll(): void {
  for (const p of pieces)
    p.geometry = p.measure()
}

export function grab(piece: Piece, x: number, y: number): void {
  measureAll()
  piece.dragging = true
  piece.dragDistance = 0
  piece.lastX = x
  piece.lastY = y
  piece.grabOffset = bearing(piece, x, y) - piece.offset
  piece.target = piece.offset
  run()
}

export function drag(piece: Piece, x: number, y: number): void {
  if (!piece.dragging)
    return
  piece.dragDistance += Math.abs(x - piece.lastX) + Math.abs(y - piece.lastY)
  piece.lastX = x
  piece.lastY = y
  piece.target = resist(bearing(piece, x, y) - piece.grabOffset)
  run()
}

// A tap re-rolls the tilt; a real drag just lets go and settles back where it was.
export function release(piece: Piece): void {
  if (!piece.dragging)
    return
  piece.dragging = false
  if (piece.dragDistance < TAP_PX)
    knock(piece)
  run()
}
