// The room's in-memory shape, and the pure derivations over it.
//
// Second slice of #19. Everything here is a function of `RoomState` alone — no
// connections, no broadcasts, no Durable Object — so the rules that decide what
// players see (who is GM, who counts toward progress) are testable directly.

import type { GmConfigureMsg, Phase, Player, RankedResult, StateMsg, Submission } from '../src/lib/types'
import { VOTE_CATEGORIES } from '../src/lib/types'
import { voterOf } from './tally'

// GM "+15s" during DRAWING. Capped server-side — a client-side cap is decoration.
export const EXTEND_STEP_MS = 15_000
export const MAX_EXTENSIONS = 2

export interface RoomState {
  phase: Phase
  // Keyed by clientId throughout — conn.id tracked separately in connMap.
  players: Map<string, Player>
  // Maps conn.id → clientId for fast lookup in message/close handlers.
  connMap: Map<string, string>
  gmClientId: string
  // The player who first claimed GM. They reclaim the role on reconnect even
  // if someone else has been auto-promoted in their absence (per the plan).
  originalGmClientId: string
  config: GmConfigureMsg | null
  deadline: number | null
  // Grows with each "+15s"; reset at handleStart. Separate from
  // `config.drawSeconds`, which stays the configured start so the lobby setting
  // isn't rewritten by a mid-round extension.
  roundSeconds: number
  extensions: number
  submissions: Map<string, number[]> // clientId → grid
  votes: Map<string, string> // `${voterClientId}:${category}` → submissionId
  // Frozen gallery for the current VOTING round — filtered (blanks dropped) and
  // shuffled once at endDrawing so the order is stable across re-sends (rejoins).
  gallery: Submission[] | null
  // The computed ranking, retained from `endVoting` so a client that joins or
  // reloads during RESULTS can be sent the reveal it missed. `results` is
  // otherwise broadcast exactly once, and without this a rejoining client sits
  // on "counting the damage…" forever — and a rejoining GM loses their only way
  // to restart the room. Cleared on every path back out of RESULTS.
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

// Connection → player. Keyed through `connMap` rather than by scanning players,
// which is why a reconnect under the same clientId reclaims the same slot.
export function playerByConn(state: RoomState, connId: string): Player | undefined {
  const clientId = state.connMap.get(connId)
  return clientId ? state.players.get(clientId) : undefined
}

// False for an unidentified connection, and false while the role is vacant —
// `connMap.get` yields undefined, which never equals a clientId or `''`.
export function isGm(state: RoomState, connId: string): boolean {
  return state.connMap.get(connId) === state.gmClientId
}

// Hand GM to the first connected player when the current holder is gone.
//
// `originalGmClientId` is deliberately NOT updated: this is a caretaker, and the
// original GM reclaims the role from them on reconnect.
export function autoPromoteGm(state: RoomState): void {
  if (state.players.get(state.gmClientId)?.connected)
    return
  const next = [...state.players.values()].find(p => p.connected)
  if (next)
    state.gmClientId = next.clientId
}

// Players who count toward a progress readout: connected, and not spectating.
//
// Spectators are excluded from both halves of both readouts. They joined
// mid-round, so counting them would make "X of Y done" jump backwards the moment
// somebody arrives — and would let `allVoted` un-fire, which is what previously
// ruled out any latching GM notification.
function present(state: RoomState): Player[] {
  return [...state.players.values()].filter(p => p.connected && !p.spectating)
}

// DRAWING progress: how many present players have flagged "I'm done", out of all
// present. Both halves count the same population, so the numerator can never
// exceed the denominator — a player who flags done and then drops leaves both
// counts. The GM is included: they draw and are ranked like everyone else.
export function drawProgress(state: RoomState): { doneCount: number, totalDrawing: number } {
  const players = present(state)
  return {
    doneCount: players.filter(p => p.doneDrawing).length,
    totalDrawing: players.length,
  }
}

// VOTING progress: how many present players have cast a vote in *every* category
// (= finished voting), out of all present. Broadcast rather than the tallies, so
// the GM can decide when to stop without seeing who is winning.
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

export function buildState(state: RoomState): StateMsg {
  // Derive `isGm` from `gmClientId` here rather than storing it per player, so
  // the flag cannot drift out of sync with the canonical role-holder.
  const players = [...state.players.values()].map(p => ({
    ...p,
    isGm: p.clientId === state.gmClientId,
  }))
  return {
    type: 'state',
    phase: state.phase,
    players,
    gmClientId: state.gmClientId,
    config: state.config,
    deadline: state.deadline,
    roundSeconds: state.roundSeconds,
    extensionsLeft: Math.max(0, MAX_EXTENSIONS - state.extensions),
    ...drawProgress(state),
    ...votingProgress(state),
  }
}
