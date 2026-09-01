// GM-only controls (#19). Every handler is the same shape — prove the sender is GM,
// prove the phase allows it, then act. The phase guards are load-bearing, not
// defensive: a GM with a stale tab can click a button the room has already moved past.

import type { ClientMsg } from '../src/lib/types'
import type { RoomConn, RoomCtx } from './ctx'
import { resetToLobby } from './phases'
import { isGm } from './state'

export function handleConfigure(
  ctx: RoomCtx,
  conn: RoomConn,
  msg: Extract<ClientMsg, { type: 'gm:configure' }>,
) {
  if (!isGm(ctx.state, conn.id) || ctx.state.phase !== 'LOBBY')
    return
  ctx.state.config = msg
  // Target first, then state: per-connection ordering guarantees a client never sees a
  // config it has no grid for. Re-sent on every configure, so the lobby preview stays live.
  ctx.broadcast({ type: 'target', grid: msg.targetGrid })
  ctx.broadcastState()
}

export function handleTransfer(
  ctx: RoomCtx,
  conn: RoomConn,
  msg: Extract<ClientMsg, { type: 'gm:transfer' }>,
) {
  const { state } = ctx
  if (!isGm(state, conn.id))
    return
  // LOBBY only — mid-game transfers complicate the FSM with no clear payoff.
  // Answered rather than ignored: the GM pressed a real button.
  if (state.phase !== 'LOBBY') {
    ctx.send(conn, { type: 'error', message: 'GM transfer is only allowed in the lobby.' })
    return
  }
  const target = state.players.get(msg.toClientId)
  if (!target || !target.connected) {
    ctx.send(conn, { type: 'error', message: 'Cannot transfer GM: target not present.' })
    return
  }
  if (target.clientId === state.gmClientId)
    return
  // Both rewritten: the new GM should reclaim on reconnect, not the previous holder.
  state.gmClientId = target.clientId
  state.originalGmClientId = target.clientId
  ctx.broadcastState()
}

// RESULTS-only, and load-bearing: unguarded, a stale RESULTS tab nulled the `config`
// the GM had just chosen in the lobby, silently losing their image.
export function handlePlayAgain(ctx: RoomCtx, conn: RoomConn) {
  if (!isGm(ctx.state, conn.id) || ctx.state.phase !== 'RESULTS')
    return
  resetToLobby(ctx)
}

// Abandon a round in flight. DRAWING and VOTING only — from RESULTS the round is over
// and `gm:playAgain` is the right message.
export function handleCancelRound(ctx: RoomCtx, conn: RoomConn) {
  if (!isGm(ctx.state, conn.id))
    return
  if (ctx.state.phase !== 'DRAWING' && ctx.state.phase !== 'VOTING')
    return
  resetToLobby(ctx)
}

// LOBBY and RESULTS only — between rounds, where "we're done" is a real intent.
// Mid-round the equivalent is `gm:cancelRound`, which keeps the room usable.
// `wipeState` is the whole teardown: it broadcasts `session-closed` and drops everyone.
export function handleEndSession(ctx: RoomCtx, conn: RoomConn) {
  if (!isGm(ctx.state, conn.id))
    return
  if (ctx.state.phase !== 'LOBBY' && ctx.state.phase !== 'RESULTS')
    return
  ctx.wipeState()
}
