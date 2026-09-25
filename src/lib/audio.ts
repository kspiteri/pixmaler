import type { AudioPrefs, SfxKey } from './audio.gate'
import type { MusicTrackId } from './protocol/types'
import { Howl } from 'howler'
import { ref } from 'vue'
import { asset } from './assets'
import { DEFAULT_AUDIO_PREFS, shouldPlay } from './audio.gate'
import { trackSrc } from './content/music'
import { readStored, writeStored } from './storage'

export type { SfxKey } from './audio.gate'

// The audio engine. Module-level like `lib/theme.ts` — one context, one sprite, one set of prefs
// per document. Howler is imported only here; `audio.gate.ts` holds the pure trigger discipline
// so it tests without a browser. Two channels: `sfx` is one preloaded Web Audio sprite
// (zero-latency, gesture-safe); `music` streams per-track (`html5: true`). Howler's `autoUnlock`
// (on by default) is the autoplay gate, so there's no hand-rolled "arm on first gesture".

const KEY = 'pixmaler:audio'

function storedPrefs(): AudioPrefs {
  const raw = readStored(KEY)
  if (!raw)
    return { ...DEFAULT_AUDIO_PREFS }
  try {
    const p = JSON.parse(raw) as Partial<AudioPrefs>
    return {
      music: typeof p.music === 'boolean' ? p.music : DEFAULT_AUDIO_PREFS.music,
      sfx: typeof p.sfx === 'boolean' ? p.sfx : DEFAULT_AUDIO_PREFS.sfx,
      ticktock: typeof p.ticktock === 'boolean' ? p.ticktock : DEFAULT_AUDIO_PREFS.ticktock,
    }
  }
  catch {
    return { ...DEFAULT_AUDIO_PREFS }
  }
}

const initial = storedPrefs()

// Reactive mirrors: a `ToggleSwitch` in SettingsMenu reads and drives these directly.
export const music = ref(initial.music)
export const sfx = ref(initial.sfx)
export const ticktock = ref(initial.ticktock)

function persist(): void {
  writeStored(KEY, JSON.stringify({ music: music.value, sfx: sfx.value, ticktock: ticktock.value }))
}

function currentPrefs(): AudioPrefs {
  return { music: music.value, sfx: sfx.value, ticktock: ticktock.value }
}

// -- sfx channel ------------------------------------------------------------------------------

// Sprite offsets [startMs, durationMs]. Only `ding` has a placeholder asset today (#94); the
// recorded sprite (#95) swaps the src files and fills the rest of the shot list here — a data
// change, not a code one.
const SPRITE: { [K in string]: [number, number] } = {
  ding: [0, 400],
}

const sfxHowl = new Howl({
  src: [asset('assets/audio/sfx.wav')],
  sprite: SPRITE,
  preload: true,
})

// Per-key last-played stamp for the repeat throttle (see `shouldPlay`).
const lastPlayed = new Map<SfxKey, number>()

/** Sound an sfx key, if its clip exists yet, subject to its channel toggle and the repeat throttle. */
export function playSfx(key: SfxKey): void {
  // A typed key with no clip yet (awaiting the recorded sprite, #95) is a silent no-op, not a warn.
  if (!(key in SPRITE))
    return
  const now = Date.now()
  if (!shouldPlay(key, currentPrefs(), now, lastPlayed.get(key) ?? null))
    return
  lastPlayed.set(key, now)
  sfxHowl.play(key)
}

// -- music channel (#2) -----------------------------------------------------------------------

const MUSIC_VOLUME = 0.4
const MUSIC_FADE_MS = 2000

let musicHowl: Howl | null = null
let musicId: number | undefined

// Reactive so a transport widget can reflect and drive the channel. `music` (the toggle) is the
// master enable; pause/resume and volume are transport, independent of it.
export const currentTrack = ref<MusicTrackId | null>(null)
export const musicPaused = ref(false)
export const musicVolume = ref(MUSIC_VOLUME)

/** Play a streamed, looping track, fading in from silence. Gated on the `music` toggle. */
export function playMusic(track: MusicTrackId, { fadeMs = MUSIC_FADE_MS } = {}): void {
  if (!music.value)
    return
  stopMusic({ fadeMs: 0 })
  const howl = new Howl({ src: [trackSrc(track)], html5: true, loop: true, volume: 0 })
  musicHowl = howl
  currentTrack.value = track
  musicPaused.value = false
  musicId = howl.play()
  howl.fade(0, musicVolume.value, fadeMs, musicId)
}

/** Fade out and unload the current track, if any. */
export function stopMusic({ fadeMs = MUSIC_FADE_MS } = {}): void {
  const howl = musicHowl
  if (!howl)
    return
  musicHowl = null
  musicId = undefined
  currentTrack.value = null
  musicPaused.value = false
  if (fadeMs > 0) {
    howl.once('fade', () => howl.unload())
    howl.fade(howl.volume(), 0, fadeMs)
  }
  else {
    howl.unload()
  }
}

/** Transport: pause the current track in place (it stays loaded). */
export function pauseMusic(): void {
  if (!musicHowl || musicPaused.value)
    return
  musicHowl.pause()
  musicPaused.value = true
}

/** Transport: resume a paused track. */
export function resumeMusic(): void {
  if (!musicHowl || !musicPaused.value)
    return
  musicHowl.play(musicId)
  musicPaused.value = false
}

/** Set the music channel volume (0–1); live, and remembered for the next track. */
export function setMusicVolume(v: number): void {
  musicVolume.value = Math.min(1, Math.max(0, v))
  musicHowl?.volume(musicVolume.value)
}

// -- toggles ----------------------------------------------------------------------------------

export function toggleMusic(): void {
  music.value = !music.value
  persist()
  // Silence the channel immediately when switched off; a switch-on is heard on the next track.
  if (!music.value)
    stopMusic()
}

export function toggleSfx(): void {
  sfx.value = !sfx.value
  persist()
}

export function toggleTicktock(): void {
  ticktock.value = !ticktock.value
  persist()
}
