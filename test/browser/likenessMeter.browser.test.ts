// LikenessMeter — what a player sees and hears for one drawing's likeness: the value read as
// text, the bar hidden from assistive technology, and nothing at all when there is no likeness.

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import LikenessMeter from '@/components/game/shared/LikenessMeter.vue'

const unmounts: Array<() => void> = []

function mount(likeness: number | null): HTMLElement {
  const app = createApp({ render: () => h(LikenessMeter, { likeness }) })
  const host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  unmounts.push(() => {
    app.unmount()
    host.remove()
  })
  return host
}

const text = (host: HTMLElement) => host.textContent!.replace(/\s+/g, ' ').trim()
const fillVar = (host: HTMLElement) => host.querySelector<HTMLElement>('.likeness-meter')!.style.getPropertyValue('--likeness')

afterEach(() => {
  while (unmounts.length)
    unmounts.pop()!()
})

describe('likenessMeter', () => {
  it('renders nothing when there is no likeness', () => {
    expect(mount(null).textContent).toBe('')
  })

  it('shows a likeness of 0, which is common, rather than hiding it', () => {
    const host = mount(0)
    expect(text(host)).toBe('likeness 0%')
    expect(fillVar(host)).toBe('0%')
  })

  it('reads the value as text, keeps the bar out of the accessibility tree, and fills it to the value', () => {
    const host = mount(64)
    expect(text(host)).toBe('likeness 64%')
    expect(host.querySelector('.likeness-meter__track')!.getAttribute('aria-hidden')).toBe('true')
    expect(fillVar(host)).toBe('64%')
  })
})
