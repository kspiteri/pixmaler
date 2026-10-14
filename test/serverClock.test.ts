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

  it('ignores a missing serverNow (older Worker) so it falls back to the local clock', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(5000)
    syncServerClock(5000) // offset 0 — in sync
    syncServerClock(undefined as unknown as number)
    expect(serverTime()).toBe(5000) // unchanged, not NaN
    now.mockRestore()
  })
})
