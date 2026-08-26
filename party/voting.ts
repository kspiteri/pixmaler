// VOTING-phase handlers.
//
// Part of #19. Every guard here is deliberate and most of them are ignore-rather-
// than-answer: the UI cannot produce the message, so reaching them means protocol
// drift or tampering, and an `error` reply would only tell a prober it got through.

import type { ClientMsg } from '../src/lib/types'
import type { RoomConn, RoomCtx } from './ctx'
import { VOTE_CATEGORIES } from '../src/lib/types'
import { endVoting } from './phases'
import { isGm, playerByConn } from './state'
import { voteKey } from './tally'

export function handleVote(
  ctx: RoomCtx,
  conn: RoomConn,
  msg: Extract<ClientMsg, { type: 'vote:cast' }>,
) {
  const { state } = ctx
  const voter = playerByConn(state, conn.id)
  // A spectator watches this round's reveal but does not judge it. Also keeps the
  // voting denominator honest: they were never counted, so they cannot be waited on.
  if (!voter || voter.spectating || state.phase !== 'VOTING')
    return
  if (!VOTE_CATEGORIES.some(c => c.id === msg.category))
    return
  // submissionId is the clientId of the submitter (see handleSubmit).
  if (msg.submissionId === voter.clientId) {
    ctx.send(conn, { type: 'error', message: 'Cannot vote for yourself.' })
    return
  }
  // The target must be in this round's frozen gallery. Without this a crafted or
  // stale client could vote for any string: the tally silently skips an id it does
  // not recognise, but `votingProgress` counts *keys*, so two junk casts made the
  // sender count as fully voted — enough to force `allVoted` and suppress the GM's
  // End-voting confirm without voting for anyone.
  const target = state.gallery?.find(s => s.submissionId === msg.submissionId)
  if (!target)
    return
  // A wiped canvas is shown on the reveal but is not a candidate — it carries no
  // drawing to judge. The gallery includes it (see `endDrawing`), so this is the
  // guard that keeps it out of the tally.
  if (target.grid.every(cell => cell === -1))
    return
  // One vote per voter per category — `set` overwrites the previous pick in that
  // category, so voters can change their mind.
  state.votes.set(voteKey(voter.clientId, msg.category), msg.submissionId)

  // No auto-end: the GM decides when to stop, watching the "X of Y voted" tally.
  // Vote *targets* are never broadcast — only the progress count — so running
  // tallies cannot sway later voters.
  ctx.broadcastState()
}

export function handleStopVoting(ctx: RoomCtx, conn: RoomConn) {
  if (!isGm(ctx.state, conn.id) || ctx.state.phase !== 'VOTING')
    return
  endVoting(ctx)
}
