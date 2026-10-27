// BS — palette and shortcuts: the swatch widget, the keyboard/wheel shortcuts and the
// eyedropper-to-swatch wiring, all of which need a real DOM and window events.

import type { BrushHandle, SwatchHandle } from '@/lib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { buildBrushControls, buildSwatch, PixelCanvas, shortcutsEnabled, useCanvasShortcuts } from '@/lib'
import { cellPointer, palette, pointer } from './support'

const unmounts: Array<() => void> = []

function mountShortcuts(refs: Parameters<typeof useCanvasShortcuts>[0]) {
  const app = createApp(defineComponent({
    setup() {
      useCanvasShortcuts(refs)
      return () => h('div')
    },
  }))
  const host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  unmounts.push(() => app.unmount())
}

// A canvas + swatch + brush wired together as DrawBoard wires them, with the shortcuts live.
function wired(gridW = 8, gridH = 8) {
  let brush: BrushHandle | null = null
  const pc = new PixelCanvas({ gridW, gridH, palette, editable: true, onToolChange: () => brush?.sync() })
  const sw = buildSwatch(palette, i => pc.selectColor(i))
  brush = buildBrushControls(pc)
  document.body.append(pc.canvas, sw.element, brush.element)
  mountShortcuts({ player: () => pc, swatch: () => sw, brush: () => brush, canvas: () => pc.canvas })
  const slider = brush.element.querySelector('input')!
  return { pc, sw, brush, slider }
}

function wheel(pc: PixelCanvas, deltaY: number) {
  pc.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }))
}

beforeEach(() => {
  shortcutsEnabled.value = true
})

afterEach(() => {
  unmounts.splice(0).forEach(unmount => unmount())
  document.body.replaceChildren()
})

describe('palette & shortcuts (browser)', () => {
  it('clicking a swatch selects it and marks it pressed', () => {
    let picked = -1
    const sw = buildSwatch(palette, (i) => { picked = i })
    document.body.append(sw.element)
    const cells = sw.element.querySelectorAll<HTMLElement>('.swatch__cell')
    cells[2].click()
    expect(picked).toBe(2)
    expect(sw.selectedIndex()).toBe(2)
    expect(cells[2].getAttribute('aria-pressed')).toBe('true')
  })

  it('maps quick keys to swatch indices and nothing else', () => {
    const sw = buildSwatch(palette, () => {})
    expect(sw.indexForKeyCode('Digit1')).toBe(0)
    expect(sw.indexForKeyCode('Digit5')).toBe(4)
    expect(sw.indexForKeyCode('Digit6')).toBeNull() // past this palette's length
    expect(sw.indexForKeyCode('KeyQ')).toBeNull()
  })

  it('right-click eyedropper moves the selected swatch, only when shortcuts are on', () => {
    const refs: { swatch?: SwatchHandle } = {}
    const pc = new PixelCanvas({
      gridW: 8,
      gridH: 8,
      palette,
      editable: true,
      onPick: (i) => {
        if (shortcutsEnabled.value)
          refs.swatch?.select(i)
      },
    })
    refs.swatch = buildSwatch(palette, i => pc.selectColor(i))
    document.body.append(pc.canvas, refs.swatch.element)
    const at = cellPointer(pc, 8, 8)

    refs.swatch.select(2)
    pointer(pc.canvas, 'pointerdown', at(0, 0).x, at(0, 0).y)
    pointer(pc.canvas, 'pointerup', at(0, 0).x, at(0, 0).y) // paint (0,0) with colour 2
    refs.swatch.select(1)
    pointer(pc.canvas, 'pointerdown', at(0, 0).x, at(0, 0).y, 2) // right-click samples it
    expect(refs.swatch.selectedIndex()).toBe(2)

    shortcutsEnabled.value = false
    refs.swatch.select(1)
    pointer(pc.canvas, 'pointerdown', at(0, 0).x, at(0, 0).y, 2)
    expect(refs.swatch.selectedIndex()).toBe(1) // gated off → no pick
  })

  it('arrow keys step through the swatch, wrapping', () => {
    const { sw } = wired()
    sw.select(0)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(sw.selectedIndex()).toBe(1)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    expect(sw.selectedIndex()).toBe(palette.length - 1) // wrapped past 0
  })

  it('up/down cycle the tools, wrapping, and leave the colour alone', () => {
    const { pc, sw } = wired()
    sw.select(2)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    expect(pc.getTool()).toBe('brush')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    expect(pc.getTool()).toBe('spray') // wrapped past pencil
    expect(sw.selectedIndex()).toBe(2)
  })

  it('hold Shift shows the key overlay and Shift+key picks that colour', () => {
    const { sw } = wired()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }))
    expect(sw.element.classList.contains('swatch--keys')).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '@', code: 'Digit2', shiftKey: true }))
    expect(sw.selectedIndex()).toBe(1)
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }))
    expect(sw.element.classList.contains('swatch--keys')).toBe(false)
  })

  it('the scroll wheel over the canvas resizes the brush', () => {
    const { pc } = wired()
    pc.setBrushSize(3)
    wheel(pc, -1)
    expect(pc.getBrushSize()).toBe(4)
    wheel(pc, 1)
    expect(pc.getBrushSize()).toBe(3)
  })

  it('the size slider follows the active tool, each keeping its own size', () => {
    const { pc, slider } = wired()
    expect(slider.min).toBe('1')
    pc.setTool('brush')
    expect(slider.min).toBe('3') // a 2-wide disc is the pencil's square
    slider.value = '6'
    slider.dispatchEvent(new Event('input'))
    pc.setTool('pencil')
    pc.setBrushSize(2)
    expect(slider.value).not.toBe('6')
    pc.setTool('brush')
    expect(slider.value).toBe('6')
    expect(pc.getBrushSize()).toBe(6)
  })

  it('fill has no size: the slider is disabled and the wheel does nothing', () => {
    const { pc, slider } = wired()
    pc.setBrushSize(2)
    pc.setTool('fill')
    expect(slider.disabled).toBe(true)
    wheel(pc, -1)
    pc.setTool('pencil')
    expect(slider.disabled).toBe(false)
    expect(pc.getBrushSize()).toBe(2)
  })
})
