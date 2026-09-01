// Connection lifecycle: join, reconnect, rename, shape, close (#19). Most of
// `handleJoin`'s rules exist because a reconnect is not a new player — partysocket
// reconnects unprompted, so anything re-applied here fires on every network blip.

import type { ClientMsg, ServerMsg, VoteCategory } from '../src/lib/types'
import type { RoomConn, RoomCtx } from './ctx'
import type { RoomPlayer } from './state'
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
  ctx.markOccupied() // somebody is here — cancel any pending empty-room wipe
  state.connMap.set(conn.id, msg.clientId)

  const existing = state.players.get(msg.clientId)
  if (existing) {
    existing.connected = true
    // Only the lobby may apply a stored shape. `handleShape` refuses mid-game
    // messages, but `storedShape()` is re-read on every socket open, so without this
    // a plain reconnect walked past that lock and repainted a RESULTS chip mid-reveal.
    if (state.phase === 'LOBBY')
      existing.shape = normaliseShape(msg.shape)
    // Reclaims from a caretaker that an auto-promote installed while they were gone.
    if (msg.clientId === state.originalGmClientId)
      state.gmClientId = msg.clientId
  }
  else {
    const isFirst = state.players.size === 0
    const player: RoomPlayer = {
      clientId: msg.clientId,
      // De-duplicated in this branch only: the reconnect branch never re-applies
      // `msg.name`, which is what stops a returning player being suffixed against
      // themselves. An empty name falls back to a random pair, not "".
      name: uniqueName(
        msg.name.trim().slice(0, NAME_MAX_LEN) || wordPair(),
        msg.clientId,
        state.players.values(),
      ),
      isGm: false, // derived in buildState
      connected: true,
      doneDrawing: false,
      drewThisRound: false,
      // A round in flight means they missed it. Only set here, so a reconnect never
      // changes what someone is.
      spectating: state.phase !== 'LOBBY',
      shape: normaliseShape(msg.shape),
    }
    if (isFirst) {
      state.gmClientId = msg.clientId
      state.originalGmClientId = msg.clientId
    }
    state.players.set(msg.clientId, player)
  }

  // The gallery is broadcast once at `endDrawing`, so re-send the frozen copy to a
  // client that needs it to vote.
  if (state.phase === 'VOTING' && state.gallery && state.config) {
    const cfg = state.config
    ctx.send(conn, {
      type: 'gallery',
      submissions: state.gallery,
      palette: cfg.palette,
      gridW: cfg.gridW,
      gridH: cfg.gridH,
    } satisfies ServerMsg)

    // Their OWN picks only, so the vote UI rehydrates — tallies stay hidden.
    const own: Partial<Record<VoteCategory, string>> = {}
    for (const [key, subId] of state.votes.entries()) {
      if (voterOf(key) === msg.clientId)
        own[categoryOf(key)] = subId
    }
    ctx.send(conn, { type: 'vote-state', votes: own })
  }

  // So a reload restores the drawing instead of a blank canvas.
  if (state.phase === 'DRAWING') {
    const own = state.submissions.get(msg.clientId)
    if (own)
      ctx.send(conn, { type: 'draw-state', grid: own })
  }

  // `results` is broadcast exactly once, so without this a rejoining client sits on
  // "counting the damage…" and a rejoining GM cannot restart the room. Replayed from
  // the retained ranking, never recomputed, so two rankings cannot disagree.
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

  // Only the arrival needs the grid; everyone else already has it, which is the whole
  // point of keeping it out of `state` (#35).
  if (state.config)
    ctx.send(conn, { type: 'target', grid: state.config.targetGrid })

  ctx.broadcastState()
}

// LOBBY-only: names are revealed in RESULTS, so locking them keeps the reveal honest.
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

// LOBBY-only for the same reason as `rename`: the chip shows in RESULTS, so a later
// change would rewrite identity after the fact. The picker only exists in the lobby;
// this is the enforcement.
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

// The player stays in the roster with `connected: false`, never removed — that is what
// keeps a seat stable for the room's life and lets a reconnect reclaim the same slot.
export function handleClose(ctx: RoomCtx, connId: string) {
  const { state } = ctx
  const clientId = state.connMap.get(connId)
  state.connMap.delete(connId)
  // `connMap` is the authoritative live count, and the closing conn is already gone.
  if (state.connMap.size === 0)
    ctx.markEmpty()
  const player = clientId ? state.players.get(clientId) : undefined
  if (!player)
    return
  player.connected = false
  autoPromoteGm(state)
  ctx.broadcastState()
}
