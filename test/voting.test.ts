// VOTING handlers, driven through a fake `RoomCtx`.
//
// This is what the ctx seam buys: the guards that stop a crafted client from
// rigging a round are exercised without a Durable Object, a socket, or a browser.
// Written before the rest of #19 moves handlers, so they lock current behaviour.

import type { RoomState } from '../party/state'
import type { GmConfigureMsg, Player, Submission } from '../src/lib/types'
import { describe, expect, it } from 'vitest'
import { voteKey } from '../party/tally'
import { handleStopVoting, handleVote } from '../party/voting'
import { player, harness as room } from './support/room'

// Every case here starts in VOTING with a frozen gallery.
function harness(players: Player[], gallery: Submission[], over: Partial<RoomState> = {}) {
  return room(players, { phase: 'VOTING', gallery, ...over })
}

// `endVoting` reads the config for the results payload's palette and dimensions.
const config = {
  type: 'gm:configure',
  gridW: 1,
  gridH: 3,
  palette: ['#000000', '#ffffff', '#ff0000', '#00ff00'],
  targetGrid: [0, 1, 2],
  drawSeconds: 60,
} satisfies GmConfigureMsg

const drawing: Submission = { submissionId: 'artist', grid: [1, 2, 3] }
const blank: Submission = { submissionId: 'wiper', grid: [-1, -1, -1] }

function cast(submissionId: string, category: 'funniest' | 'best' = 'best') {
  return { type: 'vote:cast', category, submissionId } as const
}

describe('handleVote', () => {
  it('records a valid vote and broadcasts the new tally', () => {
    const h = harness([player('voter'), player('artist')], [drawing])
    handleVote(h.ctx, h.conn('conn-voter'), cast('artist'))
    expect([...h.state.votes.entries()]).toEqual([[voteKey('voter', 'best'), 'artist']])
    expect(h.broadcasts).toHaveLength(1)
  })

  it('keeps one vote per category, so a voter can change their mind', () => {
    const h = harness([player('voter'), player('artist'), player('other')], [
      drawing,
      { submissionId: 'other', grid: [4] },
    ])
    handleVote(h.ctx, h.conn('conn-voter'), cast('artist'))
    handleVote(h.ctx, h.conn('conn-voter'), cast('other'))
    expect(h.state.votes.get(voteKey('voter', 'best'))).toBe('other')
    expect(h.state.votes.size).toBe(1)
  })

  it('keeps categories independent', () => {
    const h = harness([player('voter'), player('artist')], [drawing])
    handleVote(h.ctx, h.conn('conn-voter'), cast('artist', 'best'))
    handleVote(h.ctx, h.conn('conn-voter'), cast('artist', 'funniest'))
    expect(h.state.votes.size).toBe(2)
  })

  it('answers a self-vote with an error and records nothing', () => {
    const h = harness([player('artist')], [drawing])
    handleVote(h.ctx, h.conn('conn-artist'), cast('artist'))
    expect(h.state.votes.size).toBe(0)
    expect(h.sent).toEqual([{ connId: 'conn-artist', msg: { type: 'error', message: 'Cannot vote for yourself.' } }])
  })

  it('ignores a vote outside VOTING', () => {
    for (const phase of ['LOBBY', 'DRAWING', 'RESULTS'] as const) {
      const h = harness([player('voter'), player('artist')], [drawing], { phase })
      handleVote(h.ctx, h.conn('conn-voter'), cast('artist'))
      expect(h.state.votes.size).toBe(0)
    }
  })

  it('ignores a spectator, keeping the denominator honest', () => {
    const h = harness([player('late', { spectating: true }), player('artist')], [drawing])
    handleVote(h.ctx, h.conn('conn-late'), cast('artist'))
    expect(h.state.votes.size).toBe(0)
  })

  it('ignores an unidentified connection', () => {
    const h = harness([player('artist')], [drawing])
    handleVote(h.ctx, h.conn('conn-nobody'), cast('artist'))
    expect(h.state.votes.size).toBe(0)
  })

  it('ignores an unknown category', () => {
    const h = harness([player('voter'), player('artist')], [drawing])
    handleVote(h.ctx, h.conn('conn-voter'), { type: 'vote:cast', category: 'prettiest' as 'best', submissionId: 'artist' })
    expect(h.state.votes.size).toBe(0)
  })

  it('ignores a target outside this round\'s gallery', () => {
    // The guard that matters most: `votingProgress` counts KEYS, so two junk casts
    // would otherwise make the sender count as fully voted and force `allVoted`,
    // suppressing the GM's End-voting confirm without voting for anyone.
    const h = harness([player('voter'), player('artist')], [drawing])
    handleVote(h.ctx, h.conn('conn-voter'), cast('ghost', 'best'))
    handleVote(h.ctx, h.conn('conn-voter'), cast('ghost', 'funniest'))
    expect(h.state.votes.size).toBe(0)
    expect(h.broadcasts).toHaveLength(0)
  })

  it('ignores a blank card, which is shown but not a candidate', () => {
    const h = harness([player('voter'), player('wiper')], [blank])
    handleVote(h.ctx, h.conn('conn-voter'), cast('wiper'))
    expect(h.state.votes.size).toBe(0)
  })

  it('still accepts a real drawing when a blank card sits beside it', () => {
    const h = harness([player('voter'), player('artist'), player('wiper')], [blank, drawing])
    handleVote(h.ctx, h.conn('conn-voter'), cast('artist'))
    expect(h.state.votes.size).toBe(1)
  })

  it('ignores every vote when there is no gallery at all', () => {
    const h = harness([player('voter'), player('artist')], [], { gallery: null })
    handleVote(h.ctx, h.conn('conn-voter'), cast('artist'))
    expect(h.state.votes.size).toBe(0)
  })

  it('broadcasts vote counts but never vote targets', () => {
    // Running tallies must not reach other clients, or they sway later voters.
    // Asserted on the snapshot's shape rather than by searching for a name: a
    // clientId legitimately appears in the roster, so a substring check passes or
    // fails for the wrong reason.
    const h = harness([player('voter'), player('artist')], [drawing])
    handleVote(h.ctx, h.conn('conn-voter'), cast('artist'))
    const snap = h.broadcasts.at(-1)!
    expect(snap).toMatchObject({ type: 'state', votedCount: 0, totalVoters: 2 })
    // No vote map, and no gallery to correlate one against.
    expect(Object.keys(snap)).not.toContain('votes')
    expect(Object.keys(snap)).not.toContain('gallery')
  })
})

describe('handleStopVoting', () => {
  it('lets the GM resolve the round into RESULTS', () => {
    // `endVoting` is the real function, so this asserts the transition rather than
    // that a stub was called.
    const h = harness([player('gm'), player('artist')], [drawing], { gmClientId: 'gm', config })
    handleStopVoting(h.ctx, h.conn('conn-gm'))
    expect(h.state.phase).toBe('RESULTS')
    expect(h.state.ranked?.map(r => r.submissionId)).toEqual(['artist'])
  })

  it('refuses a non-GM', () => {
    const h = harness([player('gm'), player('rando')], [drawing], { gmClientId: 'gm', config })
    handleStopVoting(h.ctx, h.conn('conn-rando'))
    expect(h.state.phase).toBe('VOTING')
  })

  it('refuses outside VOTING', () => {
    for (const phase of ['LOBBY', 'DRAWING', 'RESULTS'] as const) {
      const h = harness([player('gm')], [drawing], { gmClientId: 'gm', phase, config })
      handleStopVoting(h.ctx, h.conn('conn-gm'))
      expect(h.state.phase).toBe(phase)
    }
  })

  it('refuses an unidentified connection while the role is vacant', () => {
    // `connMap.get` yields undefined for an unknown conn, which must not match `''`.
    const h = harness([player('a')], [drawing], { gmClientId: '', config })
    handleStopVoting(h.ctx, h.conn('conn-nobody'))
    expect(h.state.phase).toBe('VOTING')
  })
})
