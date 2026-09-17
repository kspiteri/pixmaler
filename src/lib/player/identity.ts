// The browser-local player identity — the single owner of the `pixmaler:clientId`,
// `pixmaler:name` and `pixmaler:shape` localStorage keys. Everything that reads or writes
// them goes through here, so the keys live in exactly one place.
//
// Module-level, not a composable, and deliberately not reactive: identity is per-document
// and set at most once per screen. Callers hold the value they read.

import type { AvatarShape } from '../protocol/types'
import { normaliseShape } from '../protocol/types'
import { readStored, removeStored, storedKeys, writeStored } from '../storage'

const CLIENT_ID = 'pixmaler:clientId'
const NAME = 'pixmaler:name'
const SHAPE = 'pixmaler:shape'
const SECRETS = 'pixmaler:secrets'

// A stable per-browser id so a reconnect reclaims the same player slot. Minted on
// first read and persisted; every later call returns the same value.
export function getClientId(): string {
  let id = readStored(CLIENT_ID)
  if (!id) {
    id = crypto.randomUUID()
    writeStored(CLIENT_ID, id)
  }
  return id
}

// The chosen display name, or null when the player hasn't picked one yet — the room
// route shows the name gate on null. It is deliberately NOT minted here: a bot that
// merely loads a room URL must not acquire a name (and therefore a socket, and
// therefore a ghost player).
export function getName(): string | null {
  return readStored(NAME)?.trim() || null
}

export function setName(name: string): void {
  writeStored(NAME, name)
}

// The chosen avatar shape, validated through the shared `normaliseShape` — the same
// predicate the server runs on receipt, so an old or hand-edited key degrades to the
// default identically on both sides.
export function getShape(): AvatarShape {
  return normaliseShape(readStored(SHAPE))
}

export function setShape(shape: AvatarShape): void {
  writeStored(SHAPE, shape)
}

// The seat secrets proving ownership of each room's slot on reconnect, keyed by room in a
// single `pixmaler:secrets` object. Each entry is the secret plus its write time,
// so a closed room's secret is aged out on the next write.
const SECRET_MAX_AGE_MS = 48 * 60 * 60 * 1000 // 48 hrs

type SecretMap = Record<string, { s: string, t: number }>

function readSecrets(): SecretMap {
  const raw = readStored(SECRETS)
  if (!raw)
    return {}
  try {
    const v = JSON.parse(raw) as SecretMap
    return v && typeof v === 'object' ? v : {}
  }
  catch {
    return {}
  }
}

export function getSecret(room: string): string | null {
  return readSecrets()[room]?.s ?? null
}

export function setSecret(room: string, secret: string): void {
  const cutoff = Date.now() - SECRET_MAX_AGE_MS
  const secrets = readSecrets()
  secrets[room] = { s: secret, t: Date.now() }
  // Prune stale rooms on the way out — this write is the one place the set grows.
  for (const [key, entry] of Object.entries(secrets)) {
    if (typeof entry?.t !== 'number' || entry.t < cutoff)
      delete secrets[key]
  }
  writeStored(SECRETS, JSON.stringify(secrets))
}

// Wipe every `pixmaler:*` key — the "clear my data" action. Deliberately broad: it takes
// identity (name, clientId, shape) *and* preferences (theme, text size), since the control
// promises to clear everything. The caller then reloads to Entry, which closes any open
// socket. `Object.keys` snapshots, so mutating in the loop is safe.
export function clearAllData(): void {
  for (const key of storedKeys()) {
    if (key.startsWith('pixmaler:'))
      removeStored(key)
  }
}
