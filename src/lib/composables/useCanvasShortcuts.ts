// Keyboard and wheel shortcuts for the drawing surface, shared by DRAWING and /paint.
// Behaviour only — the visible affordances (the ? panel, the swatch key badges) live in
// the components. Window-level, so a shortcut fires whether or not the canvas holds focus;
// the editing keys stand down while a form control (the brush slider) owns focus, so its
// own arrow keys keep working.

import type { PixelCanvas } from '../canvas/pixel'
import type { BrushHandle, SwatchHandle } from '../canvas/tools'
import { onBeforeUnmount, onMounted } from 'vue'

interface Refs {
  player: () => PixelCanvas | null
  swatch: () => SwatchHandle | null
  brush: () => BrushHandle | null
  // The editable canvas, so the scroll-wheel brush control only fires over it.
  canvas: () => HTMLElement | null
}

function inFormField(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el)
    return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function useCanvasShortcuts({ player, swatch, brush, canvas }: Refs) {
  function nudgeBrush(delta: number) {
    const pc = player()
    if (!pc)
      return
    pc.setBrushSize(Math.min(pc.getBrushMax(), Math.max(1, pc.getBrushSize() + delta)))
    brush()?.sync()
  }

  function onKeyDown(e: KeyboardEvent) {
    const pc = player()
    const sw = swatch()
    if (!pc || !sw)
      return

    // Undo — always, even from a form field, matching the platform.
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault()
      pc.undo()
      return
    }

    // Hold Shift → reveal the quick-swap badges; Shift + a mapped key picks that colour and
    // the overlay stays up, so you can re-pick until you let go.
    if (e.key === 'Shift') {
      sw.showKeys(true)
      return
    }
    if (e.shiftKey) {
      const i = sw.indexForKeyCode(e.code)
      if (i !== null) {
        e.preventDefault()
        sw.select(i)
      }
      return
    }

    // Stand down while a form control owns focus so the brush slider's own arrows work.
    if (inFormField())
      return

    // Arrow keys step through the swatch, wrapping — previous colour left/up, next right/down.
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        sw.select((sw.selectedIndex() - 1 + sw.count) % sw.count)
        break
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        sw.select((sw.selectedIndex() + 1) % sw.count)
        break
    }
  }

  function onKeyUp(e: KeyboardEvent) {
    if (e.key === 'Shift')
      swatch()?.showKeys(false)
  }

  // A window blur can swallow the Shift keyup, leaving the overlay stuck on.
  function onBlur() {
    swatch()?.showKeys(false)
  }

  // Scroll over the canvas resizes the brush — up larger, down smaller. Non-passive so it
  // can suppress the page scroll while the pointer is on the canvas.
  function onWheel(e: WheelEvent) {
    const c = canvas()
    if (!c || !(e.target instanceof Node) || !c.contains(e.target))
      return
    e.preventDefault()
    nudgeBrush(e.deltaY < 0 ? 1 : -1)
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    window.addEventListener('wheel', onWheel, { passive: false })
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('wheel', onWheel)
  })
}
