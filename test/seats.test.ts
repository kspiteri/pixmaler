// Seat identity — the colour, letter and lean a player carries across the lobby
// roster and the results screen.
//
// The interesting part is the initial. `charAt(0)` used to be wrong in a way that
// looked fine in ASCII: it returns the lone high surrogate for any astral
// character, so every emoji in a Unicode block collapsed to one unpaired
// surrogate. 🎨 and 🎭 rendered the same tofu glyph AND landed on the same lean,
// because both share \uD83C and 0xD83C % 4 === 0. These tests pin the code-point
// behaviour so a "simplification" back to charAt/[0] fails loudly.

import { describe, expect, it } from 'vitest'
import { SEAT_COUNT, seatFor } from '../src/lib/seats'
import { DEFAULT_AVATAR_SHAPE } from '../src/lib/types'

const player = (name: string, shape = 'circle') => ({ name, shape } as Parameters<typeof seatFor>[1])

describe('seatFor', () => {
  it('returns null for a player who is not in the roster', () => {
    expect(seatFor(-1, player('ray'))).toBeNull()
  })

  it('maps the seat to a colour custom property, never a literal', () => {
    expect(seatFor(0, player('ray'))?.colour).toBe('var(--player-colour-0)')
    expect(seatFor(5, player('ray'))?.colour).toBe('var(--player-colour-5)')
  })

  it('wraps past the end of the ramp instead of falling off it', () => {
    // A 22nd player reuses seat 0 rather than pointing at an undefined property.
    expect(seatFor(SEAT_COUNT, player('ray'))?.colour).toBe('var(--player-colour-0)')
    expect(seatFor(SEAT_COUNT + 3, player('ray'))?.colour).toBe('var(--player-colour-3)')
  })

  it('takes the first letter, uppercased and trimmed', () => {
    expect(seatFor(0, player('ray'))?.initial).toBe('R')
    expect(seatFor(0, player('  keith'))?.initial).toBe('K')
    expect(seatFor(0, player('Ångström'))?.initial).toBe('Å')
  })

  it('falls back to ? for a name with no usable character', () => {
    // Without the fallback, codePointAt(0) below is undefined and the lean lookup
    // returns undefined — an invalid multiplier reaching the style binding.
    for (const name of ['', '   ', '\t\n'])
      expect(seatFor(0, player(name))?.initial).toBe('?')
  })

  it('keeps an astral character whole rather than splitting the surrogate pair', () => {
    expect(seatFor(0, player('🎨 painter'))?.initial).toBe('🎨')
    expect(seatFor(0, player('🎭 actor'))?.initial).toBe('🎭')
  })

  it('gives emoji from the same Unicode block different leans', () => {
    // The regression: both of these share a high surrogate, so a charAt(0)
    // implementation gives them an identical lean.
    const art = seatFor(0, player('🎨 painter'))!
    const mask = seatFor(0, player('🎭 actor'))!
    expect(art.lean).not.toBe(mask.lean)
  })

  it('always produces a finite lean', () => {
    const names = ['ray', 'keith', '🎨', '🎭', '?', 'Ø', '1', 'z', '   x']
    for (const name of names) {
      const lean = seatFor(0, player(name))!.lean
      expect(Number.isFinite(lean)).toBe(true)
      expect(Math.abs(lean)).toBeLessThanOrEqual(1)
    }
  })

  it('gives a player the same lean and colour every time', () => {
    // Identity, not decoration: the same inputs must always agree.
    expect(seatFor(4, player('keith'))).toEqual(seatFor(4, player('keith')))
  })

  it('normalises the shape, so a newer client cannot emit avatar--undefined', () => {
    expect(seatFor(0, player('ray', 'hexagon'))?.shape).toBe('hexagon')
    expect(seatFor(0, player('ray', 'triangle'))?.shape).toBe(DEFAULT_AVATAR_SHAPE)
    // Built inline: the helper's default would swallow an absent shape.
    expect(seatFor(0, { name: 'ray' } as Parameters<typeof seatFor>[1])?.shape).toBe(DEFAULT_AVATAR_SHAPE)
  })
})
