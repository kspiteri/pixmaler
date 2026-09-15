// The message hot-path throttle (#75). `takeToken` is the whole decision — a flood is refused
// here before a frame is parsed — so its refill and burst behaviour is pinned directly, the
// same pure-function seam as `alarm`.

import type { Bucket, RateLimit } from '../party/rateLimit'
import { describe, expect, it } from 'vitest'
import { takeToken } from '../party/rateLimit'

const limit: RateLimit = { capacity: 3, refillPerSec: 1 }

// Drive a sequence of takes at the given instants (ms), threading the bucket through as the DO
// does, and collect the allow/deny for each.
function run(times: number[], l: RateLimit = limit): boolean[] {
  let bucket: Bucket | undefined
  return times.map((now) => {
    const r = takeToken(bucket, now, l)
    bucket = r.bucket
    return r.allowed
  })
}

describe('takeToken', () => {
  it('starts full and allows a burst up to capacity, then blocks', () => {
    expect(run([0, 0, 0, 0])).toEqual([true, true, true, false])
  })

  it('refills at the sustained rate once the burst is spent', () => {
    // Spend the burst at t=0, then one token arrives per second (refillPerSec: 1).
    expect(run([0, 0, 0, 0, 1000])).toEqual([true, true, true, false, true])
  })

  it('never refills beyond capacity, however long the wait', () => {
    // One spent at t=0, then a long wait tops up to `capacity` and no further: 3 more, not 60+.
    expect(run([0, 60_000, 60_000, 60_000, 60_000])).toEqual([true, true, true, true, false])
  })

  it('grants a fractional refill only once a whole token has accrued', () => {
    // Half a second is 0.5 tokens — still short after the burst; a full second later, allowed.
    expect(run([0, 0, 0, 500, 1000])).toEqual([true, true, true, false, true])
  })

  it('ignores a backwards clock rather than crediting or draining', () => {
    // Spend all three at t=1000, then a take at t=0 must find none (elapsed clamps to 0).
    expect(run([1000, 1000, 1000, 0])).toEqual([true, true, true, false])
  })
})
