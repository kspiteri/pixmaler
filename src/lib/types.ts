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
    | GmTransferMsg

// ── Server → Client ──────────────────────────────────────────────────────────

export interface Player {
  clientId: string
  name: string
  isGm: boolean
  connected: boolean
  doneDrawing: boolean
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

export type ServerMsg
  = | StateMsg
    | PhaseMsg
    | GalleryMsg
    | ResultsMsg
    | DoneStatusMsg
    | ErrorMsg
    | VoteStateMsg
    | DrawStateMsg
