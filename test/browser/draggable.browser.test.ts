// B6 — useDraggable clamp + capture: a real positioned panel dragged past the viewport
// corners, driven through actual pointer events on the handle. Clamp reads window + the
// element's live offset sizes, pointer capture is taken on down and released on up, and a
// disabled (Touch-mode) handle refuses the drag — none of it reachable without layout.

import type { Ref } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, watchEffect } from 'vue'
import { useDraggable } from '@/lib'
import { pointer } from './support'

// The slice of the composable the tests drive, named locally rather than inferred.
interface Draggable {
  x: Ref<number>
  y: Ref<number>
  start: (e: PointerEvent) => void
}

const unmounts: Array<() => void> = []
const PANEL_W = 100
const PANEL_H = 80
const MARGIN = 8
const POINTER_ID = 1

function mountDraggable(opts: { disabled?: boolean } = {}) {
  const panel = document.createElement('div')
  panel.style.cssText = `position:fixed;left:0;top:0;width:${PANEL_W}px;height:${PANEL_H}px`
  const handle = document.createElement('div')
  handle.style.cssText = 'position:fixed;left:50px;top:50px;width:20px;height:20px'
  document.body.append(panel, handle)

  // Observe the capture lifecycle while still calling through to the platform.
  const captured: number[] = []
  const released: number[] = []
  const origSet = handle.setPointerCapture.bind(handle)
  const origRelease = handle.releasePointerCapture.bind(handle)
  handle.setPointerCapture = (id: number) => { captured.push(id); origSet(id) }
  handle.releasePointerCapture = (id: number) => { released.push(id); origRelease(id) }

  let drag!: Draggable
  const app = createApp(defineComponent({
    setup() {
      drag = useDraggable({ initialX: 50, initialY: 50, element: () => panel, margin: MARGIN, disabled: () => opts.disabled ?? false })
      handle.addEventListener('pointerdown', drag.start)
      watchEffect(() => {
        panel.style.left = `${drag.x.value}px`
        panel.style.top = `${drag.y.value}px`
      })
      return () => null
    },
  }))
  const host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  unmounts.push(() => app.unmount())
  return { drag, handle, captured, released }
}

afterEach(() => {
  unmounts.splice(0).forEach(unmount => unmount())
  document.body.replaceChildren()
})

describe('useDraggable clamp + capture (browser)', () => {
  it('clamps the panel inside the viewport when dragged past the far corner', () => {
    const { drag, handle } = mountDraggable()
    pointer(handle, 'pointerdown', 60, 60)
    pointer(handle, 'pointermove', window.innerWidth + 500, window.innerHeight + 500)
    pointer(handle, 'pointerup', window.innerWidth + 500, window.innerHeight + 500)
    expect(drag.x.value).toBe(window.innerWidth - PANEL_W - MARGIN)
    expect(drag.y.value).toBe(window.innerHeight - PANEL_H - MARGIN)
    expect(drag.x.value + PANEL_W + MARGIN).toBeLessThanOrEqual(window.innerWidth)
  })

  it('clamps to the near corner margin when dragged past the top-left', () => {
    const { drag, handle } = mountDraggable()
    pointer(handle, 'pointerdown', 60, 60)
    pointer(handle, 'pointermove', -500, -500)
    pointer(handle, 'pointerup', -500, -500)
    expect(drag.x.value).toBe(MARGIN)
    expect(drag.y.value).toBe(MARGIN)
  })

  it('takes pointer capture on down and releases it on up', () => {
    const { handle, captured, released } = mountDraggable()
    pointer(handle, 'pointerdown', 60, 60)
    expect(captured).toContain(POINTER_ID)
    expect(released).not.toContain(POINTER_ID)
    pointer(handle, 'pointerup', 60, 60)
    expect(released).toContain(POINTER_ID)
  })

  it('refuses the drag and takes no capture when disabled (Touch mode)', () => {
    const { drag, handle, captured } = mountDraggable({ disabled: true })
    pointer(handle, 'pointerdown', 60, 60)
    pointer(handle, 'pointermove', 400, 400)
    pointer(handle, 'pointerup', 400, 400)
    expect(captured).toHaveLength(0)
    expect(drag.x.value).toBe(50)
    expect(drag.y.value).toBe(50)
  })
})
