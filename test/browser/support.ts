// Shared helpers for the browser-mode canvas suites: mount a real PixelCanvas and translate
// grid cells into viewport pointer coordinates.

import type { CanvasOptions } from '@/lib'
import { PixelCanvas } from '@/lib'

export const palette = ['#101010', '#ff0000', '#00ff00', '#0000ff', '#ffff00']

const mounted: PixelCanvas[] = []

export function mountCanvas(gridW: number, gridH: number, opts: Partial<CanvasOptions> = {}): PixelCanvas {
  const pc = new PixelCanvas({ gridW, gridH, palette, editable: true, ...opts })
  document.body.append(pc.canvas)
  mounted.push(pc)
  return pc
}

// Detaches every canvas mountCanvas created, so a held spray can't keep painting into later tests.
export function destroyCanvases(): void {
  mounted.splice(0).forEach(pc => pc.destroy())
}

export function cellPointer(pc: PixelCanvas, gridW: number, gridH: number) {
  const rect = pc.canvas.getBoundingClientRect()
  return (cx: number, cy: number) => ({
    x: rect.left + (cx + 0.5) * rect.width / gridW,
    y: rect.top + (cy + 0.5) * rect.height / gridH,
  })
}

export function pointer(target: EventTarget, type: string, x: number, y: number, button = 0): void {
  target.dispatchEvent(new PointerEvent(type, {
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
