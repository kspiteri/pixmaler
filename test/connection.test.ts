// Connection lifecycle. The reconnect rules are the substance here: partysocket
// reconnects unprompted, so anything `handleJoin` re-applies fires on every network
// blip — which is how a phone waking a suspended tab used to repaint its own avatar
// mid-reveal, and how a flaky connection could ratchet a name forever.

import type { RoomPlayer, RoomState } from '../party/state'
import type { ClientMsg, GalleryMsg, GmConfigureMsg, ResultsMsg } from '../src/lib/types'
import { describe, expect, it } from 'vitest'
import { handleClose, handleJoin, handleRename, handleShape } from '../party/connection'
import { voteKey } from '../party/tally'
import { player, harness as room } from './support/room'

const config = {
  type: 'gm:configure',
  gridW: 2,
  gridH: 2,
  palette: ['#000000', '#ffffff'],
  targetGrid: [0, 1, 1, 0],
  drawSeconds: 60,
} satisfies GmConfigureMsg

// `shape` is widened to string on purpose: `parseClientMsg` already normalises it,
// so an invalid one is unreachable through the real path — `handleJoin` normalising
// again is defence in depth, and these tests are what keep it honest.
function join(clientId: string, over: { name?: string, shape?: string } = {}) {
  return {
    type: 'join',
    clientId,
    name: over.name ?? clientId,
    shape: over.shape ?? 'circle',
  } as Extract<ClientMsg, { type: 'join' }>
}

// A room where `seated` are already present and connected via `conn-<clientId>`.
function harness(seated: RoomPlayer[] = [], over: Partial<RoomState> = {}) {
  return room(seated, over)
}

describe('handleJoin — new player', () => {
  it('seats the first joiner as GM and reclaim target', () => {
    const h = harness()
    handleJoin(h.ctx, h.conn('c1'), join('a'))
    expect(h.state.players.get('a')).toMatchObject({ clientId: 'a', connected: true, isGm: false })
    expect(h.state.gmClientId).toBe('a')
    expect(h.state.originalGmClientId).toBe('a')
    expect(h.state.connMap.get('c1')).toBe('a')
    expect(h.stateBroadcasts()).toBe(1)
  })

  it('does not make later joiners GM', () => {
    const h = harness([player('a')], { gmClientId: 'a', originalGmClientId: 'a' })
    handleJoin(h.ctx, h.conn('c2'), join('b'))
    expect(h.state.gmClientId).toBe('a')
  })

  it('de-duplicates a name already in the room', () => {
    const h = harness([player('a', { name: 'keith' })])
    handleJoin(h.ctx, h.conn('c2'), join('b', { name: 'keith' }))
    expect(h.state.players.get('b')!.name).not.toBe('keith')
  })

  it('falls back to a random name rather than storing an empty one', () => {
    const h = harness()
    handleJoin(h.ctx, h.conn('c1'), join('a', { name: '   ' }))
    expect(h.state.players.get('a')!.name.length).toBeGreaterThan(0)
  })

  it('caps the stored name', () => {
    const h = harness()
    handleJoin(h.ctx, h.conn('c1'), join('a', { name: 'x'.repeat(80) }))
    expect(h.state.players.get('a')!.name.length).toBeLessThanOrEqual(24)
  })

  it('normalises an unknown shape', () => {
    const h = harness()
    handleJoin(h.ctx, h.conn('c1'), join('a', { shape: 'triangle' }))
    expect(h.state.players.get('a')!.shape).toBe('rounded')
  })

  it('marks a mid-round arrival as a spectator', () => {
    for (const phase of ['DRAWING', 'VOTING', 'RESULTS'] as const) {
      const h = harness([], { phase })
      handleJoin(h.ctx, h.conn('c1'), join('late'))
      expect(h.state.players.get('late')!.spectating).toBe(true)
    }
  })

  it('does not make a lobby joiner a spectator', () => {
    const h = harness()
    handleJoin(h.ctx, h.conn('c1'), join('a'))
    expect(h.state.players.get('a')!.spectating).toBe(false)
  })

  it('cancels a pending empty-room wipe', () => {
    const h = harness()
    handleClose(h.ctx, 'gone') // nothing connected -> grace clock starts
    expect(h.emptySince()).not.toBeNull()
    handleJoin(h.ctx, h.conn('c1'), join('a'))
    expect(h.emptySince()).toBeNull()
  })
})

describe('handleJoin — reconnect', () => {
  it('reclaims the same slot rather than seating a duplicate', () => {
    const h = harness([player('a', { name: 'keith', connected: false })])
    handleJoin(h.ctx, h.conn('c-new'), join('a', { name: 'keith' }))
    expect(h.state.players.size).toBe(1)
    expect(h.state.players.get('a')!.connected).toBe(true)
  })

  it('never re-applies the name, so a blip cannot ratchet it', () => {
    // partysocket reconnects unprompted, so a re-applied name decorates on every
    // network blip: `keith` → `feral-keith` → `crusty-feral-keith`.
    //
    // A second holder of the same name is what makes the omission observable —
    // `uniqueName` excludes the reconnecting player's own id, so alone they would
    // survive a re-apply untouched and this would pass either way. Both write paths
    // de-duplicate, so the collision is constructed: the guard is defence in depth,
    // and this is what keeps it honest.
    const h = harness([
      player('a', { name: 'keith', connected: false }),
      player('b', { name: 'keith' }),
    ])
    for (let i = 0; i < 5; i++)
      handleJoin(h.ctx, h.conn('c-new'), join('a', { name: 'keith' }))
    expect(h.state.players.get('a')!.name).toBe('keith')
  })

  it('applies a shape change on a lobby reconnect', () => {
    const h = harness([player('a', { shape: 'circle', connected: false })])
    handleJoin(h.ctx, h.conn('c-new'), join('a', { shape: 'leaf' }))
    expect(h.state.players.get('a')!.shape).toBe('leaf')
  })

  it('locks the shape past LOBBY, even on a reconnect', () => {
    // The half of the lock that `handleShape` cannot provide: `storedShape()` is
    // re-read on every socket open, so a reconnect walked straight past it.
    for (const phase of ['DRAWING', 'VOTING', 'RESULTS'] as const) {
      const h = harness([player('a', { shape: 'circle', connected: false })], { phase })
      handleJoin(h.ctx, h.conn('c-new'), join('a', { shape: 'leaf' }))
      expect(h.state.players.get('a')!.shape).toBe('circle')
    }
  })

  it('does not reset a shape when the reconnect carries none', () => {
    const h = harness([player('a', { shape: 'leaf', connected: false })], { phase: 'DRAWING' })
    handleJoin(h.ctx, h.conn('c-new'), { type: 'join', clientId: 'a', name: 'a', shape: 'rounded' })
    expect(h.state.players.get('a')!.shape).toBe('leaf')
  })

  it('lets the original GM reclaim the role from a caretaker', () => {
    const h = harness([
      player('gm', { connected: false }),
      player('caretaker'),
    ], { gmClientId: 'caretaker', originalGmClientId: 'gm' })
    handleJoin(h.ctx, h.conn('c-gm'), join('gm'))
    expect(h.state.gmClientId).toBe('gm')
  })

  it('does not hand the role to a returning non-original player', () => {
    const h = harness([player('gm'), player('other', { connected: false })], {
      gmClientId: 'gm',
      originalGmClientId: 'gm',
    })
    handleJoin(h.ctx, h.conn('c-other'), join('other'))
    expect(h.state.gmClientId).toBe('gm')
  })

  it('does not change whether a player is a spectator', () => {
    const h = harness([player('late', { spectating: true, connected: false })], { phase: 'DRAWING' })
    handleJoin(h.ctx, h.conn('c-new'), join('late'))
    expect(h.state.players.get('late')!.spectating).toBe(true)
  })
})

describe('handleJoin — targeted re-sends', () => {
  it('re-sends the frozen gallery and the joiner\'s own votes mid-VOTING', () => {
    const h = harness([player('v'), player('a'), player('b')], {
      phase: 'VOTING',
      config,
      gallery: [{ submissionId: 'a', grid: [0, 1, 1, 0] }, { submissionId: 'b', grid: [1, 0, 0, 1] }],
    })
    // The other voter's pick differs in BOTH category and target on purpose: with
    // the same pair, leaking their vote would produce an identical payload and this
    // would pass against the very bug it guards.
    h.state.votes.set(voteKey('v', 'best'), 'a')
    h.state.votes.set(voteKey('other', 'funniest'), 'b')

    handleJoin(h.ctx, h.conn('conn-v'), join('v'))

    const gallery = h.sent.find(s => s.msg.type === 'gallery')!.msg as GalleryMsg
    expect(gallery).toMatchObject({ palette: config.palette, gridW: 2, gridH: 2 })
    // Only their own picks — never anyone else's, since tallies stay hidden.
    const votes = h.sent.find(s => s.msg.type === 'vote-state')!.msg
    expect(votes).toEqual({ type: 'vote-state', votes: { best: 'a' } })
  })

  it('sends an empty vote-state to a joiner who has not voted', () => {
    const h = harness([player('v')], { phase: 'VOTING', config, gallery: [] })
    handleJoin(h.ctx, h.conn('conn-v'), join('v'))
    expect(h.sent.find(s => s.msg.type === 'vote-state')!.msg).toEqual({ type: 'vote-state', votes: {} })
  })

  it('restores the joiner\'s own grid mid-DRAWING', () => {
    const h = harness([player('a')], { phase: 'DRAWING', config })
    // Someone else's submission is inserted FIRST, so a lookup that ignores the
    // clientId and takes the first entry hands back the wrong grid.
    h.state.submissions.set('other', [1, 1, 1, 1])
    h.state.submissions.set('a', [0, 1, 1, 0])
    handleJoin(h.ctx, h.conn('conn-a'), join('a'))
    const drawStates = h.sent.filter(s => s.msg.type === 'draw-state')
    expect(drawStates).toHaveLength(1)
    expect(drawStates[0].msg).toEqual({ type: 'draw-state', grid: [0, 1, 1, 0] })
  })

  it('sends no draw-state when the joiner has submitted nothing', () => {
    const h = harness([player('a')], { phase: 'DRAWING', config })
    handleJoin(h.ctx, h.conn('conn-a'), join('a'))
    expect(h.sent.some(s => s.msg.type === 'draw-state')).toBe(false)
  })

  it('replays the retained ranking mid-RESULTS', () => {
    // `results` is broadcast exactly once, so without this a rejoining client sits
    // on "counting the damage…" and a rejoining GM cannot restart the room.
    const ranked = [{ submissionId: 'a', clientId: 'a', name: 'A', votes: 1, breakdown: { funniest: 1, best: 0 }, grid: [0] }]
    const h = harness([player('a')], { phase: 'RESULTS', config, ranked })
    handleJoin(h.ctx, h.conn('conn-a'), join('a'))
    expect(h.sent.find(s => s.msg.type === 'results')!.msg as ResultsMsg).toMatchObject({ ranked })
  })

  it('sends nothing extra in LOBBY', () => {
    const h = harness([], {})
    handleJoin(h.ctx, h.conn('c1'), join('a'))
    expect(h.sent).toEqual([])
  })
})

describe('handleRename', () => {
  it('renames in the lobby and de-duplicates', () => {
    const h = harness([player('a', { name: 'ray' }), player('b', { name: 'keith' })])
    handleRename(h.ctx, h.conn('conn-a'), { type: 'rename', name: 'ray2' })
    expect(h.state.players.get('a')!.name).toBe('ray2')
    handleRename(h.ctx, h.conn('conn-a'), { type: 'rename', name: 'keith' })
    expect(h.state.players.get('a')!.name).not.toBe('keith')
  })

  it('is LOBBY-only, so the reveal stays honest', () => {
    for (const phase of ['DRAWING', 'VOTING', 'RESULTS'] as const) {
      const h = harness([player('a', { name: 'ray' })], { phase })
      handleRename(h.ctx, h.conn('conn-a'), { type: 'rename', name: 'other' })
      expect(h.state.players.get('a')!.name).toBe('ray')
    }
  })

  it('ignores an empty name and an unidentified connection', () => {
    const h = harness([player('a', { name: 'ray' })])
    handleRename(h.ctx, h.conn('conn-a'), { type: 'rename', name: '   ' })
    handleRename(h.ctx, h.conn('nobody'), { type: 'rename', name: 'hax' })
    expect(h.state.players.get('a')!.name).toBe('ray')
    expect(h.stateBroadcasts()).toBe(0)
  })

  it('caps the new name', () => {
    const h = harness([player('a')])
    handleRename(h.ctx, h.conn('conn-a'), { type: 'rename', name: 'y'.repeat(80) })
    expect(h.state.players.get('a')!.name.length).toBeLessThanOrEqual(24)
  })
})

describe('handleShape', () => {
  it('changes the shape in the lobby', () => {
    const h = harness([player('a')])
    handleShape(h.ctx, h.conn('conn-a'), { type: 'shape', shape: 'hexagon' })
    expect(h.state.players.get('a')!.shape).toBe('hexagon')
    expect(h.stateBroadcasts()).toBe(1)
  })

  it('is LOBBY-only', () => {
    for (const phase of ['DRAWING', 'VOTING', 'RESULTS'] as const) {
      const h = harness([player('a', { shape: 'circle' })], { phase })
      handleShape(h.ctx, h.conn('conn-a'), { type: 'shape', shape: 'leaf' })
      expect(h.state.players.get('a')!.shape).toBe('circle')
    }
  })

  it('ignores an unidentified connection', () => {
    const h = harness([player('a', { shape: 'circle' })])
    handleShape(h.ctx, h.conn('nobody'), { type: 'shape', shape: 'leaf' })
    expect(h.state.players.get('a')!.shape).toBe('circle')
  })
})

describe('handleClose', () => {
  it('marks the player offline but keeps them in the roster', () => {
    // Never removed — that is what makes a seat stable for the room's whole life.
    const h = harness([player('a'), player('b')], { gmClientId: 'b' })
    handleClose(h.ctx, 'conn-a')
    expect(h.state.players.get('a')).toMatchObject({ connected: false })
    expect(h.state.players.size).toBe(2)
    expect(h.state.connMap.has('conn-a')).toBe(false)
    expect(h.stateBroadcasts()).toBe(1)
  })

  it('auto-promotes when the GM drops', () => {
    const h = harness([player('gm'), player('next')], { gmClientId: 'gm', originalGmClientId: 'gm' })
    handleClose(h.ctx, 'conn-gm')
    expect(h.state.gmClientId).toBe('next')
    // The reclaim target is untouched, so the original GM gets it back.
    expect(h.state.originalGmClientId).toBe('gm')
  })

  it('starts the grace clock only when the last connection goes', () => {
    const h = harness([player('a'), player('b')])
    handleClose(h.ctx, 'conn-a')
    expect(h.emptySince()).toBeNull()
    handleClose(h.ctx, 'conn-b')
    expect(h.emptySince()).not.toBeNull()
  })

  it('handles a connection that never identified itself', () => {
    const h = harness([player('a')])
    expect(() => handleClose(h.ctx, 'never-joined')).not.toThrow()
    expect(h.state.players.get('a')!.connected).toBe(true)
    expect(h.stateBroadcasts()).toBe(0)
  })
})
