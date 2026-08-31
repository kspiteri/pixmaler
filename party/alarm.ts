// Room-lifecycle scheduling (#19): which deadline the single DO alarm wakes for, and
// what to do when it fires. Four windows share one slot — draw deadline, VOTING
// backstop, empty-room grace, idle wipe. The decisions are pure functions of an
// injected clock, since the real windows are 45 minutes and 60 seconds and so are
// unobservable in a smoke test. See docs/.plans/archive/10-room-lifecycle.md.

import type { RoomConn, RoomCtx } from './ctx'
import type { RoomState } from './state'
import { EXTEND_STEP_MS, isGm, MAX_EXTENSIONS } from './state'

// Lives on the Durable Object rather than in `RoomState`: a wipe resets the room but
// must not reset its own clocks.
export interface LifecycleClock {
  now: number
  lastActivityAt: number
  /** When the last live connection dropped, or null while anyone is here. */
  emptySince: number | null
  idleMs: number
  emptyGraceMs: number
}

// The idle deadline slides forward on every message, so re-arming naively thrashes the
// single slot with a storage write and a runtime log per message.
export const ARM_TOLERANCE_MS = 5000

// Both timed phases park their expiry in `state.deadline`, so the phase check is what
// distinguishes them. The idle candidate is unconditional, which is what makes the return
// non-nullable — an idle window is always configured (`parseMs` supplies a default).
export function nextWake(state: RoomState, clock: LifecycleClock): number {
  const candidates: number[] = [clock.lastActivityAt + clock.idleMs]
  if ((state.phase === 'DRAWING' || state.phase === 'VOTING') && state.deadline !== null)
    candidates.push(state.deadline)
  if (clock.emptySince !== null)
    candidates.push(clock.emptySince + clock.emptyGraceMs)
  return Math.min(...candidates)
}

export function shouldArm(when: number, armedFor: number | null): boolean {
  return armedFor === null || Math.abs(when - armedFor) >= ARM_TOLERANCE_MS
}

export type AlarmAction = 'end-drawing' | 'end-voting' | 'wipe-empty' | 'wipe-idle' | 're-arm'

// Branch order is significant: resolving a round beats wiping it, and empty is reported
// before idle when a room is both. Every branch re-checks its own condition, because
// alarms auto-retry on failure.
export function alarmAction(state: RoomState, clock: LifecycleClock): AlarmAction {
  const { now } = clock
  if (state.phase === 'DRAWING' && state.deadline !== null && now >= state.deadline)
    return 'end-drawing'
  // Without this backstop an absent GM lets the round fall through to the idle wipe,
  // which destroys it rather than resolving it.
  if (state.phase === 'VOTING' && state.deadline !== null && now >= state.deadline)
    return 'end-voting'
  if (clock.emptySince !== null && state.connMap.size === 0 && now >= clock.emptySince + clock.emptyGraceMs)
    return 'wipe-empty'
  if (now >= clock.lastActivityAt + clock.idleMs)
    return 'wipe-idle'
  return 're-arm' // woke early because a deadline moved
}

// Lives here rather than with the other GM controls because it moves the draw
// deadline: correctness depends on the caller re-arming, which `onMessage` always does.
export function handleExtendTime(ctx: RoomCtx, conn: RoomConn) {
  const { state } = ctx
  if (!isGm(state, conn.id))
    return
  if (state.phase !== 'DRAWING' || state.deadline === null)
    return
  // The alarm may already be firing for this deadline — don't resurrect a round whose
  // submissions are being collected.
  if (Date.now() >= state.deadline)
    return
  if (state.extensions >= MAX_EXTENSIONS)
    return
  state.extensions++
  state.deadline += EXTEND_STEP_MS
  state.roundSeconds += EXTEND_STEP_MS / 1000
  ctx.broadcastState()
}
