// The browser-local player identity — the single owner of the `pixmaler:clientId`,
// `pixmaler:name` and `pixmaler:shape` localStorage keys. Everything that reads or
// writes them goes through here, so the keys and their handling live in exactly one
// place: before this, `pixmaler:name` was touched raw in `App.vue`, `Entry.vue` and
// `Lobby.vue`, and `App.vue`'s "one place owns the key" comment was already untrue.
//
// Module-level, not a composable, and deliberately not reactive: identity is
// per-document and set at most once per screen — the same reasoning as `lib/theme.ts`,
// which owns `pixmaler:theme` the same way. Callers hold the value they read.

import type { AvatarShape } from './types'
import { normaliseShape } from './types'

const CLIENT_ID = 'pixmaler:clientId'
const NAME = 'pixmaler:name'
const SHAPE = 'pixmaler:shape'

// A stable per-browser id so a reconnect reclaims the same player slot. Minted on
// first read and persisted; every later call returns the same value.
export function getClientId(): string {
  let id = localStorage.getItem(CLIENT_ID)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(CLIENT_ID, id)
  }
  return id
}

// The chosen display name, or null when the player hasn't picked one yet — the room
// route shows the name gate on null. It is deliberately NOT minted here: a bot that
// merely loads a room URL must not acquire a name (and therefore a socket, and
// therefore a ghost player).
export function getName(): string | null {
  return localStorage.getItem(NAME)?.trim() || null
}

export function setName(name: string): void {
  localStorage.setItem(NAME, name)
}

// The chosen avatar shape, validated through the shared `normaliseShape` — the same
// predicate the server runs on receipt, so an old or hand-edited key degrades to the
// default identically on both sides.
export function getShape(): AvatarShape {
  return normaliseShape(localStorage.getItem(SHAPE))
}

export function setShape(shape: AvatarShape): void {
  localStorage.setItem(SHAPE, shape)
}

// Wipe every `pixmaler:*` key — the "clear my data" action (#44). Deliberately broad:
// it takes identity (name, clientId, shape) *and* preferences (theme, text size), since
// the control promises to clear everything. The caller then reloads to Entry, which
// closes any open socket. `Object.keys` snapshots, so mutating in the loop is safe.
export function clearAllData(): void {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('pixmaler:'))
      localStorage.removeItem(key)
  }
}
