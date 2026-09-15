// Per-connection token bucket for the message hot path (#75). Pure: the caller owns the bucket
// map and supplies the clock, so the throttle decision is testable without a Durable Object or
// a socket, the same seam as `./alarm`. A flood is rejected here with O(1) arithmetic, before a
// frame is ever parsed.

export interface Bucket {
  tokens: number
  updatedAt: number // ms epoch of the last take
}

export interface RateLimit {
  capacity: number // bucket size, i.e. the largest burst allowed at once
  refillPerSec: number // sustained rate once the burst is spent
}

// Refill by the time elapsed since the last take (capped at `capacity`), then spend one token
// if any remain. Returns the new bucket and whether this frame is allowed; a fresh connection
// (undefined bucket) starts full. Clock skew (now < updatedAt) adds nothing rather than draining.
export function takeToken(
  bucket: Bucket | undefined,
  now: number,
  limit: RateLimit,
): { allowed: boolean, bucket: Bucket } {
  const prev = bucket ?? { tokens: limit.capacity, updatedAt: now }
  const elapsedSec = Math.max(0, now - prev.updatedAt) / 1000
  const refilled = Math.min(limit.capacity, prev.tokens + elapsedSec * limit.refillPerSec)
  if (refilled < 1)
    return { allowed: false, bucket: { tokens: refilled, updatedAt: now } }
  return { allowed: true, bucket: { tokens: refilled - 1, updatedAt: now } }
}
