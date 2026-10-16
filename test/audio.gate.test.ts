import { describe, expect, it } from 'vitest'
import { DEFAULT_THROTTLE_MS, shouldPlay } from '../src/lib/audio.gate'

const ALL_ON = { music: true, sfx: true }

describe('shouldPlay gating', () => {
  it('sounds an sfx key only when sfx is on', () => {
    expect(shouldPlay(ALL_ON, 1000, null)).toBe(true)
    expect(shouldPlay({ ...ALL_ON, sfx: false }, 1000, null)).toBe(false)
  })
})

describe('shouldPlay throttle', () => {
  it('sounds on the first trigger, with no prior stamp', () => {
    expect(shouldPlay(ALL_ON, 0, null)).toBe(true)
  })

  it('suppresses a repeat inside the throttle window', () => {
    expect(shouldPlay(ALL_ON, DEFAULT_THROTTLE_MS - 1, 0)).toBe(false)
  })

  it('allows a repeat once the window has elapsed', () => {
    expect(shouldPlay(ALL_ON, DEFAULT_THROTTLE_MS, 0)).toBe(true)
  })
})
