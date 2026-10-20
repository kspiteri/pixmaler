// B5 — CropWidget framing: the real component's pointer and keyboard wiring onto the crop
// v-model in headless Chromium. Geometry (cropRect) is Node-tested; this covers only the
// DOM path — pointer/keyboard → emitted centre, the buttons===0 release guard, and gating.

import type { CropSelection, TargetRatioId } from '@/lib'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import CropWidget from '@/components/game/image/picker/CropWidget.vue'

// A 1×1 transparent PNG; the frame is given an explicit box below, so the image need not load.
const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC'

const unmounts: Array<() => void> = []

function mountCrop(dims: { w: number, h: number } | null, ratioId: TargetRatioId, crop?: CropSelection) {
  const ratio = ref<TargetRatioId>(ratioId)
  const model = ref<CropSelection>(crop ?? { cx: 0.5, cy: 0.5, zoom: 1 })
  const app = createApp({
    render: () => h(CropWidget, {
      'naturalDims': dims,
      'sourceUrl': PX,
      'sourceLabel': 'test',
      'background': '#000',
      'ratio': ratio.value,
      'onUpdate:ratio': (v: TargetRatioId) => { ratio.value = v },
      'crop': model.value,
      'onUpdate:crop': (v: CropSelection) => { model.value = v },
    }),
  })
  const host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  const frame = host.querySelector<HTMLElement>('.picker__crop-frame')!
  // The suite loads no SCSS, so give the frame a measurable box to map pointers into.
  frame.style.position = 'fixed'
  frame.style.left = '0px'
  frame.style.top = '0px'
  frame.style.width = '200px'
  frame.style.height = '200px'
  unmounts.push(() => app.unmount())
  return { ratio, model, frame }
}

// Dispatch a pointer event at a fraction of the frame box, so fx/fy equal the expected centre.
function framePointer(frame: HTMLElement, type: string, fx: number, fy: number, buttons = 1) {
  const box = frame.getBoundingClientRect()
  frame.dispatchEvent(new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: box.left + fx * box.width,
    clientY: box.top + fy * box.height,
    buttons,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  }))
}

function key(frame: HTMLElement, k: string) {
  frame.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
}

afterEach(() => {
  unmounts.splice(0).forEach(unmount => unmount())
  document.body.replaceChildren()
})

describe('cropWidget framing (browser)', () => {
  it('a pointerdown then drag moves the emitted crop centre', () => {
    const { model, frame } = mountCrop({ w: 300, h: 200 }, 'square')
    framePointer(frame, 'pointerdown', 0.25, 0.25)
    expect(model.value.cx).toBeCloseTo(0.25, 5)
    expect(model.value.cy).toBeCloseTo(0.25, 5)
    framePointer(frame, 'pointermove', 0.6, 0.7)
    expect(model.value.cx).toBeCloseTo(0.6, 5)
    expect(model.value.cy).toBeCloseTo(0.7, 5)
  })

  it('a move with no button down (release missed off-widget) stops steering', () => {
    const { model, frame } = mountCrop({ w: 300, h: 200 }, 'square')
    framePointer(frame, 'pointerdown', 0.3, 0.3)
    framePointer(frame, 'pointermove', 0.8, 0.8, 0)
    expect(model.value.cx).toBeCloseTo(0.3, 5)
    expect(model.value.cy).toBeCloseTo(0.3, 5)
  })

  it('arrow keys step the crop centre', async () => {
    const { model, frame } = mountCrop({ w: 300, h: 200 }, 'square')
    // A tick between presses lets the emitted model flow back as the prop, as it would in use.
    key(frame, 'ArrowRight')
    await nextTick()
    expect(model.value.cx).toBeCloseTo(0.52, 5)
    key(frame, 'ArrowDown')
    await nextTick()
    expect(model.value.cy).toBeCloseTo(0.52, 5)
    key(frame, 'ArrowLeft')
    await nextTick()
    expect(model.value.cx).toBeCloseTo(0.5, 5)
  })

  it('does nothing when the shape fills the image (crop not movable)', () => {
    const { model, frame } = mountCrop({ w: 200, h: 200 }, 'square')
    framePointer(frame, 'pointerdown', 0.2, 0.2)
    framePointer(frame, 'pointermove', 0.9, 0.9)
    key(frame, 'ArrowRight')
    expect(model.value.cx).toBe(0.5)
    expect(model.value.cy).toBe(0.5)
  })
})
