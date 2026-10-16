// The clock-offset correction: serverTime() must report the *server's* wall clock, not the
// device's, so a device whose clock is skewed still agrees with the room on when the round ends.

import { describe, expect, it, vi } from 'vitest'
import { serverTime, syncServerClock } from '../src/lib/serverClock'

describe('serverClock', () => {
  it('corrects for a skewed local clock, then tracks forward from the server estimate', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
    // This device reads 1000 while the server's clock is 60s ahead.
    syncServerClock(61_000)
    expect(serverTime()).toBe(61_000)
    // 2s later on the device — server time has advanced by the same 2s.
    now.mockReturnValue(3000)
    expect(serverTime()).toBe(63_000)
    now.mockRestore()
  })

  it('keeps the last good offset when serverNow is missing or NaN (older Worker)', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
    syncServerClock(61_000)
    syncServerClock(undefined as unknown as number)
    syncServerClock(Number.NaN)
    expect(serverTime()).toBe(61_000)
    now.mockRestore()
  })
})
