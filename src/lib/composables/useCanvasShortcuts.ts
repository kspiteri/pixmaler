// Keyboard and wheel shortcuts for the drawing surface, shared by DRAWING and /paint.
// Behaviour only — the visible affordances (the ? panel, the swatch key badges) live in
// the components. Window-level, so a shortcut fires whether or not the canvas holds focus;
// the editing keys stand down while a form control (the size slider) owns focus, so its
// own arrow keys keep working.

import type { PixelCanvas } from '../canvas/pixel'
import type { SwatchHandle, ToolSizeHandle } from '../canvas/tools'
import { onBeforeUnmount, onMounted } from 'vue'
import { CANVAS_TOOLS } from '../canvas/pixel'
import { shortcutsEnabled } from '../prefs/shortcuts'

interface Refs {
  player: () => PixelCanvas | null
  swatch: () => SwatchHandle | null
  toolSize: () => ToolSizeHandle | null
  // The editable canvas, so the scroll-wheel size control only fires over it.
  canvas: () => HTMLElement | null
}

function inFormField(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el)
    return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function useCanvasShortcuts({ player, swatch, toolSize, canvas }: Refs) {
  function nudgeToolSize(delta: number) {
    const pc = player()
    if (!pc)
      return
    pc.setToolSize(pc.getToolSize() + delta)
    toolSize()?.sync()
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!shortcutsEnabled.value)
      return
    const pc = player()
    const sw = swatch()
    if (!pc || !sw)
      return

    // Editing keys stand down while a form control owns focus, so its own undo, Shift and
    // arrow keys keep working — notably /paint's "draw seconds" input, which is on screen
    // alongside the canvas.
    if (inFormField())
      return

    // Undo.
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

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault()
        sw.select((sw.selectedIndex() - 1 + sw.count) % sw.count)
        break
      case 'ArrowRight':
        e.preventDefault()
        sw.select((sw.selectedIndex() + 1) % sw.count)
        break
      case 'ArrowUp':
      case 'ArrowDown': {
        e.preventDefault()
        const n = CANVAS_TOOLS.length
        const step = e.key === 'ArrowUp' ? -1 : 1
        pc.setTool(CANVAS_TOOLS[(CANVAS_TOOLS.indexOf(pc.getTool()) + step + n) % n])
        break
      }
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

  // Scroll over the canvas resizes the active tool (up larger, down smaller; nothing on Fill).
  // Non-passive so it can suppress the page scroll while the pointer is on the canvas.
  function onWheel(e: WheelEvent) {
    const c = canvas()
    if (!shortcutsEnabled.value || !c || !(e.target instanceof Node) || !c.contains(e.target))
      return
    e.preventDefault()
    nudgeToolSize(e.deltaY < 0 ? 1 : -1)
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
