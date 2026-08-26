// The effect surface a room handler needs (#19). `PixmalerServer` implements it and
// passes it to the handler modules, so they never touch the Durable Object,
// `partyserver` types or the alarm directly. A test supplies a plain object.

import type { ServerMsg } from '../src/lib/types'
import type { RoomState } from './state'

// `partyserver`'s `Connection` satisfies this structurally.
export interface RoomConn {
  readonly id: string
  send: (data: string) => void
}

export interface RoomCtx {
  state: RoomState
  broadcast: (msg: ServerMsg) => void
  broadcastState: () => void
  broadcastDoneStatus: () => void
  send: (conn: RoomConn, msg: ServerMsg) => void
  /** `PIXMALER_DEV=1` — relaxes the lobby start gate. Never set in production. */
  devMode: boolean
  /** VOTING backstop length, ms. */
  votingMs: number
  // The empty-room grace clock lives here, not in `RoomState`: a wipe clears state
  // but must not clear its own bookkeeping.
  markEmpty: () => void
  markOccupied: () => void
  wipeState: () => void
}
