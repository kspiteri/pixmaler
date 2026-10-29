// Likeness: how close a drawing came to the round's target, from 0 to 100. The black/white
// expectations are worked by hand (a cell is either exactly right or as far off as the palette
// allows); the colour fixture pins the shading between those extremes.

import { describe, expect, it } from 'vitest'
import { likenessScorer } from '../party/likeness'

const BW = ['#000000', '#ffffff']
const CHECKER = [0, 1, 1, 0]
// Red, a near-duplicate dark red, blue and white. White is the furthest colour from red;
// dark red is the furthest from white.
const RGBW = ['#dc2828', '#b41e1e', '#283cc8', '#ffffff']
const [RED, DARK_RED, BLUE, WHITE] = [0, 1, 2, 3]
const SCENE = [RED, RED, RED, BLUE, WHITE, WHITE, BLUE, RED]

describe('likeness', () => {
  it('scores an exact copy 100', () => {
    expect(likenessScorer(CHECKER, BW)(CHECKER)).toBe(100)
    expect(likenessScorer(SCENE, RGBW)(SCENE)).toBe(100)
  })

  it('rescales against the best bucket fill, then lifts it with a square-root curve', () => {
    // Either single-colour fill gets half the cells right (raw 0.5). Three right is raw 0.75,
    // rescaled (0.75 - 0.5) / (1 - 0.5) = 0.5, and √0.5 = 0.707.
    expect(likenessScorer(CHECKER, BW)([0, 1, 1, 1])).toBe(71)
  })

  it('gives a wiped canvas no likeness at all, whatever the palette', () => {
    expect(likenessScorer(CHECKER, BW)([-1, -1, -1, -1])).toBeNull()
    expect(likenessScorer([1, 1, 1, 1], BW)([-1, -1, -1, -1])).toBeNull()
    expect(likenessScorer([0, 0, 0, 0], ['#ff0000'])([-1, -1, -1, -1])).toBeNull()
  })

  it.each(RGBW.map((_, k) => k))('scores a bucket fill of palette colour %i as 0', (k) => {
    expect(likenessScorer(SCENE, RGBW)(SCENE.map(() => k))).toBe(0)
  })

  it('scores periodic noise 0', () => {
    const target = Array.from<number[]>({ length: 8 }).fill(SCENE).flat()
    const noise = target.map((_, i) => (i * 37 + 11) % RGBW.length)
    expect(likenessScorer(target, RGBW)(noise)).toBe(0)
  })

  it('scores random noise 0 on a realistic 16 x 16 target', () => {
    // Blocky 4 x 4 regions, as a quantised image has; noise is seeded so the test is stable.
    const target = Array.from({ length: 256 }, (_, i) => (Math.floor(i / 64) + Math.floor((i % 16) / 4)) % RGBW.length)
    const score = likenessScorer(target, RGBW)
    let seed = 7
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    for (let trial = 0; trial < 50; trial++)
      expect(score(target.map(() => Math.floor(next() * RGBW.length))), `trial ${trial}`).toBe(0)
  })

  it('never drops as more cells are copied, always as a whole number', () => {
    const target = Array.from<number[]>({ length: 8 }).fill(SCENE).flat()
    const score = likenessScorer(target, RGBW)
    const scores = [8, 16, 24, 32, 40, 48, 56, 64].map(k => score(target.map((c, i) => (i < k ? c : -1)))!)
    for (const s of scores)
      expect(Number.isInteger(s)).toBe(true)
    for (let i = 1; i < scores.length; i++)
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1])
    expect(scores.at(-1)).toBe(100)
    expect(new Set(scores).size).toBeGreaterThan(2)
  })

  it('gives a near-duplicate shade most of the credit, but never a perfect score', () => {
    const score = likenessScorer(SCENE, RGBW)
    const nearMiss = [DARK_RED, RED, RED, BLUE, WHITE, WHITE, BLUE, RED]
    const farMiss = [BLUE, RED, RED, BLUE, WHITE, WHITE, BLUE, RED]
    expect(score(nearMiss)).toBe(98)
    expect(score(farMiss)).toBeLessThan(score(nearMiss)!)
  })

  it('keeps 100 for an exact copy: one wrong cell on a large grid shows 99', () => {
    const target = Array.from<number[]>({ length: 300 }).fill(SCENE).flat()
    const oneOff = [...target]
    oneOff[0] = BLUE
    expect(likenessScorer(target, RGBW)(oneOff)).toBe(99)
  })

  it('scores an untouched cell the same as the furthest palette colour for its target, not as paper', () => {
    const score = likenessScorer(SCENE, RGBW)
    // Furthest from red and from blue is white; furthest from white is dark red.
    for (const [i, furthest] of [[0, WHITE], [3, WHITE], [4, DARK_RED]] as const) {
      const untouched = [...SCENE]
      untouched[i] = -1
      const painted = [...SCENE]
      painted[i] = furthest
      expect(score(untouched), `cell ${i}`).toBe(score(painted))
      expect(score(untouched), `cell ${i}`).toBeLessThan(100)
    }
  })

  it('scores every drawing 0 when one bucket fill already reproduces the target', () => {
    const flat = [1, 1, 1, 1]
    expect(likenessScorer(flat, BW)(flat)).toBe(0)
    expect(likenessScorer(flat, BW)([1, 1, -1, -1])).toBe(0)
  })

  it('scores any painted drawing 100 when the palette has a single colour', () => {
    expect(likenessScorer([0, 0, 0, 0], ['#ff0000'])([0, 0, 0, -1])).toBe(100)
  })

  it('gives a grid of the wrong size no likeness', () => {
    expect(likenessScorer(CHECKER, BW)([0, 1])).toBeNull()
  })
})
