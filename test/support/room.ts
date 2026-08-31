// Shared fake `RoomCtx` for the handler suites.
//
// Centralised so growing `RoomCtx` does not break every test file — the seam is
// meant to make handlers cheap to test, and a fake duplicated per suite would undo
// that. Not a `*.test.ts`, so vitest does not collect it.

import type { RoomConn, RoomCtx } from '../../party/ctx'
import type { RoomPlayer, RoomState } from '../../party/state'
import type { ServerMsg } from '../../src/lib/types'
import { buildState, drawProgress, freshRoomState } from '../../party/state'

export function player(clientId: string, over: Partial<RoomPlayer> = {}): RoomPlayer {
  return {
    clientId,
    name: clientId,
    isGm: false,
    connected: true,
    doneDrawing: false,
    drewThisRound: false,
    spectating: false,
    shape: 'rounded',
    ...over,
  }
}

export interface Harness {
  ctx: RoomCtx
  state: RoomState
  /** A connection for the given id. Seated players get `conn-<clientId>`. */
  conn: (id: string) => RoomConn
  /** Targeted sends, in order. */
  sent: { connId: string, msg: ServerMsg }[]
  /** Room-wide broadcasts, in order. */
  broadcasts: ServerMsg[]
  /** How many times a state snapshot was broadcast. */
  stateBroadcasts: () => number
  /** How many times the DRAWING progress counts were broadcast. */
  doneStatusBroadcasts: () => number
  /** How many times a room teardown was requested. */
  wipeCalls: () => number
  /** Whether the empty-room grace clock is running (null = not started). */
  emptySince: () => number | null
}

export interface HarnessOpts {
  /** Defaults to false, matching production — the 2-player start gate applies. */
  devMode?: boolean
  votingMs?: number
}

// `players` are seated with `connMap` wired so each has a `conn-<clientId>`. `over` patches
// any `RoomState` field. `endVoting` and `resetToLobby` are NOT stubbed — they are the real
// functions, so a handler that calls one really transitions and a test can assert on state.
export function harness(
  players: RoomPlayer[] = [],
  over: Partial<RoomState> = {},
  opts: HarnessOpts = {},
): Harness {
  const state = freshRoomState()
  for (const p of players) {
    state.players.set(p.clientId, p)
    state.connMap.set(`conn-${p.clientId}`, p.clientId)
  }
  Object.assign(state, over)

  const sent: { connId: string, msg: ServerMsg }[] = []
  const broadcasts: ServerMsg[] = []
  let states = 0
  let doneStatus = 0
  let wipes = 0
  let empty: number | null = null

  const ctx: RoomCtx = {
    state,
    broadcast: (msg) => { broadcasts.push(msg) },
    // Mirrors the real ctx: a real payload, so a test can assert on content as
    // well as on how many times it fired.
    broadcastState: () => { states++; broadcasts.push(buildState(state)) },
    broadcastDoneStatus: () => { doneStatus++; broadcasts.push({ type: 'done-status', ...drawProgress(state) }) },
    send: (conn, msg) => { sent.push({ connId: conn.id, msg }) },
    devMode: opts.devMode ?? false,
    votingMs: opts.votingMs ?? 300_000,
    markEmpty: () => { empty = Date.now() },
    markOccupied: () => { empty = null },
    wipeState: () => { wipes++ },
  }

  return {
    ctx,
    state,
    conn: id => ({ id, send: () => {} }),
    sent,
    broadcasts,
    stateBroadcasts: () => states,
    doneStatusBroadcasts: () => doneStatus,
    wipeCalls: () => wipes,
    emptySince: () => empty,
  }
}
