// The /paint sandbox's stored session and the "does this new target clear the drawing" check.
// A session outlives code changes, so an older blob must still restore the player's drawing,
// and a bad picker field must cost the picker hydration, never the drawing.

import type { PickerSettings, PipelineResult } from '../src/lib/canvas/pipeline'
import { describe, expect, it } from 'vitest'
import { keepsDrawing, parsePaintSession } from '../src/lib/prefs/paintSession'

const result: PipelineResult = {
  gridW: 2,
  gridH: 2,
  palette: ['#000000', '#ffffff'],
  targetGrid: [0, 1, 1, 0],
  sourceW: 200,
  sourceH: 200,
}
const settings: PickerSettings = {
  scale: 8,
  colorCount: 16,
  pixelationStyle: 'balanced',
  ratio: 'square',
  crop: { cx: 0.5, cy: 0.4, zoom: 0.8 },
  background: '#ffffff',
}
const grid = [1, -1, -1, 0]

describe('parsePaintSession', () => {
  it('restores a session saved before the picker settings were stored', () => {
    const s = parsePaintSession(JSON.stringify({ result, meta: { source: 'Mona Lisa' }, grid }))
    expect(s?.grid).toEqual(grid)
    expect(s?.meta).toEqual({ source: 'Mona Lisa' })
  })

  it('round-trips the sample and settings the picker rebuilds from', () => {
    const meta = { source: 'Mona Lisa', sample: 'monalisa', settings }
    expect(parsePaintSession(JSON.stringify({ result, meta, grid }))?.meta).toEqual(meta)
  })

  it('keeps an upload as having no sample', () => {
    const meta = { source: 'holiday.jpg', sample: null, settings }
    expect(parsePaintSession(JSON.stringify({ result, meta, grid }))?.meta.sample).toBeNull()
  })

  it.each([
    ['an unknown ratio', { ...settings, ratio: 'panorama' }],
    ['an unknown pixelation style', { ...settings, pixelationStyle: 'blurry' }],
    ['a crop with a missing field', { ...settings, crop: { cx: 0.5, cy: 0.5 } }],
    ['a non-hex background', { ...settings, background: 'url(x)' }],
    ['a non-numeric scale', { ...settings, scale: '8' }],
  ])('drops settings with %s but still restores the drawing', (_, bad) => {
    const s = parsePaintSession(JSON.stringify({ result, meta: { source: 'Mona Lisa', sample: 'monalisa', settings: bad }, grid }))
    expect(s?.grid).toEqual(grid)
    expect(s?.meta).toEqual({ source: 'Mona Lisa' })
  })

  it('refuses a drawing that does not fit the stored grid', () => {
    expect(parsePaintSession(JSON.stringify({ result, meta: { source: 'x' }, grid: [0, 0, 0] }))).toBeNull()
  })

  it('refuses absent or corrupt storage', () => {
    expect(parsePaintSession(null)).toBeNull()
    expect(parsePaintSession('{not json')).toBeNull()
  })
})

describe('keepsDrawing', () => {
  it('keeps the drawing when only the target changes', () => {
    expect(keepsDrawing(result, { ...result, targetGrid: [1, 1, 1, 1] })).toBe(true)
  })

  it('clears it when the grid size changes', () => {
    expect(keepsDrawing(result, { ...result, gridW: 3, targetGrid: [0, 0, 0, 0, 0, 0] })).toBe(false)
  })

  it('clears it when the palette changes, even to the same colours reordered', () => {
    expect(keepsDrawing(result, { ...result, palette: ['#ffffff', '#000000'] })).toBe(false)
    expect(keepsDrawing(result, { ...result, palette: ['#000000', '#ffffff', '#ff0000'] })).toBe(false)
  })
})
