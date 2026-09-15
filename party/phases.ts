// Phase transitions: LOBBY → DRAWING → VOTING → RESULTS, and the way back (#19).
// The statement order inside `endDrawing` is load-bearing, not stylistic — payload
// before mutation, phase before delegation. `test/phases.test.ts` pins both.

import type { ServerMsg, Submission } from '../src/lib/protocol'
import type { RoomConn, RoomCtx } from './ctx'
import { buildVoteState, isGm } from './state'
import { tallyVotes } from './tally'

export function handleStart(ctx: RoomCtx, conn: RoomConn) {
  const { state } = ctx
  if (!isGm(state, conn.id) || state.phase !== 'LOBBY' || !state.config)
    return

  // Two non-GM players, so there are meaningful submissions. Relaxed in local dev to
  // test the flow solo; never set in production.
  const nonGmConnected = [...state.players.values()].filter(
    p => p.connected && p.clientId !== state.gmClientId,
  )
  if (!ctx.devMode && nonGmConnected.length < 2) {
    ctx.send(conn, { type: 'error', message: 'Need at least 2 players (plus GM) to start.' })
    return
  }

  const deadline = Date.now() + state.config.drawSeconds * 1000
  state.phase = 'DRAWING'
  state.deadline = deadline
  state.roundSeconds = state.config.drawSeconds
  state.extensions = 0
  state.submissions.clear()
  state.votes.clear()
  state.gallery = null
  state.submissionOwners.clear()
  state.ranked = null
  // All three on one line deliberately — it is what stops them drifting apart.
  for (const p of state.players.values()) { p.doneDrawing = false; p.spectating = false; p.drewThisRound = false }

  // Round-end fires from the DO alarm at `deadline`, which survives eviction.
  ctx.broadcast({ type: 'phase', phase: 'DRAWING', deadline })
}

// Shared by "Play again" and "Cancel round". The target image goes too — cancel's
// motivating case is an image that rendered broken. `roundSeconds` and `extensions`
// are reset by `handleStart`, so LOBBY reports the last round's values until then.
export function resetToLobby(ctx: RoomCtx) {
  const { state } = ctx
  state.phase = 'LOBBY'
  state.config = null
  state.deadline = null
  state.submissions.clear()
  state.votes.clear()
  state.gallery = null
  state.submissionOwners.clear()
  state.ranked = null
  for (const p of state.players.values()) { p.doneDrawing = false; p.spectating = false; p.drewThisRound = false }
  ctx.broadcastState()
}

export function endDrawing(ctx: RoomCtx) {
  const { state } = ctx
  if (state.phase !== 'DRAWING')
    return
  const cfg = state.config!

  // Built BEFORE any mutation: this used to run after `phase` moved to VOTING, so a
  // throw left the room in VOTING with no gallery, and the alarm retry then matched
  // the VOTING branch and discarded every submission.
  // Opaque ids, not the drawer's clientId (#73): the gallery is broadcast to everyone, so a
  // clientId here would map each drawing to a name and defeat the blind vote. The owner is
  // kept server-side in `owners` to resolve self-votes, the reveal and each drawer's own card.
  // Anonymity here is Classic's contract, not the app's: #80 gates wire-identity on the mode's
  // `anonymousJudging`, so identity-aware modes (Puzzle) include the owner on the wire (gallery
  // + vote-state). The opaque ids and owners map stay regardless — self-votes and the reveal
  // need them in every mode; only whether identity reaches the wire is per-mode.
  const owners = new Map<string, string>()
  const gallery = [...state.submissions.entries()]
    // `drewThisRound`, not grid content: a wiped canvas is all `-1` and filtering on
    // content dropped its owner from voting and results with no feedback.
    .filter(([clientId]) => state.players.get(clientId)?.drewThisRound)
    .map(([clientId, grid]): Submission => {
      const submissionId = crypto.randomUUID()
      owners.set(submissionId, clientId)
      return { submissionId, grid }
    })

  // Set before the delegate below, or `endVoting`'s own phase guard rejects it.
  // Nothing is broadcast until we know which way the round resolves.
  state.phase = 'VOTING'
  state.gallery = gallery
  state.submissionOwners = owners

  // Nobody drew: VOTING would be a phase in which no one can act, so skip it. Clients
  // see DRAWING → RESULTS, since the transient VOTING is never broadcast.
  if (state.gallery.length === 0) {
    endVoting(ctx)
    return
  }

  // A backstop for an absent GM, not a game timer. `nextWake` and `alarmAction`
  // distinguish the two timed phases by `state.phase`.
  state.deadline = Date.now() + ctx.votingMs

  ctx.broadcast({
    type: 'gallery',
    submissions: state.gallery,
    palette: cfg.palette,
    gridW: cfg.gridW,
    gridH: cfg.gridH,
  } satisfies ServerMsg)
  // Hand each connected client its own opaque submission id (and any picks), so it can flag
  // its own card without any client learning another's. Per-recipient, unlike the gallery
  // above, and before the phase flip so the view mounts with it in hand.
  ctx.sendEach(clientId => buildVoteState(state, clientId))
  ctx.broadcast({ type: 'phase', phase: 'VOTING', deadline: state.deadline })
}

export function endVoting(ctx: RoomCtx) {
  const { state } = ctx
  if (state.phase !== 'VOTING')
    return
  state.phase = 'RESULTS'
  state.deadline = null
  const cfg = state.config!

  const ranked = tallyVotes(state.gallery ?? [], state.votes, state.players, state.submissionOwners)

  // `results` before `phase`: the other way round, Results mounts against the payload
  // the client still holds — the previous round's — and flashes last round's winner.
  state.ranked = ranked
  ctx.broadcast({ type: 'results', ranked, palette: cfg.palette, gridW: cfg.gridW, gridH: cfg.gridH })
  ctx.broadcast({ type: 'phase', phase: 'RESULTS', deadline: null })
}
