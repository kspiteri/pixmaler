// The pure music planner: given the round's timing and the chosen fit, decide what the song
// should be doing *right now* — play (and where to seek), wait (ambient fills the gap until the
// song starts), or stay silent. No Howler, no DOM, so it unit-tests like `audio.gate.ts`. The
// consumer (`useMusic`) applies the result and owns the ambient bed and the fade/seek calls.

import type { MusicFit } from './protocol/types'

export type { MusicFit }

export interface MusicPlanInput {
  fit: MusicFit
  /** Track length, seconds. */
  durationS: number
  /** The round's current length, seconds — grows with each +15s extension. */
  roundSeconds: number
  /** Round end, unix ms, on the server clock. */
  deadline: number
  /** Now, unix ms, on the server-estimated clock (see lib/serverClock). */
  now: number
}

export interface MusicPlanResult {
  action: 'play' | 'wait' | 'silent'
  /** Seconds into the track to seek to when playing. */
  offsetS: number
  /** For `wait`: ms until the song should start. */
  startInMs: number
  loop: boolean
}

const SILENT: MusicPlanResult = { action: 'silent', offsetS: 0, startInMs: 0, loop: false }

export function musicPlan({ fit, durationS, roundSeconds, deadline, now }: MusicPlanInput): MusicPlanResult {
  if (durationS <= 0)
    return SILENT

  const remainingS = Math.max(0, (deadline - now) / 1000)
  const elapsedS = Math.max(0, roundSeconds - remainingS)

  if (fit === 'loop')
    return { action: 'play', offsetS: elapsedS % durationS, startInMs: 0, loop: true }

  // `once` and the can't-fit finale both play from the top and simply stop when the track ends.
  if (fit === 'once' || durationS > roundSeconds) {
    return elapsedS < durationS
      ? { action: 'play', offsetS: elapsedS, startInMs: 0, loop: false }
      : SILENT
  }

  // `finale`: start the song late so it finishes exactly on the deadline.
  const songStartS = roundSeconds - durationS
  if (elapsedS < songStartS)
    return { action: 'wait', offsetS: 0, startInMs: (songStartS - elapsedS) * 1000, loop: false }
  if (elapsedS < roundSeconds)
    return { action: 'play', offsetS: elapsedS - songStartS, startInMs: 0, loop: false }
  return SILENT
}
