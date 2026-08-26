// DRAWING-phase handlers.
//
// Part of #19. `draw:submit` is high-frequency — the client debounces it on every
// stroke — so this is the hottest path on the server.

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
  // Same as `draw:done`: a spectator sits the round out, so their grid must never
  // reach `submissions` — otherwise they'd appear in the gallery and be votable.
  if (!player || player.spectating || state.phase !== 'DRAWING')
    return

  // Contextual half of the payload check. `parseClientMsg` proved this is an
  // integer array inside the hard cap, but only the room knows the round's
  // dimensions and palette — and this grid is broadcast verbatim to everyone in the
  // `gallery` message, so a wrong length or an out-of-range index would reach every
  // other player's renderer.
  const cfg = state.config
  if (!cfg || msg.grid.length !== cfg.gridW * cfg.gridH)
    return
  // -1 is "unpainted", which is why this floor is -1 and not 0 — unlike
  // `targetGrid`, a player's grid legitimately has holes.
  if (msg.grid.some(cell => cell < -1 || cell >= cfg.palette.length))
    return

  // submissionId === clientId — the vote self-check in `handleVote` relies on this.
  // `doneDrawing` is deliberately NOT set here: submission is automatic, and the
  // flag is a social signal driven only by the player clicking "I'm done".
  state.submissions.set(player.clientId, msg.grid)

  // Sticky, and only ever set — never cleared here. Clearing the canvas sends an
  // all-`-1` grid through this same path, so unsetting on a blank submission would
  // drop the player from the gallery for having wiped work they did do. The only
  // reset is at round start.
  if (!player.drewThisRound && msg.grid.some(cell => cell !== -1))
    player.drewThisRound = true
}
