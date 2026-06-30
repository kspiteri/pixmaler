// Generic pointer-driven drag for floating UI elements.
//
// Returns `x` / `y` refs (panel top-left in viewport coordinates) and a
// `start` handler to attach to the drag *handle*. Skips coarse pointers
// (touch) by default — mobile gets the panel anchored at its default spot
// for now; revisit when the mobile pass lands.
//
// `setPointerCapture` keeps drag events flowing even when the pointer moves
// over other elements (e.g. the canvas underneath), so painting handlers
// don't fight us mid-drag.

import { onBeforeUnmount, ref } from 'vue'

export interface UseDraggableOpts {
  // Initial top-left in viewport pixels. Read once on first drag start —
  // updates from outside (resize) come through `setPosition`.
  initialX: number
  initialY: number
  // Skip drag wiring on touch devices for now.
  desktopOnly?: boolean
  // Optional: the element being moved (the panel, not the handle). When given,
  // dragging is clamped so it can't leave the viewport. Called per move so it
  // tolerates the element mounting after the composable is created.
  element?: () => HTMLElement | null | undefined
  // Gap (px) to keep between the element and the viewport edge when clamping.
  margin?: number
}

export function useDraggable(opts: UseDraggableOpts) {
  const x = ref(opts.initialX)
  const y = ref(opts.initialY)

  let startClientX = 0
  let startClientY = 0
  let originX = 0
  let originY = 0
  let activeTarget: HTMLElement | null = null
  let activePointerId: number | null = null

  function isCoarsePointer(): boolean {
    return typeof window !== 'undefined'
      && window.matchMedia('(pointer: coarse)').matches
  }

  // Keep (nextX, nextY) such that the dragged element stays within the viewport.
  // No-op if no element is provided or it hasn't laid out yet.
  function clamp(nextX: number, nextY: number): { x: number, y: number } {
    const el = opts.element?.()
    if (!el)
      return { x: nextX, y: nextY }
    const m = opts.margin ?? 8
    const maxX = Math.max(m, window.innerWidth - el.offsetWidth - m)
    const maxY = Math.max(m, window.innerHeight - el.offsetHeight - m)
    return {
      x: Math.min(Math.max(m, nextX), maxX),
      y: Math.min(Math.max(m, nextY), maxY),
    }
  }

  function start(e: PointerEvent) {
    if (opts.desktopOnly && isCoarsePointer())
      return
    // Only react to the primary button on mouse.
    if (e.pointerType === 'mouse' && e.button !== 0)
      return

    e.preventDefault()
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    activeTarget = target
    activePointerId = e.pointerId

    startClientX = e.clientX
    startClientY = e.clientY
    originX = x.value
    originY = y.value

    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onEnd)
    target.addEventListener('pointercancel', onEnd)
  }

  function onMove(e: PointerEvent) {
    const next = clamp(originX + (e.clientX - startClientX), originY + (e.clientY - startClientY))
    x.value = next.x
    y.value = next.y
  }

  function onEnd() {
    if (activeTarget && activePointerId !== null) {
      activeTarget.removeEventListener('pointermove', onMove)
      activeTarget.removeEventListener('pointerup', onEnd)
      activeTarget.removeEventListener('pointercancel', onEnd)
      try { activeTarget.releasePointerCapture(activePointerId) }
      catch { /* already released — fine */ }
    }
    activeTarget = null
    activePointerId = null
  }

  function setPosition(nextX: number, nextY: number) {
    const next = clamp(nextX, nextY)
    x.value = next.x
    y.value = next.y
  }

  onBeforeUnmount(onEnd)

  return { x, y, start, setPosition }
}
