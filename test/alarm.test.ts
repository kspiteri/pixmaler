// Room-lifecycle scheduling: one alarm slot, four windows.
//
// The real windows are 45 minutes (idle), 60 seconds (empty grace) and the round
// deadline, so none of this is observable in a smoke test. Extracting the decisions
// as pure functions of an injected clock is what makes them testable at all — which
// is why the #19 slice for the alarm went last and looks like this.
//
// Reference: docs/.plans/archive/10-room-lifecycle.md

import type { LifecycleClock } from '../party/alarm'
import type { RoomState } from '../party/state'
import type { GmConfigureMsg } from '../src/lib/types'
import { describe, expect, it } from 'vitest'
import { alarmAction, ARM_TOLERANCE_MS, handleExtendTime, nextWake, shouldArm } from '../party/alarm'
import { freshRoomState, MAX_EXTENSIONS } from '../party/state'
import { player, harness as room } from './support/room'

const NOW = 1_000_000
const IDLE = 45 * 60 * 1000
const GRACE = 60 * 1000

function clock(over: Partial<LifecycleClock> = {}): LifecycleClock {
  return { now: NOW, lastActivityAt: NOW, emptySince: null, idleMs: IDLE, emptyGraceMs: GRACE, ...over }
}

function state(over: Partial<RoomState> = {}): RoomState {
  return Object.assign(freshRoomState(), over)
}

// A room with `n` live connections, so the empty-room branch can be exercised.
function connected(n: number, over: Partial<RoomState> = {}): RoomState {
  const s = state(over)
  for (let i = 0; i < n; i++) s.connMap.set(`c${i}`, `p${i}`)
  return s
}

describe('nextWake', () => {
  it('falls back to the idle deadline in LOBBY', () => {
    expect(nextWake(state(), clock())).toBe(NOW + IDLE)
  })

  it('prefers the draw deadline when it is sooner', () => {
    const s = state({ phase: 'DRAWING', deadline: NOW + 30_000 })
    expect(nextWake(s, clock())).toBe(NOW + 30_000)
  })

  it('prefers the VOTING backstop when it is sooner', () => {
    // Both timed phases park their expiry in `state.deadline`; the phase is what
    // distinguishes them.
    const s = state({ phase: 'VOTING', deadline: NOW + 60_000 })
    expect(nextWake(s, clock())).toBe(NOW + 60_000)
  })

  it('ignores a stale deadline left behind in an untimed phase', () => {
    for (const phase of ['LOBBY', 'RESULTS'] as const) {
      const s = state({ phase, deadline: NOW + 1000 })
      expect(nextWake(s, clock())).toBe(NOW + IDLE)
    }
  })

  it('prefers the empty-room grace when it is sooner', () => {
    expect(nextWake(state(), clock({ emptySince: NOW }))).toBe(NOW + GRACE)
  })

  it('takes the soonest of all four', () => {
    const s = state({ phase: 'DRAWING', deadline: NOW + 90_000 })
    // grace (60s) beats the draw deadline (90s) beats idle (45min).
    expect(nextWake(s, clock({ emptySince: NOW }))).toBe(NOW + GRACE)
  })

  it('keeps a deadline already in the past, so the alarm fires immediately', () => {
    const s = state({ phase: 'DRAWING', deadline: NOW - 5000 })
    expect(nextWake(s, clock())).toBe(NOW - 5000)
  })

  it('slides the idle deadline with activity', () => {
    expect(nextWake(state(), clock({ lastActivityAt: NOW + 10_000 }))).toBe(NOW + 10_000 + IDLE)
  })
})

describe('shouldArm', () => {
  it('always writes when nothing is armed', () => {
    expect(shouldArm(NOW, null)).toBe(true)
  })

  it('skips a target inside the tolerance', () => {
    // The idle deadline slides on every message; re-arming each time thrashes the
    // single alarm slot with a storage write and a runtime log per message.
    expect(shouldArm(NOW + ARM_TOLERANCE_MS - 1, NOW)).toBe(false)
    expect(shouldArm(NOW, NOW)).toBe(false)
  })

  it('writes at or beyond the tolerance, in either direction', () => {
    expect(shouldArm(NOW + ARM_TOLERANCE_MS, NOW)).toBe(true)
    expect(shouldArm(NOW - ARM_TOLERANCE_MS, NOW)).toBe(true)
  })
})

describe('alarmAction', () => {
  it('ends the draw round at its deadline', () => {
    const s = state({ phase: 'DRAWING', deadline: NOW })
    expect(alarmAction(s, clock())).toBe('end-drawing')
  })

  it('ends voting at the backstop', () => {
    const s = state({ phase: 'VOTING', deadline: NOW })
    expect(alarmAction(s, clock())).toBe('end-voting')
  })

  it('re-arms when a timed phase has not expired yet', () => {
    for (const phase of ['DRAWING', 'VOTING'] as const) {
      const s = state({ phase, deadline: NOW + 1000 })
      expect(alarmAction(s, clock())).toBe('re-arm')
    }
  })

  it('wipes an empty room once the grace window elapses', () => {
    expect(alarmAction(state(), clock({ emptySince: NOW - GRACE }))).toBe('wipe-empty')
  })

  it('does not wipe an empty room early', () => {
    expect(alarmAction(state(), clock({ emptySince: NOW - GRACE + 1 }))).toBe('re-arm')
  })

  it('does not wipe when somebody reconnected inside the grace window', () => {
    // `connMap` is re-checked at fire time, not trusted from when the alarm was set.
    const s = connected(1)
    expect(alarmAction(s, clock({ emptySince: NOW - GRACE }))).toBe('re-arm')
  })

  it('wipes an idle room', () => {
    expect(alarmAction(state(), clock({ lastActivityAt: NOW - IDLE }))).toBe('wipe-idle')
  })

  it('does not wipe an idle room early', () => {
    expect(alarmAction(state(), clock({ lastActivityAt: NOW - IDLE + 1 }))).toBe('re-arm')
  })

  it('wipes an idle room even with tabs still open', () => {
    // The documented case: a lobby left open overnight. The idle path can fire with
    // live connections, which is why `wipeState` broadcasts before clearing.
    expect(alarmAction(connected(2), clock({ lastActivityAt: NOW - IDLE }))).toBe('wipe-idle')
  })

  it('resolves a round rather than wiping it', () => {
    // Branch order matters: an expired round that is ALSO idle must end, not vanish.
    const s = state({ phase: 'DRAWING', deadline: NOW })
    expect(alarmAction(s, clock({ lastActivityAt: NOW - IDLE, emptySince: NOW - GRACE }))).toBe('end-drawing')
  })

  it('reports empty before idle when a room is both', () => {
    expect(alarmAction(state(), clock({ emptySince: NOW - GRACE, lastActivityAt: NOW - IDLE }))).toBe('wipe-empty')
  })

  it('is idempotent — a retry on the same inputs names the same branch', () => {
    // Alarms auto-retry on failure, so every branch re-checks its own condition.
    const s = state({ phase: 'DRAWING', deadline: NOW })
    const c = clock()
    expect(alarmAction(s, c)).toBe(alarmAction(s, c))
  })

  it('does not act on a phase that already moved on', () => {
    // The exact retry hazard: a stale deadline from DRAWING must not make a room in
    // RESULTS end a round that is already over.
    const s = state({ phase: 'RESULTS', deadline: NOW - 1000 })
    expect(alarmAction(s, clock())).toBe('re-arm')
  })
})

describe('handleExtendTime', () => {
  const config = {
    type: 'gm:configure',
    gridW: 2,
    gridH: 2,
    palette: ['#000000', '#ffffff'],
    targetGrid: [0, 1, 1, 0],
    drawSeconds: 60,
  } satisfies GmConfigureMsg

  function drawing(over: Partial<RoomState> = {}) {
    return room([player('gm'), player('p1')], {
      gmClientId: 'gm',
      config,
      phase: 'DRAWING',
      deadline: Date.now() + 30_000,
      roundSeconds: 60,
      ...over,
    })
  }

  it('pushes the deadline and the round length together', () => {
    const h = drawing()
    const before = h.state.deadline!
    handleExtendTime(h.ctx, h.conn('conn-gm'))
    expect(h.state.deadline).toBe(before + 15_000)
    expect(h.state.roundSeconds).toBe(75)
    expect(h.state.extensions).toBe(1)
    expect(h.stateBroadcasts()).toBe(1)
  })

  it('caps the number of extensions', () => {
    const h = drawing()
    for (let i = 0; i < MAX_EXTENSIONS + 3; i++)
      handleExtendTime(h.ctx, h.conn('conn-gm'))
    expect(h.state.extensions).toBe(MAX_EXTENSIONS)
  })

  it('refuses a non-GM', () => {
    const h = drawing()
    const before = h.state.deadline
    handleExtendTime(h.ctx, h.conn('conn-p1'))
    expect(h.state.deadline).toBe(before)
  })

  it('is DRAWING-only', () => {
    for (const phase of ['LOBBY', 'VOTING', 'RESULTS'] as const) {
      const h = drawing({ phase })
      const before = h.state.deadline
      handleExtendTime(h.ctx, h.conn('conn-gm'))
      expect(h.state.deadline).toBe(before)
    }
  })

  it('will not resurrect a round whose deadline already passed', () => {
    // The alarm may already be firing for it and collecting submissions.
    const h = drawing({ deadline: Date.now() - 1 })
    const before = h.state.deadline
    handleExtendTime(h.ctx, h.conn('conn-gm'))
    expect(h.state.deadline).toBe(before)
    expect(h.state.extensions).toBe(0)
  })

  it('does nothing without a deadline', () => {
    const h = drawing({ deadline: null })
    handleExtendTime(h.ctx, h.conn('conn-gm'))
    expect(h.state.deadline).toBeNull()
  })
})
