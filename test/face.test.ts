// The face is the player's identity across rooms and renames, and it's painted as a CSS
// mask, so two things must hold: the same seed always yields the same face, and nothing
// but the ink lines is opaque — an opaque background or paper fill would flood the chip.

import { beforeAll, describe, expect, it } from 'vitest'
import { faceMask, loadFaces } from '../src/lib/player/face'

const svgOf = (mask: string) => decodeURIComponent(mask.slice(mask.indexOf(',') + 1, -2))
const seeds = Array.from({ length: 60 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)

describe('faceMask', () => {
  beforeAll(loadFaces)

  it('gives a seed the same face every time, and different seeds different faces', () => {
    expect(faceMask(seeds[0])).toBe(faceMask(seeds[0]))
    expect(new Set(seeds.map(faceMask)).size).toBeGreaterThan(seeds.length * 0.9)
  })

  it('leaves everything but the ink lines transparent', () => {
    for (const seed of seeds) {
      const fills = svgOf(faceMask(seed)!).match(/fill="#[0-9a-f]+"/gi) ?? []
      for (const fill of fills)
        expect(fill).toMatch(/^fill="#(?:000000|[0-9a-f]{6}00)"$/i)
    }
  })

  it('has no face for an empty seed, so the chip keeps its initial', () => {
    expect(faceMask('')).toBeNull()
  })
})
