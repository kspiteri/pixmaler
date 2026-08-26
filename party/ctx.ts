// The effect surface a room handler needs.
//
// Part of #19. `PixmalerServer` implements this and passes it to the handler
// modules, so they never touch the Durable Object, `partyserver` types, or the
// alarm directly. A test supplies a plain object and asserts on what was sent.

import type { ServerMsg } from '../src/lib/types'
import type { RoomState } from './state'

// A connection, reduced to what a handler actually uses. `partyserver`'s
// `Connection` satisfies this structurally.
export interface RoomConn {
  readonly id: string
  send: (data: string) => void
}

export interface RoomCtx {
  state: RoomState
  /** Broadcast to every connection in the room. */
  broadcast: (msg: ServerMsg) => void
  /** Broadcast a fresh state snapshot to everyone. */
  broadcastState: () => void
  /** Broadcast just the DRAWING progress counts. */
  broadcastDoneStatus: () => void
  /** Send to one connection. */
  send: (conn: RoomConn, msg: ServerMsg) => void
  /** `PIXMALER_DEV=1` — relaxes the lobby start gate. Never set in production. */
  devMode: boolean
  /** How long the VOTING backstop runs, in ms. */
  votingMs: number
  // The empty-room grace clock lives on the Durable Object, not in `RoomState`,
  // because a wipe clears state but must not clear its own bookkeeping.
  /** Start the grace clock — the last live connection just dropped. */
  markEmpty: () => void
  /** Cancel it — somebody is here. */
  markOccupied: () => void
  /** Tear the room down: broadcast `session-closed` and drop every connection. */
  wipeState: () => void
}
