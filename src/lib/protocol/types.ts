// Shared message protocol between client and PartyKit server.

export type Phase = 'LOBBY' | 'DRAWING' | 'VOTING' | 'RESULTS'

// Avatar shapes for the seat chip. A runtime array, not just a union, because the server
// validates against it and the value reaches the DOM as a class name. Restricted to shapes
// that hold a centred capital at 28 px, since the letter maps chip to name.
export const AVATAR_SHAPES = ['rounded', 'square', 'circle', 'hexagon', 'octagon', 'leaf'] as const
export type AvatarShape = typeof AVATAR_SHAPES[number]
export const DEFAULT_AVATAR_SHAPE: AvatarShape = 'rounded'

// The single shape validator, kept beside the list it checks and in the module both sides
// import so the two never drift. Clamps, never throws.
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

// Change of avatar shape. LOBBY-only server-side, like `rename`: the chip shows in
// RESULTS, so a later change would edit identity after the fact.
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

// GM-only, DRAWING/VOTING-only. Abandons a round in flight when the target renders
// broken. Distinct from `gm:playAgain` so it phase-guards correctly despite shared teardown.
export interface GmCancelRoundMsg {
  type: 'gm:cancelRound'
}

// GM-only, LOBBY/RESULTS-only. Wipes the room and drops every client onto the closed
// screen. Mid-round the right control is `gm:cancelRound`, which keeps the room alive.
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

// A floor on a *playable* round, enforced on both sides: the picker clamps to make the
// limit visible, the server clamps so a stale client cannot shorten a round. Clamps
// rather than rejects — HTML `min` lets a typed value through.
export const DRAW_SECONDS_MIN = 30
export const DRAW_SECONDS_MAX = 600

// Exported so the picker can clamp the same way, and the input can't offer a
// value the server would silently change.
export function clampDrawSeconds(v: number): number {
  return Math.min(DRAW_SECONDS_MAX, Math.max(DRAW_SECONDS_MIN, Math.round(v)))
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
// reconnecting and shows the closed screen. The idle path can fire with live connections.
export interface SessionClosedMsg {
  type: 'session-closed'
}

// Broadcast right after `resetToLobby` when the GM abandoned a round mid-game.
export interface RoundCancelledMsg {
  type: 'round-cancelled'
}

// The deployed Worker's identity, sent once per connection. From Cloudflare's
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
    | RoundCancelledMsg
    | TargetMsg
    | VersionMsg
