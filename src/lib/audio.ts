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

function persist(): void {
  writeStored(KEY, JSON.stringify({ music: music.value, sfx: sfx.value }))
}

function currentPrefs(): AudioPrefs {
  return { music: music.value, sfx: sfx.value }
}

// -- sfx channel ------------------------------------------------------------------------------

// Sprite offsets [startMs, durationMs]. Only `click` has a clip today; filling the rest of the
// shot list swaps the src file and adds offsets here — a data change, not a code one.
const SPRITE: { [K in string]: [number, number] } = {
  click: [0, 120],
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
  // A typed key with no clip yet (awaiting the recorded sprite) is a silent no-op, not a warn.
  if (!(key in SPRITE))
    return
  const now = Date.now()
  if (!shouldPlay(currentPrefs(), now, lastPlayed.get(key) ?? null))
    return
  lastPlayed.set(key, now)
  sfxHowl.play(key)
}

// -- music channel ----------------------------------------------------------------------------

const MUSIC_VOLUME = 0.4
const MUSIC_FADE_MS = 2000

let musicHowl: Howl | null = null
let musicId: number | undefined

// Reactive so a transport widget can reflect and drive the channel. `music` (the toggle) is the
// master enable; pause/resume and volume are transport, independent of it.
export const currentTrack = ref<MusicTrackId | null>(null)
export const musicPaused = ref(false)
export const musicVolume = ref(MUSIC_VOLUME)
// The track that last failed to load; cleared when a track plays or the music stops.
export const musicError = ref<MusicTrackId | null>(null)
// Whether the widget's song + volume panel is open; session-only, shared across phase headers.
export const musicControlsOpen = ref(false)

/** Play a streamed track (looping by default), fading in from silence. Gated on the `music` toggle. */
export function playMusic(track: MusicTrackId, opts: { fadeMs?: number, offsetS?: number, loop?: boolean, onEnd?: () => void } = {}): void {
  const { fadeMs = MUSIC_FADE_MS, offsetS = 0, loop = true, onEnd } = opts
  if (!music.value)
    return
  stopMusic({ fadeMs: 0 })
  const howl: Howl = new Howl({
    src: [trackSrc(track)],
    html5: true,
    loop,
    volume: 0,
    onloaderror: () => {
      if (howl !== musicHowl)
        return
      stopMusic({ fadeMs: 0 })
      musicError.value = track
    },
    // An autoplay lock refuses the first play; Howler fires 'unlock' on the next gesture.
    onplayerror: () => {
      howl.once('unlock', () => {
        if (howl === musicHowl && !musicPaused.value)
          howl.play(musicId)
      })
    },
    // A non-looping track (once/finale) ends by itself; tell the consumer so the ambient bed can
    // cover the rest of the phase.
    onend: () => {
      if (howl === musicHowl && !loop)
        onEnd?.()
    },
  })
  musicHowl = howl
  currentTrack.value = track
  musicPaused.value = false
  musicId = howl.play()
  // Seek once playback has actually begun: a streamed html5 track ignores an early seek, and
  // Howler reports position only from 'play'. This is what lands a late joiner at the synced spot.
  if (offsetS > 0)
    howl.once('play', () => howl.seek(offsetS, musicId))
  howl.fade(0, musicVolume.value, fadeMs, musicId)
}

/** Fade out and unload the current track, if any. */
export function stopMusic({ fadeMs = MUSIC_FADE_MS } = {}): void {
  const howl = musicHowl
  const id = musicId
  musicError.value = null
  if (!howl)
    return
  musicHowl = null
  musicId = undefined
  currentTrack.value = null
  musicPaused.value = false
  if (fadeMs > 0) {
    // Fade from the stored volume — howl.volume() reads 0 here — then unload on a timer, since a
    // fade that changes nothing (iOS, already silent) never fires 'fade' and would leak the track.
    howl.fade(musicVolume.value, 0, fadeMs, id)
    setTimeout(() => howl.unload(), fadeMs)
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

// -- ambient channel --------------------------------------------------------------------------

// A short, calm loop that fills the gaps the chosen song leaves — the finale lead-in, the tail
// after it ends, and the VOTING/RESULTS gallery. Preloaded Web Audio (not html5) so it loops
// click-free, unlike the streamed music channel. Gated on the same `music` toggle as tracks.

const AMBIENT_VOLUME = 0.3
let ambientHowl: Howl | null = null
let ambientActive = false
let ambientStopTimer: number | null = null

/** Fade the ambient bed in (looping); no-op if the music toggle is off or it's already up. */
export function playAmbient({ fadeMs = MUSIC_FADE_MS } = {}): void {
  if (!music.value || ambientActive)
    return
  ambientActive = true
  if (ambientStopTimer) {
    clearTimeout(ambientStopTimer)
    ambientStopTimer = null
  }
  ambientHowl ??= new Howl({ src: [asset('assets/audio/ambient.wav')], loop: true, volume: 0 })
  // Reuse the single instance: if a fade-out was in flight it's still playing, so just fade back up.
  if (!ambientHowl.playing())
    ambientHowl.play()
  ambientHowl.fade(ambientHowl.volume(), AMBIENT_VOLUME, fadeMs)
}

/** Fade the ambient bed out and stop it; it stays loaded for the next gap. */
export function stopAmbient({ fadeMs = MUSIC_FADE_MS } = {}): void {
  const howl = ambientHowl
  if (!howl || !ambientActive)
    return
  ambientActive = false
  if (fadeMs > 0) {
    howl.fade(howl.volume(), 0, fadeMs)
    ambientStopTimer = setTimeout(() => { howl.stop(); ambientStopTimer = null }, fadeMs)
  }
  else {
    howl.stop()
  }
}

// -- toggles ----------------------------------------------------------------------------------

export function toggleMusic(): void {
  music.value = !music.value
  persist()
  // Silence the channel immediately when switched off; a switch-on is heard on the next track.
  if (!music.value) {
    stopMusic()
    stopAmbient()
  }
}

export function toggleSfx(): void {
  sfx.value = !sfx.value
  persist()
}
