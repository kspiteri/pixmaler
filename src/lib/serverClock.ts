// Client estimate of the server's wall clock. The round deadline is a server timestamp, but
// each client ticks against its own clock, which can drift by seconds; every `state`/`phase`
// push carries a `serverNow`, so measuring the offset on receipt lets co-located devices agree
// on when the round ends (and tightens the plain countdown). Module singleton, like lib/theme.ts.

let offsetMs = 0

/** Record the gap between the server's clock and ours from a freshly-received `serverNow`. */
export function syncServerClock(serverNow: number): void {
  // An older Worker omits the field; ignore it so the offset stays put (0 = our own clock),
  // rather than poisoning every later serverTime() with NaN.
  if (Number.isFinite(serverNow))
    offsetMs = serverNow - Date.now()
}

/** Our best estimate of the server's current wall-clock time, in unix ms. */
export function serverTime(): number {
  return Date.now() + offsetMs
}
