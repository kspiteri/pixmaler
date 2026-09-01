// Characterisation tests for the room's derived state — written to lock current
// behaviour before the rest of #19 moves handlers around, so "zero behaviour
// change" is checked rather than intended.
//
// Two invariants here are called out in the issue as easy to break by accident:
// `isGm` is derived at broadcast time so it cannot drift from `gmClientId`, and
// spectators are excluded from both progress readouts so a mid-round arrival
// cannot make a count go backwards or un-fire `allVoted`.

import type { RoomPlayer, RoomState } from '../party/state'
import type { GmConfigureMsg } from '../src/lib/types'
import { describe, expect, it } from 'vitest'
import { buildState, drawProgress, freshRoomState, MAX_EXTENSIONS, votingProgress } from '../party/state'
import { voteKey } from '../party/tally'

const config = {
  type: 'gm:configure',
  gridW: 2,
  gridH: 2,
  palette: ['#000000', '#ffffff'],
  targetGrid: [0, 1, 1, 0],
  drawSeconds: 60,
} satisfies GmConfigureMsg

function player(clientId: string, over: Partial<RoomPlayer> = {}): RoomPlayer {
  return {
    clientId,
    name: clientId,
    isGm: false,
    connected: true,
    doneDrawing: false,
    drewThisRound: false,
    spectating: false,
    shape: 'rounded',
    ...over,
  }
}

function room(players: RoomPlayer[] = [], over: Partial<RoomState> = {}) {
  const state = freshRoomState()
  for (const p of players) state.players.set(p.clientId, p)
  return Object.assign(state, over)
}

describe('freshRoomState', () => {
  it('starts in LOBBY with nothing held from a previous round', () => {
    const s = freshRoomState()
    expect(s.phase).toBe('LOBBY')
    expect(s.config).toBeNull()
    expect(s.deadline).toBeNull()
    expect(s.gallery).toBeNull()
    expect(s.ranked).toBeNull()
    expect(s.extensions).toBe(0)
    expect([...s.players.keys()]).toEqual([])
    expect([...s.votes.keys()]).toEqual([])
    expect([...s.submissions.keys()]).toEqual([])
  })

  it('hands back independent collections each call', () => {
    // `wipeState` assigns a fresh one; a shared Map would leak the wiped room.
    const a = freshRoomState()
    a.players.set('x', player('x'))
    expect(freshRoomState().players.size).toBe(0)
  })
})

describe('drawProgress', () => {
  it('counts done out of present', () => {
    const s = room([
      player('a', { doneDrawing: true }),
      player('b', { doneDrawing: true }),
      player('c'),
    ])
    expect(drawProgress(s)).toEqual({ doneCount: 2, totalDrawing: 3 })
  })

  it('excludes disconnected players from both halves', () => {
    // A player who flags done and then drops must leave both counts, or the
    // numerator can exceed the denominator.
    const s = room([
      player('a', { doneDrawing: true }),
      player('gone', { doneDrawing: true, connected: false }),
    ])
    expect(drawProgress(s)).toEqual({ doneCount: 1, totalDrawing: 1 })
  })

  it('excludes spectators, so a mid-round arrival cannot move the count', () => {
    const before = room([player('a', { doneDrawing: true }), player('b')])
    const after = room([
      player('a', { doneDrawing: true }),
      player('b'),
      player('late', { spectating: true }),
    ])
    expect(drawProgress(after)).toEqual(drawProgress(before))
  })

  it('never reports more done than present', () => {
    const s = room([
      player('a', { doneDrawing: true }),
      player('b', { doneDrawing: true, connected: false }),
      player('c', { doneDrawing: true, spectating: true }),
    ])
    const { doneCount, totalDrawing } = drawProgress(s)
    expect(doneCount).toBeLessThanOrEqual(totalDrawing)
  })

  it('reports zero of zero for an empty room', () => {
    expect(drawProgress(room())).toEqual({ doneCount: 0, totalDrawing: 0 })
  })
})

describe('votingProgress', () => {
  // A voter counts as finished only once they have voted in EVERY category.
  function withVotes(players: RoomPlayer[], votes: [string, string, 'funniest' | 'best'][]) {
    const s = room(players)
    for (const [voter, sub, cat] of votes) s.votes.set(voteKey(voter, cat), sub)
    return s
  }

  it('counts only voters who have completed every category', () => {
    const s = withVotes([player('a'), player('b')], [
      ['a', 's1', 'funniest'],
      ['a', 's1', 'best'],
      ['b', 's1', 'funniest'],
    ])
    expect(votingProgress(s)).toEqual({ votedCount: 1, totalVoters: 2 })
  })

  it('reaches everyone once every category is cast', () => {
    const s = withVotes([player('a'), player('b')], [
      ['a', 's1', 'funniest'],
      ['a', 's1', 'best'],
      ['b', 's2', 'funniest'],
      ['b', 's2', 'best'],
    ])
    expect(votingProgress(s)).toEqual({ votedCount: 2, totalVoters: 2 })
  })

  it('excludes spectators, so allVoted cannot un-fire', () => {
    // This is why a latching GM notification is possible at all: a late arrival
    // must not push totalVoters above votedCount after everyone has voted.
    const votes: [string, string, 'funniest' | 'best'][] = [
      ['a', 's1', 'funniest'],
      ['a', 's1', 'best'],
    ]
    const complete = withVotes([player('a')], votes)
    expect(votingProgress(complete)).toEqual({ votedCount: 1, totalVoters: 1 })
    const joined = withVotes([player('a'), player('late', { spectating: true })], votes)
    expect(votingProgress(joined)).toEqual({ votedCount: 1, totalVoters: 1 })
  })

  it('drops a disconnected voter from both halves', () => {
    const s = withVotes([player('a'), player('gone', { connected: false })], [
      ['a', 's1', 'funniest'],
      ['a', 's1', 'best'],
      ['gone', 's1', 'funniest'],
      ['gone', 's1', 'best'],
    ])
    expect(votingProgress(s)).toEqual({ votedCount: 1, totalVoters: 1 })
  })

  it('ignores votes from someone not in the room', () => {
    const s = withVotes([player('a')], [['ghost', 's1', 'funniest'], ['ghost', 's1', 'best']])
    expect(votingProgress(s)).toEqual({ votedCount: 0, totalVoters: 1 })
  })
})

describe('buildState', () => {
  it('derives isGm from gmClientId rather than trusting the stored flag', () => {
    // The invariant #19 asks to preserve. Both players carry a WRONG isGm here;
    // the broadcast must correct them from gmClientId.
    const s = room(
      [player('a', { isGm: false }), player('b', { isGm: true })],
      { gmClientId: 'a' },
    )
    const byId = new Map(buildState(s).players.map(p => [p.clientId, p.isGm]))
    expect(byId.get('a')).toBe(true)
    expect(byId.get('b')).toBe(false)
  })

  it('never ships `drewThisRound`, which is server-only bookkeeping', () => {
    // #27: it is set by `handleSubmit` without a broadcast, so on the wire it was stale
    // from the last stroke until somebody voted. `endDrawing` is its only reader.
    const s = room([player('a', { drewThisRound: true }), player('b')])
    for (const p of buildState(s).players)
      expect(p).not.toHaveProperty('drewThisRound')
  })

  it('never ships the target grid, which cannot change mid-round', () => {
    // #35: re-sending it on every vote and join was 92% of a `state` message. It travels
    // once in a `target` message instead.
    const s = room([player('a')], { config })
    const out = buildState(s).config
    expect(out).not.toHaveProperty('targetGrid')
    expect(out).not.toHaveProperty('type')
  })

  it('still ships the settings a client needs on every update', () => {
    const s = room([player('a')], { config })
    expect(buildState(s).config).toEqual({
      gridW: config.gridW,
      gridH: config.gridH,
      palette: config.palette,
      drawSeconds: config.drawSeconds,
    })
  })

  it('reports no config once the room leaves a round behind', () => {
    // The client keys its held grid off this: `config: null` clears it.
    expect(buildState(room([player('a')])).config).toBeNull()
  })

  it('marks nobody as GM when the role is vacant', () => {
    const s = room([player('a', { isGm: true })], { gmClientId: '' })
    expect(buildState(s).players.every(p => !p.isGm)).toBe(true)
  })

  it('emits players in insertion order, which is what makes a seat stable', () => {
    // Seats are derived from array index (see src/lib/seats.ts), so sorting here would
    // re-seat everyone below a moved row. Names are deliberately anti-alphabetical: with
    // ascending ones a sort would be a no-op and this would pass against its own bug.
    const s = room([player('zeta'), player('alpha'), player('mid')])
    expect(buildState(s).players.map(p => p.clientId)).toEqual(['zeta', 'alpha', 'mid'])
  })

  it('carries the phase, deadline and round length through unchanged', () => {
    const s = room([], { phase: 'DRAWING', deadline: 1234, roundSeconds: 120 })
    expect(buildState(s)).toMatchObject({ type: 'state', phase: 'DRAWING', deadline: 1234, roundSeconds: 120 })
  })

  it('reports remaining extensions, floored at zero', () => {
    expect(buildState(room()).extensionsLeft).toBe(MAX_EXTENSIONS)
    expect(buildState(room([], { extensions: 1 })).extensionsLeft).toBe(MAX_EXTENSIONS - 1)
    expect(buildState(room([], { extensions: MAX_EXTENSIONS })).extensionsLeft).toBe(0)
    // Never negative, however the counter got there.
    expect(buildState(room([], { extensions: 99 })).extensionsLeft).toBe(0)
  })

  it('folds both progress readouts into the snapshot', () => {
    const s = room([player('a', { doneDrawing: true }), player('b')])
    expect(buildState(s)).toMatchObject({ doneCount: 1, totalDrawing: 2, votedCount: 0, totalVoters: 2 })
  })

  it('does not mutate the state it reads', () => {
    const s = room([player('a', { isGm: false })], { gmClientId: 'a' })
    buildState(s)
    expect(s.players.get('a')!.isGm).toBe(false)
  })
})
