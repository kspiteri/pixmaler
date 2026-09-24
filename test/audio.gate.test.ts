import { describe, expect, it } from 'vitest'
import { channelForKey, DEFAULT_THROTTLE_MS, shouldPlay } from '../src/lib/audio.gate'

const ALL_ON = { music: true, sfx: true, ticktock: true }

describe('channelForKey', () => {
  it('routes tick and tock to the ticktock toggle', () => {
    expect(channelForKey('tick')).toBe('ticktock')
    expect(channelForKey('tock')).toBe('ticktock')
  })

  it('routes every other key to the sfx toggle', () => {
    expect(channelForKey('ding')).toBe('sfx')
    expect(channelForKey('vote')).toBe('sfx')
    expect(channelForKey('winner')).toBe('sfx')
  })
})

describe('shouldPlay gating', () => {
  it('sounds an sfx key only when sfx is on', () => {
    expect(shouldPlay('ding', ALL_ON, 1000, null)).toBe(true)
    expect(shouldPlay('ding', { ...ALL_ON, sfx: false }, 1000, null)).toBe(false)
  })

  it('gates tick/tock on ticktock, independent of the sfx toggle', () => {
    // Effects on, countdown off: no tick.
    expect(shouldPlay('tick', { ...ALL_ON, ticktock: false }, 1000, null)).toBe(false)
    // Countdown on, general effects off: tick still sounds.
    expect(shouldPlay('tick', { music: true, sfx: false, ticktock: true }, 1000, null)).toBe(true)
  })
})

describe('shouldPlay throttle', () => {
  it('sounds on the first trigger, with no prior stamp', () => {
    expect(shouldPlay('ding', ALL_ON, 0, null)).toBe(true)
  })

  it('suppresses a repeat inside the throttle window', () => {
    expect(shouldPlay('ding', ALL_ON, DEFAULT_THROTTLE_MS - 1, 0)).toBe(false)
  })

  it('allows a repeat once the window has elapsed', () => {
    expect(shouldPlay('ding', ALL_ON, DEFAULT_THROTTLE_MS, 0)).toBe(true)
  })
})
