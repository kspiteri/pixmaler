// Pre-connect gate helpers for the room route, kept Vue-free so they're independently testable
// and can't drift from the socket that uses the same host/party.

import PartySocket from 'partysocket'

// Pre-flight the DO's existence probe before a *join*, so a dead code lands on the 404 screen
// without opening a socket (#66). Fails open — a probe error or timeout lets the socket try,
// with the server's `no-such-room` as the backstop — and reuses PartySocket's own URL/protocol
// resolution so the probe can't drift from the socket.
export async function roomExists(host: string, party: string, room: string): Promise<boolean> {
  try {
    const res = await PartySocket.fetch(
      { host, party, room },
      { signal: AbortSignal.timeout(3000) },
    )
    if (!res.ok)
      return true
    const data = await res.json() as { exists?: boolean }
    return data.exists === true
  }
  catch {
    return true
  }
}

// One live tab per room per browser. Tabs share the localStorage clientId, so a second tab
// would drive a second canvas of the same player. A per-room Web Lock lets only the first tab
// through (`onActive`); a second gets `onDuplicate`, then `onActive` when the first releases
// the lock (its tab closed) and this one takes over. No server involvement; degrades to
// `onActive` where `navigator.locks` is absent (older Safari).
export function acquireRoomTab(
  code: string,
  handlers: { onActive: () => void, onDuplicate: () => void },
): void {
  const locks = navigator.locks as LockManager | undefined
  if (!locks) {
    handlers.onActive()
    return
  }
  const name = `pixmaler:room:${code}`
  void locks.request(name, { ifAvailable: true }, (lock) => {
    if (!lock) {
      // Held by another tab. Show the notice and wait; take over when it releases.
      handlers.onDuplicate()
      void locks.request(name, () => {
        handlers.onActive()
        return new Promise<never>(() => {}) // hold for this tab's lifetime
      })
      return
    }
    handlers.onActive()
    return new Promise<never>(() => {}) // hold for this tab's lifetime
  })
}
