// The room's in-memory shape and the pure derivations over it (#19). Everything
// here is a function of `RoomState` alone — no connections, no broadcasts, no
// Durable Object — so the rules deciding what players see are directly testable.

import type { GmConfigureMsg, Phase, Player, RankedResult, RoundConfig, StateMsg, Submission } from '../src/lib/types'
import { VOTE_CATEGORIES } from '../src/lib/types'
import { voterOf } from './tally'

// GM "+15s" during DRAWING. Capped server-side — a client-side cap is decoration.
export const EXTEND_STEP_MS = 15_000
export const MAX_EXTENSIONS = 2

// The server's player carries one field the wire does not: `drewThisRound` decides
// gallery membership in `endDrawing` and has no client reader, and broadcasting it meant
// shipping a value that is stale between the last stroke and RESULTS (#27).
export type RoomPlayer = Player & { drewThisRound: boolean }

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
  // `isGm` is derived here so it cannot drift from `gmClientId`, and `drewThisRound` is
  // dropped here rather than at each write: this is the one place the room becomes a wire
  // payload, so it is the one place that has to stay honest (#27).
  const players: Player[] = [...state.players.values()].map(({ drewThisRound: _, ...p }) => ({
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
