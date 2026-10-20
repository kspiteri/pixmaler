// B7 — SalonWall interaction: the real wall's walk layer in headless Chromium. Layout maths
// (useSalonWall) is Node-tested; this covers only the DOM behaviour — vertical-wheel → horizontal
// scroll, drag-past-threshold suppressing the click-open, a clean click opening, and arrow focus.

import type { WallItem } from '@/lib'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import SalonWall from '@/components/game/voting/SalonWall.vue'
import { palette } from './support'

const unmounts: Array<() => void> = []

function piece(realIndex: number): WallItem {
  return {
    kind: 'piece',
    submissionId: `s${realIndex}`,
    realIndex,
    key: `p${realIndex}`,
    rowSpan: 1,
    colSpan: 1,
    rot: 0,
    dx: 0,
    dy: 0,
    gw: 4,
    gh: 4,
    grid: Array.from<number>({ length: 16 }).fill(0),
  }
}

function mountWall(n: number) {
  const items = Array.from({ length: n }, (_, i) => piece(i))
  const opened: number[] = []
  const app = createApp({
    render: () => h(SalonWall, {
      items,
      palette,
      count: n,
      mySubmissionId: null,
      awardsOn: () => [],
      onOpen: (i: number) => opened.push(i),
    }),
  })
  const host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  const wall = host.querySelector<HTMLElement>('.salon-wall')!
  // The suite loads no SCSS, so force an overflowing horizontal scroller to walk.
  wall.style.cssText = 'display:flex; overflow:auto; width:100px;'
  for (const el of Array.from(wall.children) as HTMLElement[])
    el.style.cssText = 'flex:0 0 200px; width:200px; height:60px;'
  const articles = [...host.querySelectorAll<HTMLElement>('.salon-wall__item--piece')]
  unmounts.push(() => app.unmount())
  return { wall, articles, opened }
}

function wheel(target: HTMLElement, deltaY: number) {
  target.dispatchEvent(new WheelEvent('wheel', { deltaY, deltaX: 0, bubbles: true, cancelable: true }))
}

function pointer(target: EventTarget, type: string, x: number, buttons: number) {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: x,
    clientY: 10,
    button: 0,
    buttons,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
  }))
}

function key(target: HTMLElement, k: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
}

afterEach(() => {
  unmounts.splice(0).forEach(unmount => unmount())
  document.body.replaceChildren()
})

describe('salonWall interaction (browser)', () => {
  it('a dominant vertical wheel scrolls the wall horizontally', () => {
    const { wall } = mountWall(3)
    expect(wall.scrollLeft).toBe(0)
    wheel(wall, 60)
    expect(wall.scrollLeft).toBeGreaterThan(0)
  })

  it('a drag past the 5px threshold then release does not open a piece', () => {
    const { wall, articles, opened } = mountWall(3)
    pointer(wall, 'pointerdown', 100, 1)
    pointer(window, 'pointermove', 130, 1)
    pointer(window, 'pointerup', 130, 0)
    articles[0].click()
    expect(opened).toEqual([])
  })

  it('a clean click opens the piece', () => {
    const { articles, opened } = mountWall(3)
    articles[1].click()
    expect(opened).toEqual([1])
  })

  it('arrow keys move focus within the piece range', () => {
    const { articles } = mountWall(3)
    articles[0].focus()
    key(articles[0], 'ArrowRight')
    expect(document.activeElement).toBe(articles[1])
    key(articles[2], 'ArrowRight')
    expect(document.activeElement).toBe(articles[2])
    key(articles[0], 'ArrowLeft')
    expect(document.activeElement).toBe(articles[0])
  })
})
