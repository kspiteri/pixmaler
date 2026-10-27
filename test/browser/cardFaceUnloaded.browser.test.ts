// Share card before the face generator loads — its own file so nothing else has loaded it yet.
// The share click must never wait on DiceBear: the chip shows the initial instead.

import type { Seat } from '@/lib'
import { afterEach, expect, it } from 'vitest'
import { cardLayout, shareCardPng } from '@/lib'

const seat: Seat = { colour: '#00c46d', shape: 'square', initial: 'B', seed: 'seed', lean: 0 }
const card = { gridW: 3, gridH: 2, palette: ['#ff0000'], target: [0, 0, 0, 0, 0, 0], drawing: [0, 0, 0, 0, 0, 0] }
const root = document.documentElement.style

afterEach(() => root.removeProperty('--ink-on-colour'))

async function chipPixels(seed: string): Promise<number[]> {
  const bitmap = await createImageBitmap(await shareCardPng({ ...card, player: { name: 'Big Al', seat: { ...seat, seed } } }))
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  const { chip } = cardLayout(3, 2)
  return [...ctx.getImageData(chip.x, chip.y, chip.w, chip.h).data]
}

it('shows the initial while the face generator has not loaded', async () => {
  root.setProperty('--ink-on-colour', '#0e0e12')
  // An empty seed never has a face, so it is the initial-only chip.
  const [unloaded, initialOnly] = await Promise.all([chipPixels('seed'), chipPixels('')])
  expect(unloaded).toEqual(initialOnly)
})
