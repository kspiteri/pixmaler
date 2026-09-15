// Connection lifecycle: join, reconnect, rename, shape, close (#19). Most of
// `handleJoin`'s rules exist because a reconnect is not a new player — partysocket
// reconnects unprompted, so anything re-applied here fires on every network blip.

import type { ClientMsg, ServerMsg } from '../src/lib/protocol'
import type { RoomConn, RoomCtx } from './ctx'
import type { RoomPlayer } from './state'
import { isRoomCode, wordPair } from '../src/lib/content/words'
import { clampName, MAX_PLAYERS, normaliseShape, sanitiseName } from '../src/lib/protocol'
import { autoPromoteGm, buildVoteState } from './state'
import { uniqueName } from './tally'

export function handleJoin(
  ctx: RoomCtx,
  conn: RoomConn,
  msg: Extract<ClientMsg, { type: 'join' }>,
) {
  const { state } = ctx

  // Refuse a genuinely new player past the cap; a reconnect (an existing seat) is always
  // allowed, so a dropped player reclaims their slot even at capacity. Before markOccupied
  // and connMap so a refused socket leaves no trace once the client closes on `room-full`.
  const existing = state.players.get(msg.clientId)
  if (!existing && state.players.size >= MAX_PLAYERS) {
    ctx.send(conn, { type: 'room-full' })
    return
  }

  // A reconnect must prove it owns the seat (#72). clientId is public — broadcast in every
  // `state` — so without this anyone could present a victim's id and reclaim their seat,
  // GM included. The secret is minted on the first join (below) and never broadcast, so a
  // mismatch (wrong, or absent because the client never held it) is refused rather than
  // seated. Before markOccupied/connMap, like the other refusals, so it leaves no trace.
  if (existing && msg.secret !== existing.secret) {
    ctx.send(conn, { type: 'error', message: 'Could not rejoin this room. Try reloading the page.' })
    return
  }

  // An empty room means "no such room". A genuinely new player may only open one with
  // explicit create intent *and* a well-formed code, so a typo or guessed code can't conjure
  // a room. `size === 0` already implies a new player (a reconnect has a seat), and a join to
  // a live room (size > 0) falls through. Before markOccupied/connMap, like the cap refusal,
  // so a refused socket leaves no trace.
  if (state.players.size === 0 && !(msg.create && isRoomCode(ctx.roomName))) {
    ctx.send(conn, { type: 'no-such-room' })
    return
  }

  ctx.markOccupied() // somebody is here — cancel any pending empty-room wipe
  state.connMap.set(conn.id, msg.clientId)
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
        clampName(sanitiseName(msg.name)) || wordPair(),
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
      // Minted here and returned in `session` below; required on every later reconnect (#72).
      secret: crypto.randomUUID(),
    }
    if (isFirst) {
      state.gmClientId = msg.clientId
      state.originalGmClientId = msg.clientId
    }
    state.players.set(msg.clientId, player)
    // Hand the new seat its proof of ownership. Only on mint — a reconnect already holds it,
    // and it never joins a broadcast, so this targeted send is the one time it crosses the wire.
    ctx.send(conn, { type: 'session', secret: player.secret })
  }

  // Re-run promotion on rejoin: `handleClose` can only hand GM to a *connected* player, so a
  // room whose GM dropped last can be left with an offline GM once someone else returns. A
  // no-op when the seated GM is connected (including the reclaim just above).
  autoPromoteGm(state)

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

    // Their own picks and own submission id only, so the vote UI rehydrates and the client can
    // flag its own card — never anyone else's, since tallies and the gallery stay anonymous.
    ctx.send(conn, buildVoteState(state, msg.clientId))
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
  const name = clampName(sanitiseName(msg.name))
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
  // `connMap` is many-to-one: two tabs share a clientId, and a reconnect's `join` can land
  // before the dead socket's close. Only the last conn going takes the player offline.
  for (const id of state.connMap.values()) {
    if (id === clientId)
      return
  }
  player.connected = false
  autoPromoteGm(state)
  ctx.broadcastState()
}
