// Pre-connect helpers for the room route and Entry's code field, kept Vue-free so they're
// independently testable and can't drift from the socket that uses the same host/party.

import PartySocket from 'partysocket'

export const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST ?? '127.0.0.1:1999'
// The kebab-cased Durable Object binding name (PixmalerServer → "pixmaler-server"); the socket
// and the existence probe both address the room through it.
export const PARTY_NAME = 'pixmaler-server'

// Asks the room whether anyone is in it, without opening a socket: Entry's code field checks
// before navigating, and the room route before a *join*, so a dead code never reaches the server
// as a join. Fails open (a probe error or timeout lets the socket try, with the server's
// `no-such-room` as the backstop) and uses PartySocket's own URL resolution so it can't drift.
export async function roomExists(room: string): Promise<boolean> {
  try {
    const res = await PartySocket.fetch(
      { host: PARTYKIT_HOST, party: PARTY_NAME, room },
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
