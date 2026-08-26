// VOTING-phase handlers (#19). Most guards ignore rather than answer: the UI cannot
// produce the message, so reaching one means drift or tampering, and an `error` reply
// would only confirm to a prober that it got through.

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
  // A spectator watches the reveal but does not judge it, and was never counted in
  // the denominator, so they cannot be waited on.
  if (!voter || voter.spectating || state.phase !== 'VOTING')
    return
  if (!VOTE_CATEGORIES.some(c => c.id === msg.category))
    return
  // submissionId is the submitter's clientId (see handleSubmit).
  if (msg.submissionId === voter.clientId) {
    ctx.send(conn, { type: 'error', message: 'Cannot vote for yourself.' })
    return
  }
  // Without this a stale client could vote for any string: the tally skips an id it
  // does not know, but `votingProgress` counts *keys*, so two junk casts made the
  // sender look fully voted and forced `allVoted` without voting for anyone.
  const target = state.gallery?.find(s => s.submissionId === msg.submissionId)
  if (!target)
    return
  // A wiped canvas is in the gallery so it shows on the reveal, but it carries no
  // drawing to judge. This is what keeps it out of the tally.
  if (target.grid.every(cell => cell === -1))
    return
  // `set` overwrites the previous pick in that category, so voters can change minds.
  state.votes.set(voteKey(voter.clientId, msg.category), msg.submissionId)

  // No auto-end: the GM watches the "X of Y voted" tally and decides. Only the count
  // is broadcast, never the targets, so running tallies cannot sway later voters.
  ctx.broadcastState()
}

export function handleStopVoting(ctx: RoomCtx, conn: RoomConn) {
  if (!isGm(ctx.state, conn.id) || ctx.state.phase !== 'VOTING')
    return
  endVoting(ctx)
}
