// The room's in-memory shape and the pure derivations over it (#19). Everything
// here is a function of `RoomState` alone — no connections, no broadcasts, no
// Durable Object — so the rules deciding what players see are directly testable.

import type { GmConfigureMsg, Phase, Player, RankedResult, RoundConfig, StateMsg, Submission, VoteCategory, VoteStateMsg } from '../src/lib/protocol'
import { VOTE_CATEGORIES } from '../src/lib/protocol'
import { categoryOf, voterOf } from './tally'

// GM "+15s" during DRAWING. Capped server-side — a client-side cap is decoration.
export const EXTEND_STEP_MS = 15_000
export const MAX_EXTENSIONS = 2

// The server's player carries two fields the wire does not. `drewThisRound` decides gallery
// membership in `endDrawing` and has no client reader; broadcasting it meant shipping a value
// stale between the last stroke and RESULTS (#27). `secret` proves seat ownership on
// reconnect (#72) and must never be broadcast — both are stripped in `buildState`.
export type RoomPlayer = Player & { drewThisRound: boolean, secret: string }

export interface RoomState {
  phase: Phase
  players: Map<string, RoomPlayer> // keyed by clientId; conn.id lives in connMap
  connMap: Map<string, string> // conn.id → clientId
  gmClientId: string
  // First claimer of GM. Reclaims the role on reconnect, even after an auto-promote.
  originalGmClientId: string
  config: GmConfigureMsg | null
  deadline: number | null
  // Grows with each "+15s"; reset at handleStart. Separate from `config.drawSeconds`
  // so a mid-round extension doesn't rewrite the lobby setting.
  roundSeconds: number
  extensions: number
  submissions: Map<string, number[]> // clientId → grid
  votes: Map<string, string> // `${voterClientId}:${category}` → submissionId
  // Frozen at endDrawing so rejoins and results read a consistent set.
  gallery: Submission[] | null
  // Retained so a client joining during RESULTS can be sent the reveal it missed —
  // `results` is broadcast exactly once. Cleared on every path out of RESULTS.
  ranked: RankedResult[] | null
  // submissionId → clientId for the frozen gallery (#73). The gallery ships opaque ids so a
  // drawing can't be mapped to a name mid-VOTING; this server-only reverse resolves self-votes,
  // the reveal's real identities, and each drawer's own card. Frozen with `gallery`.
  submissionOwners: Map<string, string>
}

export function freshRoomState(): RoomState {
  return {
    phase: 'LOBBY',
    players: new Map(),
    connMap: new Map(),
    gmClientId: '',
    originalGmClientId: '',
    config: null,
    deadline: null,
    roundSeconds: 0,
    extensions: 0,
    submissions: new Map(),
    votes: new Map(),
    gallery: null,
    ranked: null,
    submissionOwners: new Map(),
  }
}

// Via `connMap` rather than by scanning players, which is why a reconnect under the
// same clientId reclaims the same slot.
export function playerByConn(state: RoomState, connId: string): RoomPlayer | undefined {
  const clientId = state.connMap.get(connId)
  return clientId ? state.players.get(clientId) : undefined
}

// False for an unidentified connection and while the role is vacant: `connMap.get`
// yields undefined, which never equals a clientId or `''`.
export function isGm(state: RoomState, connId: string): boolean {
  return state.connMap.get(connId) === state.gmClientId
}

// `originalGmClientId` is deliberately NOT updated: this is a caretaker, and the
// original GM reclaims the role from them on reconnect.
export function autoPromoteGm(state: RoomState): void {
  if (state.players.get(state.gmClientId)?.connected)
    return
  const next = [...state.players.values()].find(p => p.connected)
  if (next)
    state.gmClientId = next.clientId
}

// Spectators are excluded from both halves of both readouts: they joined mid-round,
// so counting them would make "X of Y done" jump backwards on arrival and would let
// `allVoted` un-fire.
function present(state: RoomState): Player[] {
  return [...state.players.values()].filter(p => p.connected && !p.spectating)
}

// Both halves count the same population, so the numerator can never exceed the
// denominator. The GM is included: they draw and are ranked like everyone else.
export function drawProgress(state: RoomState): { doneCount: number, totalDrawing: number } {
  const players = present(state)
  return {
    doneCount: players.filter(p => p.doneDrawing).length,
    totalDrawing: players.length,
  }
}

// Voters who have cast in *every* category. Broadcast rather than the tallies, so the
// GM can decide when to stop without seeing who is winning.
export function votingProgress(state: RoomState): { votedCount: number, totalVoters: number } {
  const perVoter = new Map<string, number>()
  for (const key of state.votes.keys()) {
    const voterId = voterOf(key)
    perVoter.set(voterId, (perVoter.get(voterId) ?? 0) + 1)
  }
  const players = present(state)
  return {
    votedCount: players.filter(p => (perVoter.get(p.clientId) ?? 0) >= VOTE_CATEGORIES.length).length,
    totalVoters: players.length,
  }
}

// This client's own opaque submission id for the frozen gallery, or null if they did not
// draw (#73). A scan of the owners map (a room is <= 16 seats), so no second index to keep
// in step. Multiple connections can share a clientId (multi-tab), but a clientId owns at
// most one submission per round.
function submissionIdFor(state: RoomState, clientId: string): string | null {
  for (const [submissionId, owner] of state.submissionOwners) {
    if (owner === clientId)
      return submissionId
  }
  return null
}

// The per-client VOTING echo (#73): this voter's own picks plus their own opaque submission
// id. Only their own picks — never anyone else's, since running tallies stay hidden — and
// only their own id, since the gallery is anonymous to everyone else. Shared by the VOTING
// broadcast (`sendEach`) and the mid-VOTING rejoin re-send.
export function buildVoteState(state: RoomState, clientId: string): VoteStateMsg {
  const votes: Partial<Record<VoteCategory, string>> = {}
  for (const [key, subId] of state.votes) {
    if (voterOf(key) === clientId)
      votes[categoryOf(key)] = subId
  }
  return { type: 'vote-state', votes, mySubmissionId: submissionIdFor(state, clientId) }
}

// The wire's view of the round settings: everything except the target grid, which travels
// once in a `target` message (#35). Dropped here rather than at each write, for the same
// reason as `drewThisRound` — one boundary to keep honest.
export function roundConfig(config: GmConfigureMsg | null): RoundConfig | null {
  if (!config)
    return null
  const { type: _t, targetGrid: _g, ...rest } = config
  return rest
}

export function buildState(state: RoomState): StateMsg {
  // `isGm` is derived here so it cannot drift from `gmClientId`; `drewThisRound` and `secret`
  // are dropped here rather than at each write, because this is the one place the room becomes
  // a wire payload and so the one place that has to stay honest (#27, #72). Leaking `secret`
  // would defeat the seat binding — it must never reach the wire.
  const players: Player[] = [...state.players.values()].map(({ drewThisRound: _, secret: _s, ...p }) => ({
    ...p,
    isGm: p.clientId === state.gmClientId,
  }))
  return {
    type: 'state',
    phase: state.phase,
    players,
    gmClientId: state.gmClientId,
    config: roundConfig(state.config),
    deadline: state.deadline,
    roundSeconds: state.roundSeconds,
    extensionsLeft: Math.max(0, MAX_EXTENSIONS - state.extensions),
    ...drawProgress(state),
    ...votingProgress(state),
  }
}
