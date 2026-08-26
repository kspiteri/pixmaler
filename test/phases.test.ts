// Phase transitions, and the two ordering constraints #19 calls load-bearing.
//
// `endDrawing` must compute the gallery BEFORE it mutates any state, and must set
// `phase = 'VOTING'` BEFORE calling `endVoting` on the nobody-drew path. Both only
// hold together in the current order, and both look like tidy-up targets to anyone
// who does not know the history — a throw mid-mutation once left the room in VOTING
// holding DRAWING's past deadline with no gallery, and the alarm retry then resolved
// the round off an empty gallery, silently discarding every submission.

import type { RoomState } from '../party/state'
import type { GalleryMsg, GmConfigureMsg, PhaseMsg, ResultsMsg } from '../src/lib/types'
import { describe, expect, it } from 'vitest'
import { endDrawing, endVoting, handleStart, resetToLobby } from '../party/phases'
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

// A GM plus two other players, which is what the start gate requires.
function lobby(over: Partial<RoomState> = {}, opts = {}) {
  return room([player('gm'), player('p1'), player('p2')], {
    gmClientId: 'gm',
    originalGmClientId: 'gm',
    config,
    ...over,
  }, opts)
}

// A DRAWING room where `drew` painted and `wiped` cleared their canvas.
function drawing(drew: string[], wiped: string[] = [], idle: string[] = []) {
  const all = [player('gm'), ...[...drew, ...wiped, ...idle].map(id => player(id))]
  const h = room(all, { gmClientId: 'gm', config, phase: 'DRAWING', deadline: Date.now() - 1 })
  for (const id of drew) {
    h.state.players.get(id)!.drewThisRound = true
    h.state.submissions.set(id, [0, 1, 1, 0])
  }
  for (const id of wiped) {
    h.state.players.get(id)!.drewThisRound = true
    h.state.submissions.set(id, [-1, -1, -1, -1])
  }
  // Touched nothing: no flag, but they may still have auto-submitted a blank grid.
  for (const id of idle) h.state.submissions.set(id, [-1, -1, -1, -1])
  return h
}

describe('handleStart', () => {
  it('opens DRAWING with a deadline and clears the previous round', () => {
    const h = lobby({ ranked: [], gallery: [] })
    h.state.submissions.set('p1', [0])
    h.state.votes.set(voteKey('p1', 'best'), 'p2')
    h.state.players.get('p1')!.doneDrawing = true
    h.state.players.get('p2')!.spectating = true

    handleStart(h.ctx, h.conn('conn-gm'))

    expect(h.state.phase).toBe('DRAWING')
    expect(h.state.deadline).toBeGreaterThan(Date.now())
    expect(h.state.roundSeconds).toBe(config.drawSeconds)
    expect(h.state.extensions).toBe(0)
    expect(h.state.submissions.size).toBe(0)
    expect(h.state.votes.size).toBe(0)
    expect(h.state.gallery).toBeNull()
    expect(h.state.ranked).toBeNull()
    // All three per-player flags reset together — a new round makes everyone a
    // competitor again with nothing drawn yet.
    for (const p of h.state.players.values()) {
      expect(p.doneDrawing).toBe(false)
      expect(p.spectating).toBe(false)
      expect(p.drewThisRound).toBe(false)
    }
  })

  it('broadcasts the phase with the same deadline it stored', () => {
    const h = lobby()
    handleStart(h.ctx, h.conn('conn-gm'))
    const msg = h.broadcasts.at(-1) as PhaseMsg
    expect(msg).toMatchObject({ type: 'phase', phase: 'DRAWING' })
    expect(msg.deadline).toBe(h.state.deadline)
  })

  it('refuses a non-GM', () => {
    const h = lobby()
    handleStart(h.ctx, h.conn('conn-p1'))
    expect(h.state.phase).toBe('LOBBY')
  })

  it('is LOBBY-only', () => {
    for (const phase of ['DRAWING', 'VOTING', 'RESULTS'] as const) {
      const h = lobby({ phase })
      handleStart(h.ctx, h.conn('conn-gm'))
      expect(h.state.deadline).toBeNull()
    }
  })

  it('refuses without a configured image', () => {
    const h = lobby({ config: null })
    handleStart(h.ctx, h.conn('conn-gm'))
    expect(h.state.phase).toBe('LOBBY')
  })

  it('needs two non-GM players, and says so', () => {
    const h = room([player('gm'), player('only')], { gmClientId: 'gm', config })
    handleStart(h.ctx, h.conn('conn-gm'))
    expect(h.state.phase).toBe('LOBBY')
    expect(h.sent.at(-1)?.msg).toEqual({ type: 'error', message: 'Need at least 2 players (plus GM) to start.' })
  })

  it('does not count disconnected players toward the gate', () => {
    const h = room([player('gm'), player('a'), player('gone', { connected: false })], { gmClientId: 'gm', config })
    handleStart(h.ctx, h.conn('conn-gm'))
    expect(h.state.phase).toBe('LOBBY')
  })

  it('relaxes the gate in dev mode', () => {
    const h = room([player('gm')], { gmClientId: 'gm', config }, { devMode: true })
    handleStart(h.ctx, h.conn('conn-gm'))
    expect(h.state.phase).toBe('DRAWING')
  })
})

describe('endDrawing', () => {
  it('is DRAWING-only', () => {
    for (const phase of ['LOBBY', 'VOTING', 'RESULTS'] as const) {
      const h = room([player('gm')], { phase, config })
      endDrawing(h.ctx)
      expect(h.state.phase).toBe(phase)
    }
  })

  it('freezes a gallery from everyone who drew, and moves to VOTING', () => {
    const h = drawing(['p1', 'p2'])
    endDrawing(h.ctx)
    expect(h.state.phase).toBe('VOTING')
    expect(h.state.gallery?.map(s => s.submissionId).sort()).toEqual(['p1', 'p2'])
    expect(h.state.deadline).toBeGreaterThan(Date.now())
  })

  it('keeps a wiped canvas in the gallery as a blank card', () => {
    // Membership is `drewThisRound`, not grid content: filtering on content dropped
    // a player who painted then cleared out of voting AND results, with no feedback.
    const h = drawing(['p1'], ['p2'])
    endDrawing(h.ctx)
    expect(h.state.gallery?.map(s => s.submissionId).sort()).toEqual(['p1', 'p2'])
    expect(h.state.gallery?.find(s => s.submissionId === 'p2')?.grid.every(c => c === -1)).toBe(true)
  })

  it('leaves out someone who never touched the canvas', () => {
    const h = drawing(['p1'], [], ['idle'])
    endDrawing(h.ctx)
    expect(h.state.gallery?.map(s => s.submissionId)).toEqual(['p1'])
  })

  it('broadcasts the gallery before the phase', () => {
    // The client mounts Voting on the phase message, so a phase that arrives first
    // renders against whatever gallery it still holds.
    const h = drawing(['p1', 'p2'])
    endDrawing(h.ctx)
    const types = h.broadcasts.map(m => m.type)
    expect(types.indexOf('gallery')).toBeLessThan(types.indexOf('phase'))
    const gallery = h.broadcasts.find(m => m.type === 'gallery') as GalleryMsg
    expect(gallery).toMatchObject({ palette: config.palette, gridW: config.gridW, gridH: config.gridH })
  })

  it('computes the gallery before mutating state, so a throw leaves the round intact', () => {
    // The regression this ordering exists for. `players` is booby-trapped to throw
    // during the gallery build; the room must be untouched afterwards, so the alarm
    // retry re-enters the DRAWING branch rather than the VOTING one.
    const h = drawing(['p1'])
    const deadline = h.state.deadline
    h.state.players = new Proxy(h.state.players, {
      get(target, prop, recv) {
        if (prop === 'get')
          throw new Error('boom')
        return Reflect.get(target, prop, recv)
      },
    })

    expect(() => endDrawing(h.ctx)).toThrow('boom')
    expect(h.state.phase).toBe('DRAWING')
    expect(h.state.gallery).toBeNull()
    expect(h.state.deadline).toBe(deadline)
    expect(h.broadcasts).toEqual([])
  })

  it('skips VOTING entirely when nobody drew', () => {
    // VOTING would be a phase in which nobody can act. Clients see DRAWING →
    // RESULTS, and the transient VOTING is never broadcast.
    const h = drawing([], [], ['idle'])
    endDrawing(h.ctx)
    expect(h.state.phase).toBe('RESULTS')
    expect(h.state.ranked).toEqual([])
    expect(h.broadcasts.map(m => m.type)).toEqual(['results', 'phase'])
    expect((h.broadcasts.at(-1) as PhaseMsg).phase).toBe('RESULTS')
  })

  it('sets VOTING before delegating, or the skip path would not fire', () => {
    // `endVoting` guards on `phase !== 'VOTING'` and returns early otherwise, so
    // setting the phase late breaks the skip path instead of protecting it.
    const h = drawing([])
    endDrawing(h.ctx)
    expect(h.state.phase).toBe('RESULTS')
    expect(h.state.deadline).toBeNull()
  })
})

describe('endVoting', () => {
  it('is VOTING-only', () => {
    for (const phase of ['LOBBY', 'DRAWING', 'RESULTS'] as const) {
      const h = room([player('gm')], { phase, config })
      endVoting(h.ctx)
      expect(h.state.ranked).toBeNull()
    }
  })

  it('ranks the frozen gallery and clears the backstop', () => {
    const h = room([player('a'), player('b'), player('v')], {
      phase: 'VOTING',
      config,
      deadline: Date.now() + 1000,
      gallery: [{ submissionId: 'a', grid: [0] }, { submissionId: 'b', grid: [1] }],
    })
    h.state.votes.set(voteKey('v', 'best'), 'b')
    endVoting(h.ctx)
    expect(h.state.phase).toBe('RESULTS')
    expect(h.state.deadline).toBeNull()
    expect(h.state.ranked?.map(r => r.submissionId)).toEqual(['b', 'a'])
  })

  it('broadcasts results before the phase', () => {
    // Otherwise Results mounts against the PREVIOUS round's ranking and flashes
    // last round's winner for a frame, spoiling the reveal.
    const h = room([player('a')], { phase: 'VOTING', config, gallery: [{ submissionId: 'a', grid: [0] }] })
    endVoting(h.ctx)
    const types = h.broadcasts.map(m => m.type)
    expect(types).toEqual(['results', 'phase'])
    expect(h.broadcasts[0] as ResultsMsg).toMatchObject({ palette: config.palette, gridW: config.gridW })
  })

  it('retains the ranking so a late joiner can be sent the reveal', () => {
    const h = room([player('a')], { phase: 'VOTING', config, gallery: [{ submissionId: 'a', grid: [0] }] })
    endVoting(h.ctx)
    expect(h.state.ranked).not.toBeNull()
  })
})

describe('resetToLobby', () => {
  it('drops everything the round held, including the image', () => {
    const h = room([player('gm', { doneDrawing: true, drewThisRound: true, spectating: true })], {
      phase: 'RESULTS',
      config,
      deadline: 123,
      gallery: [],
      ranked: [],
    })
    h.state.submissions.set('gm', [0])
    h.state.votes.set(voteKey('gm', 'best'), 'gm')

    resetToLobby(h.ctx)

    expect(h.state.phase).toBe('LOBBY')
    expect(h.state.config).toBeNull()
    expect(h.state.deadline).toBeNull()
    expect(h.state.gallery).toBeNull()
    expect(h.state.ranked).toBeNull()
    expect(h.state.submissions.size).toBe(0)
    expect(h.state.votes.size).toBe(0)
    const p = h.state.players.get('gm')!
    expect([p.doneDrawing, p.spectating, p.drewThisRound]).toEqual([false, false, false])
  })

  it('leaves roundSeconds and extensions for handleStart to reset', () => {
    // LOBBY keeps reporting the last round's values until a new one is configured.
    const h = room([], { phase: 'RESULTS', roundSeconds: 90, extensions: 2 })
    resetToLobby(h.ctx)
    expect(h.state.roundSeconds).toBe(90)
    expect(h.state.extensions).toBe(2)
  })

  it('broadcasts the new lobby state', () => {
    const h = room([], { phase: 'RESULTS' })
    resetToLobby(h.ctx)
    expect(h.stateBroadcasts()).toBe(1)
  })
})
