// GM-only controls.
//
// Part of #19. Every handler here is the same shape — prove the sender is GM, prove
// the phase allows it, then act — and each phase guard is load-bearing rather than
// defensive: a GM with a stale tab open in another window can click a button the
// room has already moved past.

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
  // Both are rewritten: the new GM is the real GM now and should reclaim the role
  // on reconnect, not the previous holder.
  state.gmClientId = target.clientId
  state.originalGmClientId = target.clientId
  ctx.broadcastState()
}

// RESULTS-only, and that guard is load-bearing. The button only exists on the
// results screen, but a GM with a stale RESULTS tab can click it after the room has
// moved on — unguarded, this nulled the `config` they had just chosen in the lobby,
// silently losing their image.
export function handlePlayAgain(ctx: RoomCtx, conn: RoomConn) {
  if (!isGm(ctx.state, conn.id) || ctx.state.phase !== 'RESULTS')
    return
  resetToLobby(ctx)
}

// Abandon a round in flight. DRAWING and VOTING only — from RESULTS the round is
// already over and `gm:playAgain` is the right message.
export function handleCancelRound(ctx: RoomCtx, conn: RoomConn) {
  if (!isGm(ctx.state, conn.id))
    return
  if (ctx.state.phase !== 'DRAWING' && ctx.state.phase !== 'VOTING')
    return
  resetToLobby(ctx)
}

// Ends the session for everyone. LOBBY and RESULTS only — between rounds, where
// "we're done playing" is a real intent. Mid-round the equivalent is
// `gm:cancelRound`, which abandons the round but keeps the room usable; ending a
// session from DRAWING would throw away work and the room in one click.
//
// The teardown is `wipeState` itself: it already broadcasts `session-closed` and
// drops every connection, so a deliberate end and an idle expiry look identical to
// a client, differing only in who caused it.
export function handleEndSession(ctx: RoomCtx, conn: RoomConn) {
  if (!isGm(ctx.state, conn.id))
    return
  if (ctx.state.phase !== 'LOBBY' && ctx.state.phase !== 'RESULTS')
    return
  ctx.wipeState()
}
