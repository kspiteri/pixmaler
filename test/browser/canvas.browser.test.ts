// Browser-mode smoke for the editable canvas, in headless Chromium — the input, undo and
// eyedropper paths the DOM-free suite can't reach. Basic features only; not a full migration.

import { afterEach, describe, expect, it } from 'vitest'
import { PixelCanvas } from '@/lib'

const palette = ['#101010', '#ff0000', '#00ff00', '#0000ff']
const GRID = 4

function mount(opts: Partial<ConstructorParameters<typeof PixelCanvas>[0]> = {}) {
  const pc = new PixelCanvas({ gridW: GRID, gridH: GRID, palette, editable: true, ...opts })
  document.body.append(pc.canvas)
  return pc
}

// Viewport centre of a grid cell, from the canvas's real layout box.
function centre(pc: PixelCanvas, cx: number, cy: number) {
  const r = pc.canvas.getBoundingClientRect()
  return { x: r.left + (cx + 0.5) * r.width / GRID, y: r.top + (cy + 0.5) * r.height / GRID }
}

function pointer(canvas: HTMLCanvasElement, type: string, x: number, y: number, button = 0) {
  canvas.dispatchEvent(new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: x,
    clientY: y,
    button,
    buttons: type === 'pointerup' ? 0 : button === 2 ? 2 : 1,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  }))
}

function click(pc: PixelCanvas, cx: number, cy: number, button = 0) {
  const p = centre(pc, cx, cy)
  pointer(pc.canvas, 'pointerdown', p.x, p.y, button)
  if (button === 0)
    pointer(pc.canvas, 'pointerup', p.x, p.y, button)
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('pixel canvas (browser)', () => {
  it('paints a cell and reports the grid through onUpdate', () => {
    let lastGrid: number[] | null = null
    const pc = mount({ onUpdate: (g) => { lastGrid = g } })
    pc.selectColor(1)
    click(pc, 1, 1)
    expect(pc.getGrid()[1 * GRID + 1]).toBe(1)
    expect(lastGrid).not.toBeNull()
    expect(lastGrid![1 * GRID + 1]).toBe(1)
  })

  it('right-click samples the colour under the cursor and does not paint', () => {
    let picked: number | null = null
    const pc = mount({ onPick: (i) => { picked = i } })
    pc.selectColor(2)
    click(pc, 0, 0)
    expect(pc.getGrid()[0]).toBe(2)

    pc.selectColor(1)
    const before = [...pc.getGrid()]
    click(pc, 0, 0, 2) // right button
    expect(picked).toBe(2)
    expect(pc.getGrid()).toEqual(before)
  })

  it('a click that changes nothing adds no undo step', () => {
    const pc = mount()
    pc.selectColor(1)
    click(pc, 2, 2) // real change
    expect(pc.canUndo()).toBe(true)
    click(pc, 2, 2) // same colour again — no change
    expect(pc.undo()).toBe(true) // one undo restores the pre-stroke grid
    expect(pc.canUndo()).toBe(false) // nothing left, so the no-op added nothing
  })
})
