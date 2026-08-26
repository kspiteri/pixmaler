// Room-lifecycle scheduling: which deadline the single DO alarm should wake for,
// and what to do when it fires.
//
// Last slice of #19, and the one the issue flags as the sharp edge: four windows
// share one alarm slot (draw deadline, VOTING backstop, empty-room grace, idle
// wipe). See `docs/.plans/archive/10-room-lifecycle.md`.
//
// The decisions are pure functions of the clock and the room, which is the point —
// the real windows are 45 minutes and 60 seconds, so nothing here is observable in a
// smoke test. The Durable Object keeps only the parts that genuinely need it:
// `ctx.storage.setAlarm`, `getConnections`, and the timestamp fields.

import type { RoomConn, RoomCtx } from './ctx'
import type { RoomState } from './state'
import { EXTEND_STEP_MS, isGm, MAX_EXTENSIONS } from './state'

// The lifecycle bookkeeping that lives on the Durable Object rather than in
// `RoomState` — a wipe resets the room but must not reset its own clocks.
export interface LifecycleClock {
  now: number
  lastActivityAt: number
  /** When the last live connection dropped, or null while anyone is here. */
  emptySince: number | null
  idleMs: number
  emptyGraceMs: number
}

// Skip the `setAlarm` write when the target barely moved. The idle deadline slides
// forward on every message, so re-arming naively thrashes the single alarm slot —
// a storage write plus an "alarm canceled with requestScheduledAlarm" runtime log
// per message. Harmless at minute-scale windows.
export const ARM_TOLERANCE_MS = 5000

/**
 * Soonest deadline worth waking for.
 *
 * Both timed phases park their expiry in `state.deadline`, so the phase check is
 * what distinguishes them — `alarmAction` makes the matching distinction.
 *
 * Returns `number | null` to match the caller's guard. In practice the idle
 * candidate is always present, so it never returns null today; the signature is
 * preserved rather than tightened because this slice changes no behaviour.
 */
export function nextWake(state: RoomState, clock: LifecycleClock): number | null {
  const candidates: number[] = [clock.lastActivityAt + clock.idleMs]
  if ((state.phase === 'DRAWING' || state.phase === 'VOTING') && state.deadline !== null)
    candidates.push(state.deadline)
  if (clock.emptySince !== null)
    candidates.push(clock.emptySince + clock.emptyGraceMs)
  return candidates.length ? Math.min(...candidates) : null
}

export function shouldArm(when: number, armedFor: number | null): boolean {
  return armedFor === null || Math.abs(when - armedFor) >= ARM_TOLERANCE_MS
}

/**
 * What a fired alarm should do.
 *
 * Branch order is significant and matches the original: resolving a round beats
 * wiping it, and the empty check precedes the idle one so a room that is both empty
 * and idle is reported as empty.
 *
 * Every branch re-checks its own condition, because alarms auto-retry on failure —
 * a retry must not act on a condition that has since passed.
 */
export type AlarmAction = 'end-drawing' | 'end-voting' | 'wipe-empty' | 'wipe-idle' | 're-arm'

export function alarmAction(state: RoomState, clock: LifecycleClock): AlarmAction {
  const { now } = clock
  if (state.phase === 'DRAWING' && state.deadline !== null && now >= state.deadline)
    return 'end-drawing'
  // A backstop for an absent GM: without it the round falls through to the idle
  // wipe, which destroys it rather than resolving it.
  if (state.phase === 'VOTING' && state.deadline !== null && now >= state.deadline)
    return 'end-voting'
  if (clock.emptySince !== null && state.connMap.size === 0 && now >= clock.emptySince + clock.emptyGraceMs)
    return 'wipe-empty'
  if (now >= clock.lastActivityAt + clock.idleMs)
    return 'wipe-idle'
  // Woke early because a deadline moved.
  return 're-arm'
}

// Add EXTEND_STEP_MS to the running round. Lives here rather than with the other GM
// controls because it moves the draw deadline: correctness depends on the caller
// re-arming afterwards, which `onMessage` does for every message.
export function handleExtendTime(ctx: RoomCtx, conn: RoomConn) {
  const { state } = ctx
  if (!isGm(state, conn.id))
    return
  if (state.phase !== 'DRAWING' || state.deadline === null)
    return
  // The alarm may already be firing for this deadline — don't resurrect a round
  // whose submissions are being collected.
  if (Date.now() >= state.deadline)
    return
  if (state.extensions >= MAX_EXTENSIONS)
    return
  state.extensions++
  state.deadline += EXTEND_STEP_MS
  state.roundSeconds += EXTEND_STEP_MS / 1000
  ctx.broadcastState()
}
