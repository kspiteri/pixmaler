// The effect surface a room handler needs (#19). `PixmalerServer` implements it and
// passes it to the handler modules, so they never touch the Durable Object,
// `partyserver` types or the alarm directly. A test supplies a plain object.

import type { ServerMsg } from '../src/lib/protocol'
import type { RoomState } from './state'

// `partyserver`'s `Connection` satisfies this structurally.
export interface RoomConn {
  readonly id: string
  send: (data: string) => void
}

export interface RoomCtx {
  state: RoomState
  /** The room / instance name (the code off the URL), for room-code validation (#66). */
  roomName: string
  broadcast: (msg: ServerMsg) => void
  broadcastState: () => void
  broadcastDoneStatus: () => void
  send: (conn: RoomConn, msg: ServerMsg) => void
  /**
   * Send a per-recipient message to every connected client, resolving each connection to its
   * clientId (#73). Used to hand each drawer its own opaque submission id without leaking
   * anyone else's; a non-drawer still receives the message (with a null id inside), not a skip.
   * `build` may return null to skip a recipient entirely — a general escape hatch, unused today.
   */
  sendEach: (build: (clientId: string) => ServerMsg | null) => void
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
