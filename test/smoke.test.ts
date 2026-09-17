// Full-loop smoke suite (#67): constructed client frames driven through the real handlers and
// the injected clock, LOBBY -> DRAWING -> VOTING -> RESULTS -> LOBBY, asserting the recorded
// broadcasts. Complements the per-slice unit suites — a flow earns a test here when it changes
// the *shape* of the path through the machine; pure leaf values (pinned by the unit suites) are
// folded in as assertions. No Vue, no sockets, no DO runtime; `playFullRound` lives in
// `support/round.ts` so other suites can reuse it to fast-forward to any phase.

import type { ClientMsg, GalleryMsg, Phase, StateMsg } from '../src/lib/protocol/types'
import type { Harness } from './support/room'
import { describe, expect, it } from 'vitest'
import { handleClose, handleJoin } from '../party/connection'
import { handlePlayAgain, handleTransfer } from '../party/gm'
import { endDrawing, handleStart } from '../party/phases'
import { handleStopVoting } from '../party/voting'
import { player, harness as room } from './support/room'
import { BLANK, configure, done, playFullRound, start, submissionIdOf, submit, voteBoth } from './support/round'

// A seated LOBBY: the first id holds GM, everyone connected.
function lobby(ids: string[] = ['gm', 'p1', 'p2']) {
  const [gm] = ids
  return room(ids.map(id => player(id)), { gmClientId: gm, originalGmClientId: gm })
}

function joinMsg(clientId: string): Extract<ClientMsg, { type: 'join' }> {
  return { type: 'join', clientId, name: clientId, shape: 'circle', create: false }
}

const conn = (h: Harness, clientId: string) => h.conn(`conn-${clientId}`)

// The phases actually broadcast, in order — the client-visible path through the machine.
function phaseSeq(h: Harness): Phase[] {
  return h.broadcasts.flatMap(m => (m.type === 'phase' ? [m.phase] : []))
}

function lastState(h: Harness): StateMsg {
  return h.broadcasts.filter(m => m.type === 'state').at(-1) as StateMsg
}

function galleryMsg(h: Harness): GalleryMsg {
  return h.broadcasts.find(m => m.type === 'gallery') as GalleryMsg
}

// ── F1 · canonical round ──────────────────────────────────────────────────────

describe('f1 · canonical round', () => {
  it('walks LOBBY -> DRAWING -> VOTING -> RESULTS with a ranked winner', () => {
    const h = lobby()
    const ranked = playFullRound(h)

    expect(h.state.phase).toBe('RESULTS')
    expect(phaseSeq(h)).toEqual(['DRAWING', 'VOTING', 'RESULTS'])
    // Everyone drew, so all three are ranked; the rallied winner tops it with a real tally.
    expect(ranked).toHaveLength(3)
    expect(ranked![0].clientId).toBe('gm')
    expect(ranked![0].votes).toBeGreaterThan(ranked![1].votes)
    expect(ranked![0].breakdown).toEqual({ funniest: 2, best: 2 })
  })

  it('broadcasts an anonymous gallery — grid and opaque id only', () => {
    const h = lobby()
    playFullRound(h, { stopAfter: 'VOTING' })

    const gallery = galleryMsg(h)
    expect(gallery.submissions).toHaveLength(3)
    for (const sub of gallery.submissions)
      expect(Object.keys(sub).sort()).toEqual(['grid', 'submissionId'])
  })
})

// ── F2 · deadline finish ──────────────────────────────────────────────────────

describe('f2 · deadline finish', () => {
  it('ends DRAWING on partial submissions; the idler is left out of the gallery', () => {
    const h = lobby()
    configure(h)
    start(h)
    submit(h, 'gm')
    done(h, 'gm')
    submit(h, 'p1')
    done(h, 'p1')
    // p2 auto-submits a blank canvas at the deadline and never clicks Done.
    submit(h, 'p2', BLANK)
    endDrawing(h.ctx)

    expect(h.state.phase).toBe('VOTING')
    expect(galleryMsg(h).submissions).toHaveLength(2)

    voteBoth(h, 'p1', submissionIdOf(h, 'gm')!)
    voteBoth(h, 'p2', submissionIdOf(h, 'gm')!)
    voteBoth(h, 'gm', submissionIdOf(h, 'p1')!)
    handleStopVoting(h.ctx, conn(h, 'gm'))

    expect(h.state.phase).toBe('RESULTS')
    // Only the two drawers are ranked — p2 blanked and is absent.
    expect(h.state.ranked!.map(r => r.clientId).sort()).toEqual(['gm', 'p1'])
  })
})

// ── F3 · nobody drew ──────────────────────────────────────────────────────────

describe('f3 · nobody drew', () => {
  it('skips VOTING and lands on RESULTS with an empty ranking', () => {
    const h = lobby()
    configure(h)
    start(h)
    for (const id of ['gm', 'p1', 'p2']) submit(h, id, BLANK)
    endDrawing(h.ctx)

    expect(h.state.phase).toBe('RESULTS')
    expect(h.state.ranked).toEqual([])
    // The transient VOTING is never broadcast: clients see DRAWING -> RESULTS.
    expect(phaseSeq(h)).toEqual(['DRAWING', 'RESULTS'])
  })
})

// ── F4 · GM stops voting early ────────────────────────────────────────────────

describe('f4 · GM stops voting early', () => {
  it('resolves RESULTS from a partial tally when the GM stops', () => {
    const h = lobby()
    playFullRound(h, { stopAfter: 'VOTING' })
    expect(h.state.phase).toBe('VOTING')

    // One ballot in before the GM calls it.
    voteBoth(h, 'p1', submissionIdOf(h, 'gm')!)
    handleStopVoting(h.ctx, conn(h, 'gm'))

    expect(h.state.phase).toBe('RESULTS')
    expect(h.state.ranked!.find(r => r.clientId === 'gm')!.votes).toBe(2)
  })
})

// ── F5 · spectator joins mid-round ────────────────────────────────────────────

describe('f5 · spectator joins mid-round', () => {
  it('keeps the spectator out of both tallies but in the roster', () => {
    const h = lobby()
    configure(h)
    start(h)

    // A fourth client arrives during DRAWING.
    handleJoin(h.ctx, conn(h, 'spec'), joinMsg('spec'))
    expect(h.state.players.get('spec')!.spectating).toBe(true)
    // Excluded from the drawing denominator — still three.
    expect(lastState(h).totalDrawing).toBe(3)

    for (const id of ['gm', 'p1', 'p2']) {
      submit(h, id)
      done(h, id)
    }
    submit(h, 'spec') // a spectator has no canvas: ignored
    endDrawing(h.ctx)
    expect(submissionIdOf(h, 'spec')).toBeUndefined()

    // A valid ballot broadcasts state; the denominator excludes the spectator.
    voteBoth(h, 'p1', submissionIdOf(h, 'gm')!)
    expect(lastState(h).totalVoters).toBe(3)
    voteBoth(h, 'spec', submissionIdOf(h, 'gm')!) // spectators do not judge: ignored
    voteBoth(h, 'p2', submissionIdOf(h, 'gm')!)
    handleStopVoting(h.ctx, conn(h, 'gm'))

    expect(h.state.players.has('spec')).toBe(true)
    expect(h.state.ranked!.some(r => r.clientId === 'spec')).toBe(false)
  })
})

// ── F6 · GM change ────────────────────────────────────────────────────────────

describe('f6 · GM change', () => {
  it('transfers GM in the lobby; the new GM drives the round', () => {
    const h = lobby()
    handleTransfer(h.ctx, conn(h, 'gm'), { type: 'gm:transfer', toClientId: 'p1' })
    expect(h.state.gmClientId).toBe('p1')

    // The old GM can no longer start.
    handleStart(h.ctx, conn(h, 'gm'))
    expect(h.state.phase).toBe('LOBBY')

    const ranked = playFullRound(h, { gm: 'p1' })
    expect(h.state.phase).toBe('RESULTS')
    expect(ranked).toHaveLength(3)
  })

  it('auto-promotes a caretaker when the GM disconnects', () => {
    const h = lobby(['gm', 'p1', 'p2', 'p3'])
    handleClose(h.ctx, 'conn-gm')

    expect(h.state.players.get('gm')!.connected).toBe(false)
    expect(h.state.gmClientId).toBe('p1') // first connected takes over

    const ranked = playFullRound(h, { gm: 'p1' })
    expect(h.state.phase).toBe('RESULTS')
    // The offline original GM never drew, so isn't ranked.
    expect(ranked!.some(r => r.clientId === 'gm')).toBe(false)
  })
})

// ── F7 · play again ───────────────────────────────────────────────────────────

describe('f7 · play again', () => {
  it('resets cleanly and runs a second round with the same players', () => {
    const h = lobby()
    playFullRound(h)
    expect(h.state.phase).toBe('RESULTS')

    handlePlayAgain(h.ctx, conn(h, 'gm'))
    expect(h.state.phase).toBe('LOBBY')
    expect(h.state.config).toBeNull()
    expect(h.state.submissions.size).toBe(0)
    expect(h.state.votes.size).toBe(0)
    expect(h.state.gallery).toBeNull()
    expect(h.state.ranked).toBeNull()
    for (const p of h.state.players.values()) {
      expect(p.drewThisRound).toBe(false)
      expect(p.doneDrawing).toBe(false)
      expect(p.spectating).toBe(false)
    }
    // Play again keeps the players.
    expect([...h.state.players.keys()].sort()).toEqual(['gm', 'p1', 'p2'])

    const ranked = playFullRound(h)
    expect(h.state.phase).toBe('RESULTS')
    expect(ranked).toHaveLength(3)
  })
})

// ── Leaf values folded in ─────────────────────────────────────────────────────

describe('leaf values', () => {
  it('keeps a wiped canvas in the gallery but out of the tally', () => {
    const h = lobby()
    configure(h)
    start(h)
    submit(h, 'gm')
    done(h, 'gm')
    submit(h, 'p1')
    submit(h, 'p1', BLANK) // p1 wipes after painting: drewThisRound stays, grid goes blank
    submit(h, 'p2')
    done(h, 'p2')
    endDrawing(h.ctx)

    // p1 is in the gallery (they drew) but their canvas is blank.
    expect(galleryMsg(h).submissions).toHaveLength(3)
    const p1Sub = submissionIdOf(h, 'p1')!
    expect(galleryMsg(h).submissions.find(s => s.submissionId === p1Sub)!.grid.every(c => c === -1)).toBe(true)

    // A vote for the wiped canvas is refused, so it can't be waited on or win.
    voteBoth(h, 'gm', p1Sub)
    expect(h.state.votes.size).toBe(0)
  })

  it('ranks a tie as joint top', () => {
    const h = lobby()
    configure(h)
    start(h)
    for (const id of ['gm', 'p1', 'p2']) {
      submit(h, id)
      done(h, id)
    }
    endDrawing(h.ctx)

    voteBoth(h, 'p2', submissionIdOf(h, 'gm')!) // gm: 2
    voteBoth(h, 'gm', submissionIdOf(h, 'p1')!) // p1: 2
    handleStopVoting(h.ctx, conn(h, 'gm'))

    const ranked = h.state.ranked!
    expect(ranked[0].votes).toBe(2)
    expect(ranked[1].votes).toBe(2) // joint top
    expect(ranked[2].votes).toBe(0)
  })

  it('resolves a no-vote round to a zero-vote ranking', () => {
    const h = lobby()
    playFullRound(h, { stopAfter: 'VOTING' })
    handleStopVoting(h.ctx, conn(h, 'gm')) // nobody voted

    expect(h.state.phase).toBe('RESULTS')
    expect(h.state.ranked).toHaveLength(3)
    expect(h.state.ranked!.every(r => r.votes === 0)).toBe(true)
  })
})
