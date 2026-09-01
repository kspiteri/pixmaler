// Shared message protocol between client and PartyKit server.

export type Phase = 'LOBBY' | 'DRAWING' | 'VOTING' | 'RESULTS'

// Avatar shapes for the seat chip. A runtime array, not just a union, because the
// **server validates against it** — the value reaches the DOM as a class name. Restricted
// to shapes that hold a centred capital at 28 px, since the letter maps chip to name.
export const AVATAR_SHAPES = ['rounded', 'square', 'circle', 'hexagon', 'octagon', 'leaf'] as const
export type AvatarShape = typeof AVATAR_SHAPES[number]
export const DEFAULT_AVATAR_SHAPE: AvatarShape = 'rounded'

// The only place a shape is validated, kept beside the list it checks and in the module
// both sides import — the value becomes a class name on every other player's screen, so
// two copies would mean the next rule added lands on one side only. Clamps, never throws.
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

// The round's settings, small enough to ride on every `state`. The target grid is not
// here: it never changes mid-round and dominates the payload, so it travels once in its
// own `TargetMsg` instead of being re-sent on every vote and join.
export interface RoundConfig {
  gridW: number
  gridH: number
  palette: string[] // hex colours
  drawSeconds: number
}

export interface GmConfigureMsg extends RoundConfig {
  type: 'gm:configure'
  targetGrid: number[] // palette indices, length gridW*gridH
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

// Display order, shared by client (buttons, stickers) and server (tally) so they cannot
// drift. Icon paths are relative so they resolve under the Vite `base` once a consumer
// prepends `import.meta.env.BASE_URL`.
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

// GM-only, DRAWING/VOTING-only. Abandons a round in flight for when the target image
// renders broken. Its own message rather than reusing `gm:playAgain`: they share a
// teardown but carry opposite intents, and only a distinct type phase-guards correctly.
export interface GmCancelRoundMsg {
  type: 'gm:cancelRound'
}

// GM-only, LOBBY/RESULTS-only. Wipes the room and drops every client onto the closed
// screen — the deliberate twin of the idle wipe, differing only in that somebody chose
// it. Mid-round the right control is `gm:cancelRound`, which keeps the room alive.
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

// Bounds for anything a client can put on the wire, derived from what the UI can
// actually produce rather than invented. The largest legitimate grid side is
// `round(768 * 50 * 0.01)` = 384, from `SOURCE_MAX_SIDE` and the scale slider's cap.
export const GRID_MAX_SIDE = 512 // headroom over 384, without admitting a million cells
export const GRID_MAX_CELLS = GRID_MAX_SIDE * GRID_MAX_SIDE
export const PALETTE_MAX_LEN = 64 // the picker offers 8/16/24/32, exactly; headroom over 32

// A floor on a *playable* round, enforced on both sides: the picker clamps to make the
// limit visible, the server clamps so a stale client cannot shorten a round. Clamps
// rather than rejects — HTML `min` lets a typed value through, which dropped whole configs.
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

// Parses a raw frame into a `ClientMsg`, or `null`. Replaces an unchecked cast that let
// arbitrary objects reach the handlers. **Constructs** each message rather than narrowing,
// so unknown properties cannot ride into room state and out over a broadcast.
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
  // Joined after the round started, so they sit it out and are **excluded from both
  // progress denominators** — otherwise "X of Y done" jumps backwards on a mid-round
  // arrival, which is what let `allVoted` un-fire. Set only for genuinely new players.
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
  config: RoundConfig | null
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

// Broadcast from `wipeState()` — this client's slot no longer exists, so it stops
// reconnecting and shows the closed screen. Needed because a wipe is otherwise invisible:
// the idle path can fire with live connections, leaving a zombie tab rendering a dead room.
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

// The image players are copying. Sent once when the GM configures a round, and to a
// joining client that arrives after — never on a routine `state`, which is why `config`
// carries only `RoundConfig`. Clients hold it until `config` goes null.
export interface TargetMsg {
  type: 'target'
  grid: number[] // palette indices, length gridW*gridH
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
    | TargetMsg
    | VersionMsg
