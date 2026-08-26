// DRAWING-phase handlers (#19). `draw:submit` is high-frequency — the client
// debounces it on every stroke — so this is the hottest path on the server, and it
// broadcasts nothing.

import type { ClientMsg } from '../src/lib/types'
import type { RoomConn, RoomCtx } from './ctx'
import { playerByConn } from './state'

export function handleDrawDone(ctx: RoomCtx, conn: RoomConn) {
  const player = playerByConn(ctx.state, conn.id)
  // A spectator has no canvas, so a `draw:done` from one is drift or tampering.
  if (!player || player.spectating || ctx.state.phase !== 'DRAWING')
    return
  // A social signal only: it does not end the round. The deadline does.
  player.doneDrawing = true
  ctx.broadcastDoneStatus()
}

export function handleSubmit(
  ctx: RoomCtx,
  conn: RoomConn,
  msg: Extract<ClientMsg, { type: 'draw:submit' }>,
) {
  const { state } = ctx
  const player = playerByConn(state, conn.id)
  // A spectator's grid must never reach `submissions`, or they appear in the gallery
  // and become votable.
  if (!player || player.spectating || state.phase !== 'DRAWING')
    return

  // Contextual half of the payload check: `parseClientMsg` proved this is an integer
  // array inside the hard cap, but only the room knows its dimensions and palette,
  // and this grid is broadcast verbatim to every other player's renderer.
  const cfg = state.config
  if (!cfg || msg.grid.length !== cfg.gridW * cfg.gridH)
    return
  // Floor is -1, not 0: unlike `targetGrid`, a player's grid legitimately has holes.
  if (msg.grid.some(cell => cell < -1 || cell >= cfg.palette.length))
    return

  // submissionId === clientId — the vote self-check relies on it. `doneDrawing` is
  // deliberately not set here; that flag is driven only by the player clicking it.
  state.submissions.set(player.clientId, msg.grid)

  // Sticky, only ever set. Clearing the canvas sends an all-`-1` grid down this same
  // path, so unsetting would drop the player from the gallery for wiping work they
  // did do. The only reset is at round start.
  if (!player.drewThisRound && msg.grid.some(cell => cell !== -1))
    player.drewThisRound = true
}
