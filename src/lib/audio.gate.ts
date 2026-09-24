// Pure trigger discipline for the audio engine — no Howler, no DOM, so it unit-tests in the
// node vitest environment. `audio.ts` owns the Howler I/O and calls `shouldPlay` before every
// sfx trigger; the tests pin this decision, not the sound.

// The sprite's key set. `ding` is the only one with a placeholder asset today (#94); the rest
// are the shot list the recorded sprite (#95) fills, typed now so consumers compile against it.
export type SfxKey
  = | 'ding'
    | 'tick'
    | 'tock'
    | 'submit'
    | 'join'
    | 'leave'
    | 'vote'
    | 'phase'
    | 'winner'
    | 'error'

export interface AudioPrefs {
  music: boolean
  sfx: boolean
  ticktock: boolean
}

export const DEFAULT_AUDIO_PREFS: AudioPrefs = { music: true, sfx: true, ticktock: true }

// The countdown pressure is its own opt-out, split from general effects: some players want
// sfx but not the ticking clock.
const TICKTOCK_KEYS = new Set<SfxKey>(['tick', 'tock'])

// Repeat guard: a burst of the same key (rapid clicks, a stuck key) collapses to one trigger
// per window, so the channel never machine-guns.
export const DEFAULT_THROTTLE_MS = 150

/** Which toggle gates a given sfx key. */
export function channelForKey(key: SfxKey): 'sfx' | 'ticktock' {
  return TICKTOCK_KEYS.has(key) ? 'ticktock' : 'sfx'
}

/**
 * Whether an sfx `key` may sound now: its channel must be enabled, and its last trigger must be
 * at least `throttleMs` ago. `lastPlayedAt` is null when the key has never played.
 */
export function shouldPlay(
  key: SfxKey,
  prefs: AudioPrefs,
  now: number,
  lastPlayedAt: number | null,
  throttleMs: number = DEFAULT_THROTTLE_MS,
): boolean {
  if (!prefs[channelForKey(key)])
    return false
  return lastPlayedAt === null || now - lastPlayedAt >= throttleMs
}
