// Shared message protocol between client and PartyKit server.

export type Phase = 'LOBBY' | 'DRAWING' | 'VOTING' | 'RESULTS'

// Avatar shapes — the silhouette a player picks for their seat chip in the
// lobby. Runtime array, not just a union, because the **server validates against
// it**: the value reaches the DOM as a class name, so an unchecked string is an
// injection route. Same reason `rename` clamps to 24 chars.
//
// Deliberately restricted to shapes that hold a centred capital at 28 px. A
// diamond, triangle or star crushes the letter, and the letter is doing real
// work — it maps the chip to the name beside it. If a future custom-avatar
// feature drops the letter, that constraint lifts and this list can grow.
//
// `rounded` is the default because it is what the chip already looked like, so a
// player who never opens the picker sees no change.
export const AVATAR_SHAPES = ['rounded', 'square', 'circle', 'hexagon', 'octagon', 'leaf'] as const
export type AvatarShape = typeof AVATAR_SHAPES[number]
export const DEFAULT_AVATAR_SHAPE: AvatarShape = 'rounded'

// The one place a shape is validated, deliberately beside the list it checks and
// in the module both sides already import — same reasoning as `VOTE_CATEGORIES`
// above ("shared … so they can't drift apart"). This predicate is a security
// boundary: the value ends up as a class name on every other player's screen, so
// the server runs it on everything inbound and the client runs it on whatever
// localStorage hands back. Two copies would mean the next rule added here (case
// folding, a legacy alias) only lands on one side.
//
// Clamps rather than rejects, matching `rename`'s 24-char slice. `includes` on a
// real array compares with SameValueZero, so this coerces nothing, triggers no
// getters and cannot throw — `undefined`, `null`, numbers, objects and
// prototype-flavoured keys all fall through to the default.
export function normaliseShape(shape: unknown): AvatarShape {
  return AVATAR_SHAPES.includes(shape as AvatarShape)
    ? shape as AvatarShape
    : DEFAULT_AVATAR_SHAPE
}

// ── Client → Server ──────────────────────────────────────────────────────────

export interface JoinMsg {
  type: 'join'
  clientId: string
  name: string
  // The player's stored shape, so their chip is right on the very first render
  // rather than defaulting and then correcting. Optional: the server normalises
  // anything missing or unrecognised to DEFAULT_AVATAR_SHAPE.
  shape?: AvatarShape
}

// Change of avatar shape. LOBBY-only server-side, for the same reason `rename`
// is: the chip shows up in RESULTS, so letting it change after the drawing is in
// would let a player edit their identity after the fact.
export interface SetShapeMsg {
  type: 'shape'
  shape: AvatarShape
}

export interface RenameMsg {
  type: 'rename'
  name: string
}

export interface GmConfigureMsg {
  type: 'gm:configure'
  gridW: number
  gridH: number
  palette: string[] // hex colours
  targetGrid: number[] // palette indices, length gridW*gridH
  drawSeconds: number
}

export interface GmStartMsg {
  type: 'gm:start'
}

export interface DrawSubmitMsg {
  type: 'draw:submit'
  grid: number[] // palette indices
}

export interface DrawDoneMsg {
  type: 'draw:done'
}

export type VoteCategory = 'funniest' | 'best'

// Vote categories in display order. Shared by client (buttons, stickers) and
// server (tally) so they can't drift apart.
// Icon paths are relative (no leading `/`) so they resolve under the Vite
// `base` (`/pixmaler/`) when consumers prepend `import.meta.env.BASE_URL`.
export const VOTE_CATEGORIES: { id: VoteCategory, label: string, icon: string }[] = [
  { id: 'funniest', label: 'Funniest', icon: 'assets/icons/laugh.svg' },
  { id: 'best', label: 'Best', icon: 'assets/icons/star.svg' },
]

export interface VoteCastMsg {
  type: 'vote:cast'
  category: VoteCategory
  submissionId: string
}

export interface GmStopVotingMsg {
  type: 'gm:stopVoting'
}

// GM-only, DRAWING-only. Carries no amount: the step and the cap are the server's,
// so a client can't ask for more time than it's allowed.
export interface GmExtendTimeMsg {
  type: 'gm:extendTime'
}

export interface GmPlayAgainMsg {
  type: 'gm:playAgain'
}

// GM-only, DRAWING/VOTING-only. Abandons the round in flight and returns everyone
// to the lobby — for when the target image renders broken and the round is
// unplayable. Deliberately its own message rather than reusing `gm:playAgain`:
// the two share a teardown but carry opposite intents, and only a distinct type
// lets the server phase-guard each correctly and lets the client tell players
// their round was cancelled rather than finished.
export interface GmCancelRoundMsg {
  type: 'gm:cancelRound'
}

// GM-only, LOBBY/RESULTS-only. Ends the session for everyone: the room is wiped and
// every client is dropped onto the closed screen. Only offered between rounds —
// mid-round the right control is `gm:cancelRound`, which keeps the room alive.
//
// This is the deliberate twin of the idle wipe: same teardown, same
// `session-closed` broadcast, same terminal screen. The difference is only that
// somebody chose it.
export interface GmEndSessionMsg {
  type: 'gm:endSession'
}

export interface GmTransferMsg {
  type: 'gm:transfer'
  toClientId: string
}

export type ClientMsg
  = | JoinMsg
    | RenameMsg
    | SetShapeMsg
    | GmConfigureMsg
    | GmStartMsg
    | DrawSubmitMsg
    | DrawDoneMsg
    | VoteCastMsg
    | GmStopVotingMsg
    | GmExtendTimeMsg
    | GmPlayAgainMsg
    | GmCancelRoundMsg
    | GmEndSessionMsg
    | GmTransferMsg

// ── Inbound validation ───────────────────────────────────────────────────────

// Bounds for anything a client can put on the wire. Derived from what the UI can
// actually produce rather than invented:
//
// - **Grid side.** `gridSizeFor` is `round(source * scale * 0.01)`, the picker's
//   scale slider tops out at 50, and `SOURCE_MAX_SIDE` normalises the long edge
//   to 768 — so the largest legitimate side is `round(768 * 50 * 0.01)` = 384.
//   512 leaves headroom without admitting the million-cell case.
// - **Palette.** `COLOUR_OPTIONS` offers 8/16/24/32, and median-cut may return
//   fewer than asked for. 64 is generous.
// - **Draw seconds.** 30 s is a deliberate floor on a *playable* round, not just a
//   safety bound. It is enforced on both sides for different
//   reasons: the picker clamps so the constraint is visible the moment you cross
//   it, and the server clamps so a stale client can never put a shorter round on
//   the wire.
//
//   It **clamps rather than rejects**, the same choice `normaliseShape` and
//   `rename`'s 24-char slice already make. Rejecting was a real bug: HTML `min`
//   does not stop a typed value, so a GM testing with 20 s had the whole config
//   dropped and a Start button that silently did nothing.
export const GRID_MAX_SIDE = 512
export const GRID_MAX_CELLS = GRID_MAX_SIDE * GRID_MAX_SIDE
export const PALETTE_MAX_LEN = 64
export const DRAW_SECONDS_MIN = 30
export const DRAW_SECONDS_MAX = 600

// Exported so the picker can clamp the same way, and the input can't offer a
// value the server would silently change.
export function clampDrawSeconds(v: number): number {
  return Math.min(DRAW_SECONDS_MAX, Math.max(DRAW_SECONDS_MIN, Math.round(v)))
}

const isStr = (v: unknown): v is string => typeof v === 'string'
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const isSide = (v: unknown): v is number => isInt(v) && v >= 1 && v <= GRID_MAX_SIDE

// Palette entries reach the DOM as CSS custom-property values and the canvas as
// fill styles, so the shape is checked rather than trusted — the same argument
// `normaliseShape` makes about class names, one rung down.
const HEX_COLOUR = /^#[0-9a-f]{6}$/i
function isPalette(v: unknown): v is string[] {
  return Array.isArray(v) && v.length >= 1 && v.length <= PALETTE_MAX_LEN
    && v.every(c => isStr(c) && HEX_COLOUR.test(c))
}

// Cells are palette indices. The *upper* bound depends on the live palette, so
// only the server can check it; this is the structural half — an integer array
// inside the hard cap.
function isCells(v: unknown, maxLen: number): v is number[] {
  return Array.isArray(v) && v.length <= maxLen && v.every(isInt)
}

/**
 * Parse a raw inbound frame into a `ClientMsg`, or `null` if it is not one.
 *
 * Replaces `JSON.parse(raw) as ClientMsg`, which was a compile-time promise with
 * no runtime check behind it: a well-formed JSON object of *any* shape reached
 * the handlers. An unguarded `grid` then made `endDrawing`'s gallery build throw
 * after it had already moved `phase`, so the alarm retry resolved the round with
 * an empty gallery and silently discarded every submission.
 *
 * Deliberately **constructs** each message rather than narrowing the input, so
 * unknown extra properties cannot ride along into room state and back out over a
 * broadcast.
 *
 * Cannot throw: every check is a `typeof`, an `Array.isArray`, or a regex on a
 * value already proven to be a string. Same discipline as `normaliseShape`.
 *
 * **Structural only.** Anything that needs the room's config — does this grid
 * match the round's dimensions, is every cell inside the round's palette — is
 * checked server-side, which is the only place that knows.
 */
export function parseClientMsg(raw: string): ClientMsg | null {
  let parsed: unknown
  try { parsed = JSON.parse(raw) }
  catch { return null }
  if (typeof parsed !== 'object' || parsed === null)
    return null
  const m = parsed as Record<string, unknown>

  switch (m.type) {
    case 'join':
      return isStr(m.clientId) && isStr(m.name)
        ? { type: 'join', clientId: m.clientId, name: m.name, shape: normaliseShape(m.shape) }
        : null

    case 'rename':
      return isStr(m.name) ? { type: 'rename', name: m.name } : null

    // `normaliseShape` clamps rather than rejects, so this cannot fail — matching
    // what `handleShape` already did with the value.
    case 'shape':
      return { type: 'shape', shape: normaliseShape(m.shape) }

    case 'gm:configure': {
      const { gridW, gridH, palette, targetGrid, drawSeconds } = m
      if (!isSide(gridW) || !isSide(gridH) || !isPalette(palette))
        return null
      // Clamped, not rejected — a number out of range is a typo, and dropping the
      // whole config over it leaves the GM with a Start button that does nothing.
      // Still requires a finite number: `"120"` or `NaN` is a broken client, not a typo.
      if (typeof drawSeconds !== 'number' || !Number.isFinite(drawSeconds))
        return null
      // The target is a fully quantised image, so unlike a player's grid it has
      // no `-1` holes and its length is exact.
      if (!isCells(targetGrid, GRID_MAX_CELLS) || targetGrid.length !== gridW * gridH)
        return null
      if (!targetGrid.every(c => c >= 0 && c < palette.length))
        return null
      return { type: 'gm:configure', gridW, gridH, palette, targetGrid, drawSeconds: clampDrawSeconds(drawSeconds) }
    }

    case 'draw:submit':
      return isCells(m.grid, GRID_MAX_CELLS) ? { type: 'draw:submit', grid: m.grid } : null

    case 'vote:cast':
      return isStr(m.submissionId) && VOTE_CATEGORIES.some(c => c.id === m.category)
        ? { type: 'vote:cast', category: m.category as VoteCategory, submissionId: m.submissionId }
        : null

    case 'gm:transfer':
      return isStr(m.toClientId) ? { type: 'gm:transfer', toClientId: m.toClientId } : null

    // Bodiless: the type is the whole payload, so there is nothing left to check.
    case 'gm:start':
    case 'draw:done':
    case 'gm:stopVoting':
    case 'gm:extendTime':
    case 'gm:playAgain':
    case 'gm:cancelRound':
    case 'gm:endSession':
      return { type: m.type }

    default:
      return null
  }
}

// ── Server → Client ──────────────────────────────────────────────────────────

export interface Player {
  clientId: string
  name: string
  isGm: boolean
  connected: boolean
  doneDrawing: boolean
  // Painted at least one cell this round. **Sticky**: it stays true even after the
  // player clears the canvas, and that is the whole point.
  //
  // `draw:submit` is a debounced mirror of the canvas, so clearing sends an
  // all-`-1` grid. The gallery used to be filtered on grid *content*, so a player
  // who cleared to start over and ran out of time was dropped from voting **and**
  // results with no feedback — they had drawn, and the round forgot. Filtering on
  // this flag instead keeps them in: their card is blank, but it exists.
  //
  // Deliberately not "has a non-blank grid": that conflates *didn't participate*
  // with *participated and wiped it*, which are different things and get different
  // treatment on the reveal.
  //
  // Cleared for everyone when the next round starts — in the same statement as
  // `doneDrawing` and `spectating`, which is the discipline that keeps the three
  // in step. A per-round flag with its own forgotten reset is what produced the
  // blank-winner and phantom-vote bugs.
  drewThisRound: boolean
  // Joined after the round had already started, so they sit this one out: no
  // canvas, no vote, and — the point of the flag — **excluded from both progress
  // denominators**, so "X of Y done" and "X of Y voted" can't jump backwards when
  // somebody arrives mid-round. That backwards jump is also why `allVoted` could
  // un-fire, which is what forced item 59's notification into a non-latching
  // channel; with spectators excluded it becomes a fact that can't retract.
  //
  // Cleared for everyone when the next round starts — wherever `doneDrawing` is
  // cleared, which is the discipline that keeps the two in step.
  //
  // Set only in `handleJoin`'s new-player branch: a reconnecting player keeps
  // whatever they were, so a mid-round refresh can't demote a real competitor to a
  // spectator, and a returning spectator stays one.
  spectating: boolean
  // Chosen in the lobby, persisted in the player's own localStorage, and echoed
  // here so *other* clients can draw their chip. Always a valid AvatarShape —
  // the server normalises on the way in.
  shape: AvatarShape
}

export interface StateMsg {
  type: 'state'
  phase: Phase
  players: Player[]
  gmClientId: string
  config: GmConfigureMsg | null
  deadline: number | null // unix ms
  // The round's *current* length, growing with each extension. `config.drawSeconds`
  // is where it starts; the countdown bar divides by this instead, or it pins at
  // 100% once time is added.
  roundSeconds: number
  // "+15s" presses the GM has left. Server-owned, so the button can disable itself
  // without duplicating the cap.
  extensionsLeft: number
  doneCount: number
  totalDrawing: number
  // VOTING progress — voters who've cast all categories, out of those present.
  votedCount: number
  totalVoters: number
}

export interface PhaseMsg {
  type: 'phase'
  phase: Phase
  deadline: number | null
}

export interface Submission {
  submissionId: string
  grid: number[]
}

export interface GalleryMsg {
  type: 'gallery'
  submissions: Submission[]
  palette: string[]
  gridW: number
  gridH: number
}

export interface RankedResult {
  submissionId: string
  clientId: string
  name: string
  votes: number // overall = funniest + best
  breakdown: Record<VoteCategory, number>
  grid: number[]
}

export interface ResultsMsg {
  type: 'results'
  ranked: RankedResult[]
  palette: string[]
  gridW: number
  gridH: number
}

export interface DoneStatusMsg {
  type: 'done-status'
  doneCount: number
  totalDrawing: number
}

export interface ErrorMsg {
  type: 'error'
  message: string
}

// Sent to a single voter when they (re)join mid-VOTING, echoing back their own
// per-category picks so the client can rehydrate `myVotes` after a reconnect.
// Only their own votes — never anyone else's (running tallies stay hidden).
export interface VoteStateMsg {
  type: 'vote-state'
  votes: Partial<Record<VoteCategory, string>> // category → submissionId
}

// Sent to a single player when they (re)join mid-DRAWING, echoing back their
// OWN latest auto-submitted grid so a page reload restores their drawing.
// Only their own — never anyone else's (the blind reveal depends on it).
export interface DrawStateMsg {
  type: 'draw-state'
  grid: number[] // palette indices; -1 = untouched
}

// Broadcast from `wipeState()` — the room has been reset and this client's slot no
// longer exists. Terminal: the client stops reconnecting and shows a closed screen.
//
// Needed because a wipe is otherwise invisible. The idle path (45 min of no
// messages) can fire with live connections, and `wipeState` clears `players` and
// `connMap` without telling anyone, so a watching client keeps rendering a room the
// server has forgotten. Every action it sends is then silently dropped by the phase
// and GM guards — a zombie tab that looks fine and does nothing.
export interface SessionClosedMsg {
  type: 'session-closed'
}

// The deployed Worker's identity, sent once per connection (#25). From Cloudflare's
// version-metadata binding, never `package.json`, which lags because the Worker is
// deployed before the Release PR merges. Empty fields mean the binding is absent.
export interface VersionMsg {
  type: 'version'
  id: string
  tag: string // empty unless deploys start setting one
  timestamp: string // ISO; the field that answers "is the server older than the frontend?"
}

export type ServerMsg
  = | StateMsg
    | PhaseMsg
    | GalleryMsg
    | ResultsMsg
    | DoneStatusMsg
    | ErrorMsg
    | VoteStateMsg
    | DrawStateMsg
    | SessionClosedMsg
    | VersionMsg
