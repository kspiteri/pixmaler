// Every music track's URL must name a file that exists, matched case-sensitively: the dev server
// and Pages both answer a miscased path with index.html, which Howler can't decode, so the player
// hears silence and nothing logs an error. Each track also declares a duration (durationS) in whole
// seconds, regenerated from the files by scripts/probe-music.mjs; it drives the round length.

import { describe, expect, it } from 'vitest'
import { MUSIC_TRACKS, trackSrc } from '../src/lib/content/music'

// The glob lists real directory entries, so a path only matches with its exact case.
const BUNDLED: Record<string, true> = Object.fromEntries(Object.keys(import.meta.glob('../public/assets/audio/music/**/*.webm')).map(path => [path, true]))

describe('trackSrc', () => {
  it.each(MUSIC_TRACKS.map(t => t.id))('%s resolves to a bundled file', (id) => {
    const path = `../public/${trackSrc(id).slice(import.meta.env.BASE_URL.length)}`
    expect(BUNDLED[path] === true, path).toBe(true)
  })
})

describe('track durations', () => {
  it.each(MUSIC_TRACKS.map(t => [t.id, t.durationS] as const))('%s declares a plausible duration', (_id, durationS) => {
    expect(Number.isFinite(durationS)).toBe(true)
    expect(durationS).toBeGreaterThan(0)
    expect(durationS).toBeLessThan(1200)
  })
})

describe('ambient loop', () => {
  it('is bundled (a miscased or missing path would play as silence)', () => {
    const bundled = Object.keys(import.meta.glob('../public/assets/audio/ambient.wav'))
    expect(bundled).toEqual(['../public/assets/audio/ambient.wav'])
  })
})
