// The pure music planner — every fit and the boundaries that are easy to get wrong: the finale
// lead-in gap, a song exactly the round's length, a song longer than the round (cut short, no
// seek), a late joiner syncing mid-track, and the past-the-deadline tail.

import type { MusicFit } from '../src/lib/musicPlan'
import { describe, expect, it } from 'vitest'
import { musicPlan } from '../src/lib/musicPlan'

// Plan from a readable (fit, duration, round, elapsed) rather than raw timestamps: `now` is fixed
// at 0 and the deadline is derived from how far into the round we are.
function plan(fit: MusicFit, durationS: number, roundSeconds: number, elapsedS: number) {
  const deadline = (roundSeconds - elapsedS) * 1000
  return musicPlan({ fit, durationS, roundSeconds, deadline, now: 0 })
}

describe('musicPlan', () => {
  it('stays silent with no track', () => {
    expect(plan('loop', 0, 120, 0).action).toBe('silent')
  })

  describe('loop', () => {
    it('plays looping, seeking to the position within the loop', () => {
      expect(plan('loop', 80, 120, 0)).toEqual({ action: 'play', offsetS: 0, startInMs: 0, loop: true })
      // 90s into a round, an 80s loop is 10s into its second pass.
      expect(plan('loop', 80, 240, 90)).toMatchObject({ action: 'play', offsetS: 10, loop: true })
    })

    it('syncs a late joiner to the same position', () => {
      expect(plan('loop', 80, 240, 200)).toMatchObject({ action: 'play', offsetS: 200 % 80 })
    })
  })

  describe('once', () => {
    it('plays from the current position until the track ends, then silent', () => {
      expect(plan('once', 80, 200, 50)).toMatchObject({ action: 'play', offsetS: 50, loop: false })
      expect(plan('once', 80, 200, 100).action).toBe('silent')
    })
  })

  describe('finale (song fits the round)', () => {
    // round 120, song 80 → the song should start at 40s so it ends on the deadline.
    it('waits through the lead-in gap with ambient', () => {
      expect(plan('finale', 80, 120, 10)).toEqual({ action: 'wait', offsetS: 0, startInMs: 30_000, loop: false })
    })

    it('starts the song from the top at the lead-in boundary', () => {
      expect(plan('finale', 80, 120, 40)).toMatchObject({ action: 'play', offsetS: 0, loop: false })
    })

    it('seeks a late joiner into the already-running finale', () => {
      expect(plan('finale', 80, 120, 100)).toMatchObject({ action: 'play', offsetS: 60 })
    })

    it('goes silent once the song has finished on the deadline', () => {
      expect(plan('finale', 80, 120, 120).action).toBe('silent')
    })

    it('treats a song exactly the round length as a finale from 0:00', () => {
      expect(plan('finale', 80, 80, 0)).toMatchObject({ action: 'play', offsetS: 0 })
    })
  })

  describe('finale (song longer than the round)', () => {
    it('plays from the top, cut short at the deadline (no mid-song seek)', () => {
      expect(plan('finale', 80, 60, 0)).toMatchObject({ action: 'play', offsetS: 0, loop: false })
      expect(plan('finale', 80, 60, 30)).toMatchObject({ action: 'play', offsetS: 30, loop: false })
      expect(plan('finale', 80, 60, 60).action).toBe('silent')
    })
  })

  it('clamps a now past the deadline rather than seeking backwards', () => {
    // Deadline already gone: remaining floors at 0, elapsed at the full round — not beyond.
    expect(musicPlan({ fit: 'finale', durationS: 80, roundSeconds: 120, deadline: -5000, now: 0 }).action).toBe('silent')
    expect(musicPlan({ fit: 'loop', durationS: 80, roundSeconds: 120, deadline: -5000, now: 0 })).toMatchObject({ offsetS: 120 % 80 })
  })
})
