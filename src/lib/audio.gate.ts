// Pure trigger discipline for the audio engine — no Howler, no DOM, so it unit-tests in the
// node vitest environment. `audio.ts` owns the Howler I/O and calls `shouldPlay` before every
// sfx trigger; the tests pin this decision, not the sound.

// The sprite's key set. `click` is the only one with a recorded clip today; the rest are the
// shot list the sprite fills, typed now so consumers compile against it.
export type SfxKey
  = | 'click'
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
}

export const DEFAULT_AUDIO_PREFS: AudioPrefs = { music: true, sfx: true }

// Repeat guard: a burst of the same key (rapid clicks, a stuck key) collapses to one trigger
// per window, so the channel never machine-guns.
export const DEFAULT_THROTTLE_MS = 150

/**
 * Whether an sfx may sound now: the sfx channel must be enabled, and this key's last trigger must
 * be at least `throttleMs` ago. `lastPlayedAt` is null when the key has never played.
 */
export function shouldPlay(
  prefs: AudioPrefs,
  now: number,
  lastPlayedAt: number | null,
  throttleMs: number = DEFAULT_THROTTLE_MS,
): boolean {
  if (!prefs.sfx)
    return false
  return lastPlayedAt === null || now - lastPlayedAt >= throttleMs
}
