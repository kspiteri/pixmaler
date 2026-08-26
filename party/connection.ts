// Connection lifecycle: join, reconnect, rename, shape, close.
//
// Part of #19. `handleJoin` carries the reconnect rules, and most of them exist
// because a reconnect is not a new player: partysocket reconnects unprompted, so
// anything re-applied here fires on every network blip.

import type { ClientMsg, Player, ServerMsg, VoteCategory } from '../src/lib/types'
import type { RoomConn, RoomCtx } from './ctx'
import { normaliseShape } from '../src/lib/types'
import { wordPair } from '../src/lib/words'
import { autoPromoteGm } from './state'
import { categoryOf, NAME_MAX_LEN, uniqueName, voterOf } from './tally'

export function handleJoin(
  ctx: RoomCtx,
  conn: RoomConn,
  msg: Extract<ClientMsg, { type: 'join' }>,
) {
  const { state } = ctx
  // Someone's here — cancel any pending empty-room wipe.
  ctx.markOccupied()
  state.connMap.set(conn.id, msg.clientId)

  const existing = state.players.get(msg.clientId)
  if (existing) {
    existing.connected = true
    // The client's localStorage is the source of truth for its own shape, but
    // **only the lobby may apply it.** Past LOBBY the shape is locked exactly like
    // `name`, which this branch deliberately does not re-apply either — without
    // this guard the lock had only one of its two halves: `handleShape` refuses
    // mid-game messages, but a plain reconnect walked straight past it, because
    // `storedShape()` is re-read on every socket `open`. Two tabs and a reload were
    // enough to repaint a RESULTS chip mid-reveal.
    //
    // Skipping the assignment (rather than defaulting) also stops a reconnect that
    // carries no shape — an older bundle, or localStorage evicted by the browser —
    // from silently resetting a chosen shape to `rounded` mid-game.
    if (state.phase === 'LOBBY')
      existing.shape = normaliseShape(msg.shape)
    // The original GM reclaims the role on reconnect, even if an auto-promote gave
    // it to someone else while they were gone.
    if (msg.clientId === state.originalGmClientId)
      state.gmClientId = msg.clientId
  }
  else {
    const isFirst = state.players.size === 0
    const player: Player = {
      clientId: msg.clientId,
      // De-duplicated in the NEW-player branch only — the reconnect branch above
      // never re-applies `msg.name`, which is what keeps a returning player from
      // being suffixed against themselves. An empty name falls back to a random
      // pair, matching the client's name gate rather than storing "".
      name: uniqueName(
        msg.name.trim().slice(0, NAME_MAX_LEN) || wordPair(),
        msg.clientId,
        state.players.values(),
      ),
      // Derived in buildState; the per-player flag here is intentionally unused.
      isGm: false,
      connected: true,
      doneDrawing: false,
      drewThisRound: false,
      // A round already in flight means they missed it. Only reachable in this
      // branch, so a reconnect never changes what someone is.
      spectating: state.phase !== 'LOBBY',
      shape: normaliseShape(msg.shape),
    }
    if (isFirst) {
      state.gmClientId = msg.clientId
      state.originalGmClientId = msg.clientId
    }
    state.players.set(msg.clientId, player)
  }

  // Rejoining mid-VOTING needs the gallery to vote — it is broadcast once at
  // `endDrawing`, so re-send the frozen copy to this client alone.
  if (state.phase === 'VOTING' && state.gallery && state.config) {
    const cfg = state.config
    ctx.send(conn, {
      type: 'gallery',
      submissions: state.gallery,
      palette: cfg.palette,
      gridW: cfg.gridW,
      gridH: cfg.gridH,
    } satisfies ServerMsg)

    // Echo back this voter's OWN picks so the client rehydrates its vote UI. Only
    // their votes — never anyone else's, since tallies stay hidden until RESULTS.
    const own: Partial<Record<VoteCategory, string>> = {}
    for (const [key, subId] of state.votes.entries()) {
      if (voterOf(key) === msg.clientId)
        own[categoryOf(key)] = subId
    }
    ctx.send(conn, { type: 'vote-state', votes: own })
  }

  // Rejoining mid-DRAWING gets their own latest auto-submitted grid back, so a
  // reload restores the drawing instead of a blank canvas.
  if (state.phase === 'DRAWING') {
    const own = state.submissions.get(msg.clientId)
    if (own)
      ctx.send(conn, { type: 'draw-state', grid: own })
  }

  // Joining or reloading mid-RESULTS gets the reveal re-sent. Unlike `gallery`,
  // `results` is broadcast exactly once, so without this a rejoining client sits on
  // "counting the damage…" indefinitely — and a rejoining GM has no usable control
  // at all, leaving the room unrestartable. Replayed from the retained ranking
  // rather than recomputed, so two rankings can never disagree.
  if (state.phase === 'RESULTS' && state.ranked && state.config) {
    const cfg = state.config
    ctx.send(conn, {
      type: 'results',
      ranked: state.ranked,
      palette: cfg.palette,
      gridW: cfg.gridW,
      gridH: cfg.gridH,
    } satisfies ServerMsg)
  }

  ctx.broadcastState()
}

// Renaming is only meaningful before the game starts; names are revealed in
// RESULTS, so locking them at LOBBY keeps the reveal honest.
export function handleRename(
  ctx: RoomCtx,
  conn: RoomConn,
  msg: Extract<ClientMsg, { type: 'rename' }>,
) {
  const { state } = ctx
  if (state.phase !== 'LOBBY')
    return
  const clientId = state.connMap.get(conn.id)
  const player = clientId ? state.players.get(clientId) : undefined
  if (!clientId || !player)
    return
  const name = msg.name.trim().slice(0, NAME_MAX_LEN)
  if (!name)
    return
  player.name = uniqueName(name, clientId, state.players.values())
  ctx.broadcastState()
}

// LOBBY-only for the same reason as `rename`: the chip is shown in RESULTS, so a
// shape change after the drawings are in would rewrite identity after the fact. The
// picker only exists in the lobby UI; this is the enforcement.
export function handleShape(
  ctx: RoomCtx,
  conn: RoomConn,
  msg: Extract<ClientMsg, { type: 'shape' }>,
) {
  const { state } = ctx
  if (state.phase !== 'LOBBY')
    return
  const clientId = state.connMap.get(conn.id)
  const player = clientId ? state.players.get(clientId) : undefined
  if (!player)
    return
  player.shape = normaliseShape(msg.shape)
  ctx.broadcastState()
}

// A dropped connection. The player is kept in the roster with `connected: false` —
// never removed — which is what makes a seat stable for the room's whole life and
// lets a reconnect reclaim the same slot.
export function handleClose(ctx: RoomCtx, connId: string) {
  const { state } = ctx
  const clientId = state.connMap.get(connId)
  state.connMap.delete(connId)
  // `connMap` is the authoritative live-connection count, and the closing
  // connection is already gone from it.
  if (state.connMap.size === 0)
    ctx.markEmpty()
  const player = clientId ? state.players.get(clientId) : undefined
  if (!player)
    return
  player.connected = false
  autoPromoteGm(state)
  ctx.broadcastState()
}
