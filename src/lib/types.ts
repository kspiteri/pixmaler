// Shared message protocol between client and PartyKit server.

export type Phase = 'LOBBY' | 'DRAWING' | 'VOTING' | 'RESULTS'

// ── Client → Server ──────────────────────────────────────────────────────────

export interface JoinMsg {
  type: 'join'
  clientId: string
  name: string
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
export const VOTE_CATEGORIES: { id: VoteCategory, label: string, emoji: string }[] = [
  { id: 'funniest', label: 'Funniest', emoji: '😂' },
  { id: 'best', label: 'Best', emoji: '⭐' },
]

export interface VoteCastMsg {
  type: 'vote:cast'
  category: VoteCategory
  submissionId: string
}

export interface GmStopVotingMsg {
  type: 'gm:stopVoting'
}

export interface GmPlayAgainMsg {
  type: 'gm:playAgain'
}

export interface GmTransferMsg {
  type: 'gm:transfer'
  toClientId: string
}

export type ClientMsg
  = | JoinMsg
    | RenameMsg
    | GmConfigureMsg
    | GmStartMsg
    | DrawSubmitMsg
    | DrawDoneMsg
    | VoteCastMsg
    | GmStopVotingMsg
    | GmPlayAgainMsg
    | GmTransferMsg

// ── Server → Client ──────────────────────────────────────────────────────────

export interface Player {
  clientId: string
  name: string
  isGm: boolean
  connected: boolean
  doneDrawing: boolean
}

export interface StateMsg {
  type: 'state'
  phase: Phase
  players: Player[]
  gmClientId: string
  config: GmConfigureMsg | null
  deadline: number | null // unix ms
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

export type ServerMsg
  = | StateMsg
    | PhaseMsg
    | GalleryMsg
    | ResultsMsg
    | DoneStatusMsg
    | ErrorMsg
