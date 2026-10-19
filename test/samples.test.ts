// Every sample's full image and thumbnail must name a bundled file, matched case-sensitively: the
// dev server and Pages answer a miscased path with index.html, so the tile shows a broken image
// and the pick fails to decode.

import { describe, expect, it } from 'vitest'
import { SAMPLES, sampleThumbUrl, sampleUrl } from '../src/lib/content/samples'

// The glob lists real directory entries, so a path only matches with its exact case.
const BUNDLED = new Set(Object.keys(import.meta.glob('../public/assets/samples/**/*.webp')))

function bundledPath(url: string): string {
  return `../public/${url.slice(import.meta.env.BASE_URL.length)}`
}

describe('samples', () => {
  it.each(SAMPLES.map(s => s.id))('%s has a bundled image and thumbnail', (id) => {
    for (const path of [bundledPath(sampleUrl(id)), bundledPath(sampleThumbUrl(id))])
      expect(BUNDLED.has(path), path).toBe(true)
  })

  it('ids are unique, so a stored pick restores the right work', () => {
    expect(new Set(SAMPLES.map(s => s.id)).size).toBe(SAMPLES.length)
  })
})
