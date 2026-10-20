// BF — fit & orientation: `fitTo` sizes the display box without touching the bitmap, and
// `useOrientation` tracks the window aspect. Both need a real window and layout.

import type { ComputedRef } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { orientationFor, useOrientation } from '@/lib'
import { mountCanvas } from './support'

afterEach(() => {
  document.body.replaceChildren()
  Reflect.deleteProperty(window, 'innerWidth')
  Reflect.deleteProperty(window, 'innerHeight')
})

describe('fit & orientation (browser)', () => {
  it('fitTo sizes the display to the box, preserving aspect, without touching the bitmap', () => {
    const pc = mountCanvas(4, 4)
    const { width, height } = pc.canvas
    pc.fitTo(200, 100) // scale = min(200/4, 100/4) = 25 → 100×100
    expect(pc.canvas.style.width).toBe('100px')
    expect(pc.canvas.style.height).toBe('100px')
    expect(pc.canvas.width).toBe(width) // bitmap untouched
    expect(pc.canvas.height).toBe(height)
  })

  it('fitTo keeps a non-square grid in proportion', () => {
    const pc = mountCanvas(8, 2) // 4:1
    pc.fitTo(400, 400) // scale = min(50, 200) = 50 → 400×100
    expect(pc.canvas.style.width).toBe('400px')
    expect(pc.canvas.style.height).toBe('100px')
  })

  it('useOrientation follows the window aspect and reacts to a resize', () => {
    const setViewport = (w: number, h: number) => {
      Object.defineProperty(window, 'innerWidth', { value: w, configurable: true })
      Object.defineProperty(window, 'innerHeight', { value: h, configurable: true })
    }
    const holder: { orientation?: ComputedRef<'row' | 'column'> } = {}

    setViewport(2000, 500) // wide
    const app = createApp(defineComponent({
      setup() {
        holder.orientation = useOrientation(() => 10, () => 10)
        return () => h('div')
      },
    }))
    const host = document.createElement('div')
    document.body.append(host)
    app.mount(host)

    expect(holder.orientation?.value).toBe(orientationFor(10, 10, 2000, 500)) // row
    setViewport(500, 2000) // tall
    window.dispatchEvent(new Event('resize'))
    expect(holder.orientation?.value).toBe(orientationFor(10, 10, 500, 2000)) // column
    expect(holder.orientation?.value).toBe('column')
    app.unmount()
  })
})
