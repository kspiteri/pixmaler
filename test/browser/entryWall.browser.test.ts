// BW — the Entry art wall in a real browser: two framed pieces hung by `Hanging.vue` on the
// production wall grid, driven by genuine multi-pointer events. Covers the pointer latch, the
// tap-versus-drag release, reduced motion, the live ResizeObserver and a refused pointer
// capture — the half of the scene Node cannot reach. `wall.ts` keeps its pieces in module
// state, so every mount is unmounted in `afterEach` or its frames haunt the next test.

// Pulls in the Playwright provider's augmentation of `CDPSession`.
import type {} from '@vitest/browser-playwright'
import type { Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cdp, server } from 'vitest/browser'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import Hanging from '@/views/entry/Hanging.vue'
import '@/styles/screens/_entry.scss'

// The real wall: twelve columns, the original across six of them, the attempt across the last
// five, the twelfth between them wall rather than gutter. 432px makes those 216 and 180.
const WALL_X = 40
const WALL_Y = 40
const WALL_W = 432
const ORIGINAL_TILT = -1.5 // deg: `:tilt="-1"` × `$wonk-art`
const ATTEMPT_TILT = 3
const HOLD = 150 // frames: long enough for the drag spring to come to rest on its target

const unmounts: Array<() => void> = []
const realRaf = globalThis.requestAnimationFrame.bind(globalThis)
const realCancel = globalThis.cancelAnimationFrame.bind(globalThis)
const realNow = performance.now.bind(performance)
const realMatchMedia = window.matchMedia.bind(window)

// The scene runs on one rAF loop off `performance.now()`. Both are replaced by a hand-cranked
// clock, so a four-second settle costs no wall time and every engine integrates the same steps.
const pending = new Map<number, FrameRequestCallback>()
let clock = 0
let frameId = 0

function tick(count = 1): void {
  for (let i = 0; i < count; i++) {
    clock += 16
    const due = [...pending.values()]
    pending.clear()
    for (const cb of due)
      cb(clock)
  }
}

// Runs the scene until it parks itself, which is how a piece lands exactly on its resting tilt.
async function settle(limit = 1200): Promise<void> {
  for (let i = 0; i < limit && pending.size; i++)
    tick()
  await nextTick()
}

// Two real frames: a ResizeObserver delivers after layout, which the fake clock cannot fake.
async function reflow(): Promise<void> {
  await new Promise<void>(resolve => realRaf(() => realRaf(() => resolve())))
  await nextTick()
}

// `support.ts`'s `pointer` is a single mouse; the latch needs a second finger of its own.
function pointer(target: EventTarget, type: string, x: number, y: number, id = 1): void {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    pointerId: id,
    pointerType: 'touch',
    isPrimary: id === 1,
  }))
}

function tiltOf(hang: HTMLElement): number {
  return Number.parseFloat(hang.style.getPropertyValue('--angle'))
}

function mountWall(): { wall: HTMLElement, left: HTMLElement, right: HTMLElement, attempt: Ref<boolean> } {
  const attempt = ref(true)
  const app = createApp(defineComponent({
    setup() {
      return () => h('div', {
        class: 'entry__wall',
        style: `position:fixed;left:${WALL_X}px;top:${WALL_Y}px;width:${WALL_W}px`,
      }, [
        h('figure', { class: 'entry__piece entry__piece--original' }, [
          h(Hanging, { tilt: -1, range: 1.8 }, () => h('div', { style: 'width:100%;aspect-ratio:216/316' })),
        ]),
        attempt.value
          ? h('figure', { class: 'entry__piece entry__piece--attempt' }, [
              h(Hanging, { tilt: 2, range: 3 }, () => h('div', { style: 'width:100%;aspect-ratio:180/262' })),
            ])
          : null,
      ])
    },
  }))
  const host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  unmounts.push(() => app.unmount())
  const [left, right] = [...host.querySelectorAll<HTMLElement>('.entry__hang')]
  return { wall: host.querySelector<HTMLElement>('.entry__wall')!, left, right, attempt }
}

beforeEach(() => {
  clock = realNow()
  globalThis.requestAnimationFrame = (cb) => {
    pending.set(++frameId, cb)
    return frameId
  }
  globalThis.cancelAnimationFrame = (id) => { pending.delete(id) }
  performance.now = () => clock
})

afterEach(() => {
  unmounts.splice(0).forEach(unmount => unmount())
  // The last piece to leave stops the loop, which is the scene admitting it is empty.
  expect(pending.size, 'a piece outlived its component').toBe(0)
  pending.clear()
  globalThis.requestAnimationFrame = realRaf
  globalThis.cancelAnimationFrame = realCancel
  performance.now = realNow
  window.matchMedia = realMatchMedia
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

describe('entry art wall (browser)', () => {
  it('keeps the swing on the first finger when a second one lands', async () => {
    const { left } = mountWall()
    pointer(left, 'pointerdown', WALL_X + 108, 240)
    for (let x = WALL_X + 108; x >= 60; x -= 8) {
      pointer(left, 'pointermove', x, 240)
      tick()
    }
    tick(HOLD)
    await nextTick()
    const held = tiltOf(left)
    expect(held).toBeGreaterThan(ORIGINAL_TILT + 10)

    // A second thumb lands on the frame and barely moves: the grab must not re-base onto it.
    pointer(left, 'pointerdown', 200, 240, 2)
    pointer(left, 'pointermove', 202, 241, 2)
    tick(HOLD)
    await nextTick()
    expect(tiltOf(left)).toBeCloseTo(held, 1)

    // The first finger still steers.
    for (let x = 60; x <= 100; x += 8) {
      pointer(left, 'pointermove', x, 240)
      tick()
    }
    tick(HOLD)
    await nextTick()
    expect(tiltOf(left)).toBeLessThan(held - 3)

    pointer(left, 'pointerup', 100, 240)
    pointer(left, 'pointerup', 202, 241, 2)
    await settle()
    expect(tiltOf(left)).toBeCloseTo(ORIGINAL_TILT, 3)
  })

  it('re-rolls the resting tilt on a tap', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const { left } = mountWall()
    pointer(left, 'pointerdown', WALL_X + 108, 240)
    pointer(left, 'pointermove', WALL_X + 109, 241)
    pointer(left, 'pointerup', WALL_X + 109, 241)
    await settle()
    // 0.6° floor + 0.9 of the 2.7° range left to it, and 0.9 picks the positive side.
    expect(tiltOf(left)).toBeCloseTo(2.49, 3)
  })

  it('settles back onto the tilt it started with after a real drag', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const { left } = mountWall()
    pointer(left, 'pointerdown', WALL_X + 108, 240)
    for (let x = WALL_X + 108; x >= 60; x -= 8) {
      pointer(left, 'pointermove', x, 240)
      tick()
    }
    await nextTick()
    expect(tiltOf(left)).toBeGreaterThan(ORIGINAL_TILT + 5)
    pointer(left, 'pointerup', 60, 240)
    await settle()
    expect(tiltOf(left)).toBeCloseTo(ORIGINAL_TILT, 3)
  })

  it('refuses the drag under reduced motion', async () => {
    window.matchMedia = (q: string) => (q.includes('prefers-reduced-motion')
      ? { ...realMatchMedia(q), matches: true, media: q }
      : realMatchMedia(q))
    const { left } = mountWall()
    const resting = left.style.getPropertyValue('--angle')
    pointer(left, 'pointerdown', WALL_X + 108, 240)
    for (let x = WALL_X + 108; x >= 60; x -= 8) {
      pointer(left, 'pointermove', x, 240)
      tick()
    }
    pointer(left, 'pointerup', 60, 240)
    tick(60)
    await nextTick()
    expect(left.style.getPropertyValue('--angle')).toBe(resting)
    expect(left.classList.contains('entry__hang--held')).toBe(false)
  })

  // Flipping the media query itself needs CDP, which Playwright only offers on Chromium.
  it.runIf(server.browser === 'chromium')('wears the inert cursor when the query itself reports reduce', async () => {
    const { left } = mountWall()
    expect(getComputedStyle(left).cursor).toBe('grab')
    const client = cdp()
    try {
      await client.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
      })
      expect(getComputedStyle(left).cursor).toBe('default')
      const resting = left.style.getPropertyValue('--angle')
      pointer(left, 'pointerdown', WALL_X + 108, 240)
      for (let x = WALL_X + 108; x >= 60; x -= 8) {
        pointer(left, 'pointermove', x, 240)
        tick()
      }
      pointer(left, 'pointerup', 60, 240)
      tick(60)
      await nextTick()
      expect(left.style.getPropertyValue('--angle')).toBe(resting)
    }
    finally {
      await client.send('Emulation.setEmulatedMedia', { features: [] })
    }
  })

  it('knocks the neighbour against the nails a mid-drag reflow moved', async () => {
    const { wall, left, right } = mountWall()
    // Held still, the grabbed frame hangs where it was and the pair stay clear of each other.
    pointer(left, 'pointerdown', 240, 240)
    tick(60)
    await nextTick()
    expect(tiltOf(left)).toBeCloseTo(ORIGINAL_TILT, 1)
    expect(tiltOf(right)).toBeCloseTo(ATTEMPT_TILT, 3)

    // The wall narrows under the held finger: both nails slide left, so the same pointer now
    // swings the frame far enough to reach its neighbour.
    wall.style.width = '300px'
    await reflow()
    for (let i = 0; i < 80; i++) {
      pointer(left, 'pointermove', 240 + (i % 2), 240)
      tick()
    }
    await nextTick()
    expect(tiltOf(left)).toBeLessThan(-5)
    expect(tiltOf(right)).toBeLessThan(ATTEMPT_TILT - 1)
    pointer(left, 'pointerup', 240, 240)
    await settle()
  })

  it('swings through the space a removed neighbour left', async () => {
    const { left, right, attempt } = mountWall()
    pointer(left, 'pointerdown', WALL_X + 108, 240)
    for (let x = WALL_X + 108; x <= 340; x += 8) {
      pointer(left, 'pointermove', x, 240)
      tick()
    }
    tick(80)
    await nextTick()
    const blocked = tiltOf(left)
    expect(tiltOf(right)).toBeLessThan(ATTEMPT_TILT - 1)
    pointer(left, 'pointerup', 340, 240)
    await settle()

    attempt.value = false
    await nextTick()
    pointer(left, 'pointerdown', WALL_X + 108, 240)
    for (let x = WALL_X + 108; x <= 340; x += 8) {
      pointer(left, 'pointermove', x, 240)
      tick()
    }
    tick(80)
    await nextTick()
    expect(tiltOf(left)).toBeLessThan(blocked - 2)
    pointer(left, 'pointerup', 340, 240)
    await settle()
  })

  it('keeps the swing when the browser refuses pointer capture', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const { left } = mountWall()
    left.setPointerCapture = () => { throw new DOMException('refused', 'NotFoundError') }

    pointer(left, 'pointerdown', WALL_X + 108, 240)
    for (let x = WALL_X + 108; x >= 60; x -= 8) {
      pointer(left, 'pointermove', x, 240)
      tick()
    }
    tick(60)
    await nextTick()
    expect(tiltOf(left)).toBeGreaterThan(ORIGINAL_TILT + 10)
    pointer(left, 'pointerup', 60, 240)
    await settle()
    expect(left.classList.contains('entry__hang--held')).toBe(false)

    // Not stuck mid-grab: the next press is a fresh tap, and a tap re-rolls.
    pointer(left, 'pointerdown', WALL_X + 108, 240)
    pointer(left, 'pointerup', WALL_X + 108, 240)
    await settle()
    expect(tiltOf(left)).toBeCloseTo(2.49, 3)
  })
})
