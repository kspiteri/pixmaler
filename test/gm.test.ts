// GM-only controls.
//
// The phase guards here are the interesting part. Each one exists because a GM can
// hold a stale tab from an earlier phase and click a button the room has moved past
// — `gm:playAgain` from a stale RESULTS tab used to null the `config` the GM had
// just chosen in the lobby, silently losing their image.

import type { RoomPlayer, RoomState } from '../party/state'
import type { GmConfigureMsg, Phase } from '../src/lib/types'
import { describe, expect, it } from 'vitest'
import {
  handleCancelRound,
  handleConfigure,
  handleEndSession,
  handlePlayAgain,
  handleTransfer,
} from '../party/gm'
import { autoPromoteGm } from '../party/state'
import { player, harness as room } from './support/room'

const config = {
  type: 'gm:configure',
  gridW: 2,
  gridH: 2,
  palette: ['#000000', '#ffffff'],
  targetGrid: [0, 1, 1, 0],
  drawSeconds: 60,
} satisfies GmConfigureMsg

const ALL_PHASES: Phase[] = ['LOBBY', 'DRAWING', 'VOTING', 'RESULTS']

// A room where `gm` holds the role. Other players are seated alongside.
function harness(players: RoomPlayer[] = [], over: Partial<RoomState> = {}) {
  return room([player('gm'), ...players], { gmClientId: 'gm', originalGmClientId: 'gm', ...over })
}

describe('handleConfigure', () => {
  it('stores the config and broadcasts it', () => {
    const h = harness()
    handleConfigure(h.ctx, h.conn('conn-gm'), config)
    expect(h.state.config).toEqual(config)
    expect(h.stateBroadcasts()).toBe(1)
  })

  it('refuses a non-GM', () => {
    const h = harness([player('rando')])
    handleConfigure(h.ctx, h.conn('conn-rando'), config)
    expect(h.state.config).toBeNull()
  })

  it('is LOBBY-only', () => {
    for (const phase of ALL_PHASES.filter(p => p !== 'LOBBY')) {
      const h = harness([], { phase })
      handleConfigure(h.ctx, h.conn('conn-gm'), config)
      expect(h.state.config).toBeNull()
    }
  })
})

describe('handleTransfer', () => {
  const to = (toClientId: string) => ({ type: 'gm:transfer', toClientId } as const)

  it('moves the role and rewrites the reclaim target', () => {
    // Both are rewritten: the new GM should reclaim on reconnect, not the old one.
    const h = harness([player('next')])
    handleTransfer(h.ctx, h.conn('conn-gm'), to('next'))
    expect(h.state.gmClientId).toBe('next')
    expect(h.state.originalGmClientId).toBe('next')
    expect(h.stateBroadcasts()).toBe(1)
  })

  it('refuses a non-GM silently', () => {
    const h = harness([player('rando'), player('next')])
    handleTransfer(h.ctx, h.conn('conn-rando'), to('next'))
    expect(h.state.gmClientId).toBe('gm')
    expect(h.sent).toEqual([])
  })

  it('explains itself outside LOBBY, rather than ignoring the click', () => {
    // Answered rather than dropped: the GM pressed a real button, so silence would
    // read as the app being broken.
    for (const phase of ALL_PHASES.filter(p => p !== 'LOBBY')) {
      const h = harness([player('next')], { phase })
      handleTransfer(h.ctx, h.conn('conn-gm'), to('next'))
      expect(h.state.gmClientId).toBe('gm')
      expect(h.sent.at(-1)?.msg).toEqual({ type: 'error', message: 'GM transfer is only allowed in the lobby.' })
    }
  })

  it('explains a target that is absent or disconnected', () => {
    for (const players of [[], [player('gone', { connected: false })]]) {
      const h = harness(players)
      handleTransfer(h.ctx, h.conn('conn-gm'), to('gone'))
      expect(h.state.gmClientId).toBe('gm')
      expect(h.sent.at(-1)?.msg).toEqual({ type: 'error', message: 'Cannot transfer GM: target not present.' })
    }
  })

  it('treats transferring to yourself as a no-op', () => {
    const h = harness()
    handleTransfer(h.ctx, h.conn('conn-gm'), to('gm'))
    expect(h.state.gmClientId).toBe('gm')
    expect(h.stateBroadcasts()).toBe(0)
    expect(h.sent).toEqual([])
  })
})

describe('handlePlayAgain', () => {
  it('resets from RESULTS, clearing everything the round held', () => {
    const h = harness([], { phase: 'RESULTS', config, ranked: [], gallery: [] })
    h.state.submissions.set('gm', [0])
    handlePlayAgain(h.ctx, h.conn('conn-gm'))
    expect(h.state.phase).toBe('LOBBY')
    expect(h.state.config).toBeNull()
    expect(h.state.gallery).toBeNull()
    expect(h.state.ranked).toBeNull()
    expect(h.state.submissions.size).toBe(0)
  })

  it('is RESULTS-only, so a stale tab cannot drop a fresh config', () => {
    // The bug this guard exists for: unguarded, this nulled the config the GM had
    // just chosen in the lobby.
    for (const phase of ALL_PHASES.filter(p => p !== 'RESULTS')) {
      const h = harness([], { phase, config })
      handlePlayAgain(h.ctx, h.conn('conn-gm'))
      expect(h.state.phase).toBe(phase)
      expect(h.state.config).toEqual(config)
    }
  })

  it('refuses a non-GM', () => {
    const h = harness([player('rando')], { phase: 'RESULTS', config })
    handlePlayAgain(h.ctx, h.conn('conn-rando'))
    expect(h.state.phase).toBe('RESULTS')
    expect(h.state.config).toEqual(config)
  })
})

describe('handleCancelRound', () => {
  it('abandons a round in flight', () => {
    for (const phase of ['DRAWING', 'VOTING'] as const) {
      const h = harness([], { phase, config })
      handleCancelRound(h.ctx, h.conn('conn-gm'))
      expect(h.state.phase).toBe('LOBBY')
      // The target image goes too: the motivating case is an image that rendered
      // broken, so the GM must re-pick.
      expect(h.state.config).toBeNull()
    }
  })

  it('refuses between rounds, where playAgain is the right message', () => {
    for (const phase of ['LOBBY', 'RESULTS'] as const) {
      const h = harness([], { phase, config })
      handleCancelRound(h.ctx, h.conn('conn-gm'))
      expect(h.state.phase).toBe(phase)
      expect(h.state.config).toEqual(config)
    }
  })

  it('refuses a non-GM', () => {
    const h = harness([player('rando')], { phase: 'DRAWING', config })
    handleCancelRound(h.ctx, h.conn('conn-rando'))
    expect(h.state.phase).toBe('DRAWING')
  })
})

describe('handleEndSession', () => {
  it('tears the room down between rounds', () => {
    for (const phase of ['LOBBY', 'RESULTS'] as const) {
      const h = harness([], { phase })
      handleEndSession(h.ctx, h.conn('conn-gm'))
      expect(h.wipeCalls()).toBe(1)
    }
  })

  it('refuses mid-round, which would throw away work and the room at once', () => {
    for (const phase of ['DRAWING', 'VOTING'] as const) {
      const h = harness([], { phase })
      handleEndSession(h.ctx, h.conn('conn-gm'))
      expect(h.wipeCalls()).toBe(0)
    }
  })

  it('refuses a non-GM', () => {
    const h = harness([player('rando')])
    handleEndSession(h.ctx, h.conn('conn-rando'))
    expect(h.wipeCalls()).toBe(0)
  })
})

describe('autoPromoteGm', () => {
  it('leaves a connected GM alone', () => {
    // The GM is seated SECOND on purpose. With them first, dropping the early
    // return would still pick them as "first connected" and this would pass
    // against the very bug it guards.
    const h = room([player('earlier'), player('gm')], { gmClientId: 'gm', originalGmClientId: 'gm' })
    autoPromoteGm(h.state)
    expect(h.state.gmClientId).toBe('gm')
  })

  it('hands the role to the first connected player when the GM drops', () => {
    const h = harness([player('second'), player('third')], {})
    h.state.players.get('gm')!.connected = false
    autoPromoteGm(h.state)
    expect(h.state.gmClientId).toBe('second')
  })

  it('does not rewrite the reclaim target, so the original GM gets it back', () => {
    const h = harness([player('second')])
    h.state.players.get('gm')!.connected = false
    autoPromoteGm(h.state)
    expect(h.state.gmClientId).toBe('second')
    expect(h.state.originalGmClientId).toBe('gm')
  })

  it('leaves the role vacant when nobody is connected', () => {
    const h = harness([player('second', { connected: false })])
    h.state.players.get('gm')!.connected = false
    autoPromoteGm(h.state)
    expect(h.state.gmClientId).toBe('gm')
  })

  it('promotes when the GM is not in the roster at all', () => {
    const h = room([player('only')], { gmClientId: 'ghost' })
    autoPromoteGm(h.state)
    expect(h.state.gmClientId).toBe('only')
  })
})
