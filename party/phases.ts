// Phase transitions: LOBBY → DRAWING → VOTING → RESULTS, and the way back.
//
// Part of #19. The ordering inside `endDrawing` is load-bearing rather than
// stylistic — see the comments at each step. Nothing here has been reordered in the
// move; `test/phases.test.ts` pins the two constraints that must survive.

import type { ServerMsg, Submission } from '../src/lib/types'
import type { RoomConn, RoomCtx } from './ctx'
import { isGm } from './state'
import { tallyVotes } from './tally'

export function handleStart(ctx: RoomCtx, conn: RoomConn) {
  const { state } = ctx
  if (!isGm(state, conn.id) || state.phase !== 'LOBBY' || !state.config)
    return

  // At least 2 non-GM connected players, so there are meaningful submissions.
  // Relaxed in local dev so the whole flow can be tested solo; never in production.
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
  state.ranked = null
  // Cleared together, deliberately: a new round makes everyone a competitor again
  // with nothing drawn yet, and keeping all three resets on one line is what stops
  // them drifting apart.
  for (const p of state.players.values()) { p.doneDrawing = false; p.spectating = false; p.drewThisRound = false }

  ctx.broadcast({ type: 'phase', phase: 'DRAWING', deadline })
  // Round-end fires from the DO alarm at `deadline` — survives eviction where a
  // setTimeout would not.
}

// The teardown shared by "Play again" and "Cancel round". Everything a round in
// flight holds is dropped, including the target image: both callers want it gone,
// and cancel especially — the motivating case is the image having rendered broken,
// so the GM must re-pick. `roundSeconds` and `extensions` are reset by `handleStart`
// rather than here, so LOBBY keeps reporting the last round's values until a new one
// is configured.
export function resetToLobby(ctx: RoomCtx) {
  const { state } = ctx
  state.phase = 'LOBBY'
  state.config = null
  state.deadline = null
  state.submissions.clear()
  state.votes.clear()
  state.gallery = null
  state.ranked = null
  for (const p of state.players.values()) { p.doneDrawing = false; p.spectating = false; p.drewThisRound = false }
  ctx.broadcastState()
}

export function endDrawing(ctx: RoomCtx) {
  const { state } = ctx
  if (state.phase !== 'DRAWING')
    return
  const cfg = state.config!

  // Build the gallery once, and **before touching state**. Membership is
  // `drewThisRound`, not grid content: a player who painted and then cleared has an
  // all-`-1` grid at the deadline, and filtering on content dropped them from voting
  // *and* results with no feedback. The flag keeps them in — their card is blank, but
  // it exists. Someone who never touched the canvas has no flag and stays out, so a
  // round nobody drew in produces an empty gallery and skips VOTING below.
  //
  // The ordering is load-bearing. This used to run *after* `phase` moved to VOTING,
  // so anything thrown here left the room mid-mutation: VOTING, holding DRAWING's
  // now-past deadline, with `gallery` unassigned and nothing broadcast. The DO alarm
  // retry then matched the VOTING-expiry branch instead of the DRAWING one and
  // resolved the round off an empty gallery, silently discarding every submission.
  // Computing first means a throw leaves the round untouched and the retry re-enters
  // the same branch.
  const gallery = [...state.submissions.entries()]
    .filter(([clientId]) => state.players.get(clientId)?.drewThisRound)
    .map(([clientId, grid]): Submission => ({ submissionId: clientId, grid }))

  // Set early so `endVoting`'s own phase guard passes on the nobody-drew path below.
  // Nothing is broadcast until we know which way this round resolves.
  state.phase = 'VOTING'
  state.gallery = gallery

  // Nobody drew anything. VOTING would be a phase in which no one can act: no cards
  // to vote on, so `votedCount` can never rise, `allVoted` can never fire, and the
  // GM's End-voting confirm stays armed over an empty screen until the backstop
  // expires. Skip it — RESULTS already resolves a field with no winner in it.
  //
  // Clients see DRAWING → RESULTS directly: the transient VOTING above is never
  // broadcast, so there is no flicker through a phase nobody could use.
  if (state.gallery.length === 0) {
    endVoting(ctx)
    return
  }

  // VOTING gets its own expiry — a backstop for an absent GM, not a game timer.
  // `nextWake` and `onAlarm` distinguish the two timed phases by `state.phase`.
  state.deadline = Date.now() + ctx.votingMs

  ctx.broadcast({
    type: 'gallery',
    submissions: state.gallery,
    palette: cfg.palette,
    gridW: cfg.gridW,
    gridH: cfg.gridH,
  } satisfies ServerMsg)
  ctx.broadcast({ type: 'phase', phase: 'VOTING', deadline: state.deadline })
}

export function endVoting(ctx: RoomCtx) {
  const { state } = ctx
  if (state.phase !== 'VOTING')
    return
  state.phase = 'RESULTS'
  // The VOTING backstop has done its job either way — GM-ended or expired.
  state.deadline = null
  const cfg = state.config!

  // Tallied from the frozen gallery (blanks already filtered out) so a non-drawer
  // cannot appear in results. See `tallyVotes` for why a dropped voter is skipped.
  const ranked = tallyVotes(state.gallery ?? [], state.votes, state.players)

  // `results` BEFORE `phase`, matching the gallery-then-phase order above. The other
  // way round, the client mounts Results against whatever payload it still holds —
  // the previous round's, since nothing else clears it — and only re-renders when
  // the fresh one lands a frame later.
  state.ranked = ranked
  ctx.broadcast({ type: 'results', ranked, palette: cfg.palette, gridW: cfg.gridW, gridH: cfg.gridH })
  ctx.broadcast({ type: 'phase', phase: 'RESULTS', deadline: null })
}
