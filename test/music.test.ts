// Every music track's URL must name a file that exists, matched case-sensitively: the dev server
// and Pages both answer a miscased path with index.html, which Howler can't decode, so the player
// hears silence and nothing logs an error.

import { describe, expect, it } from 'vitest'
import { MUSIC_TRACKS, trackSrc } from '../src/lib/content/music'

// The glob lists real directory entries, so a path only matches with its exact case.
const BUNDLED = new Set(Object.keys(import.meta.glob('../public/assets/audio/music/**/*.webm')))

describe('trackSrc', () => {
  it.each(MUSIC_TRACKS.map(t => t.id))('%s resolves to a bundled file', (id) => {
    const path = `../public/${trackSrc(id).slice(import.meta.env.BASE_URL.length)}`
    expect(BUNDLED.has(path), path).toBe(true)
  })
})
