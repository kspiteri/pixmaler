// ExportButton — what a player sees and hears around one press: one share per press, a tick
// worded by what actually happened, a warning when the export fails, silence when they cancel.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import ExportButton from '@/components/game/shared/ExportButton.vue'
import { assertiveMessage, politeMessage } from '@/lib'

const unmounts: Array<() => void> = []
const png = () => Promise.resolve(new Blob(['x'], { type: 'image/png' }))

interface Mounted { button: HTMLButtonElement, polite: HTMLElement, assertive: HTMLElement, unmount: () => void }

function mount(props: Record<string, unknown>): Mounted {
  const app = createApp({
    render: () => [
      h(ExportButton, { intent: 'share', render: png, filename: 'a.png', label: 'Share card', subject: 'your card', shareTitle: 'My drawing on Pixmaler', icon: true, ...props }),
      // The live regions App.vue renders.
      h('span', { 'data-live': 'polite' }, politeMessage.value),
      h('span', { 'data-live': 'assertive' }, assertiveMessage.value),
    ],
  })
  const host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  const unmount = () => {
    app.unmount()
    host.remove()
  }
  unmounts.push(unmount)
  return {
    button: host.querySelector('button')!,
    polite: host.querySelector('[data-live="polite"]')!,
    assertive: host.querySelector('[data-live="assertive"]')!,
    unmount,
  }
}

function stubShare(share: (data: ShareData) => Promise<void>, canShare = true) {
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => canShare })
  Object.defineProperty(navigator, 'share', { configurable: true, value: share })
  return vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
}

// Long enough for the press's promises and the announcer's frame to land.
async function settle() {
  for (let i = 0; i < 5; i++)
    await new Promise(r => requestAnimationFrame(r))
  await nextTick()
}

afterEach(() => {
  unmounts.splice(0).forEach(u => u())
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete (navigator as Partial<Navigator>).canShare
  delete (navigator as Partial<Navigator>).share
  politeMessage.value = ''
  assertiveMessage.value = ''
})

describe('exportButton', () => {
  it('shares once when pressed twice in a row', async () => {
    let finish!: () => void
    const promise = new Promise<void>((resolve) => { finish = resolve })
    const share = vi.fn(() => promise)
    stubShare(share)
    const { button } = mount({})
    button.click()
    await settle()
    button.click()
    await settle()
    finish()
    await settle()
    expect(share).toHaveBeenCalledOnce()
  })

  it('keeps keyboard focus on the button while the export is in flight', async () => {
    let finish!: () => void
    const promise = new Promise<void>((resolve) => { finish = resolve })
    stubShare(() => promise)
    const { button } = mount({})
    button.focus()
    button.click()
    await settle()
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(button)
    finish()
    await settle()
    expect(button.hasAttribute('aria-disabled')).toBe(false)
    expect(document.activeElement).toBe(button)
  })

  it('hands the share title to the share sheet', async () => {
    const share = vi.fn((_data: ShareData) => Promise.resolve())
    stubShare(share)
    mount({}).button.click()
    await settle()
    expect(share.mock.calls[0][0].title).toBe('My drawing on Pixmaler')
  })

  it('stays at rest and says nothing when the share sheet is dismissed', async () => {
    stubShare(() => Promise.reject(new DOMException('dismissed', 'AbortError')))
    const { button, polite, assertive } = mount({})
    button.click()
    await settle()
    expect([button.title, button.getAttribute('aria-label')]).toEqual(['Share card', 'Share card'])
    expect([polite.textContent, assertive.textContent]).toEqual(['', ''])
  })

  it('names what happened, not what was asked: a share that downloads reads "saved"', async () => {
    stubShare(() => Promise.resolve(), false)
    const { button, polite } = mount({})
    button.click()
    await settle()
    expect(button.getAttribute('aria-label')).toBe('Share card: saved')
    // The tooltip keeps the name so it isn't spoken twice.
    expect(button.title).toBe('Share card')
    expect(polite.textContent).toBe('Saved your card')
  })

  it('warns when the export fails, then returns to rest after 2 s', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    stubShare(() => Promise.resolve())
    const { button, assertive } = mount({ render: () => Promise.reject(new Error('boom')) })
    button.click()
    await settle()
    expect(button.getAttribute('aria-label')).toBe('Share card: couldn\'t share')
    expect(button.querySelector('svg')!.getAttribute('class')).toContain('triangle-alert')
    expect(assertive.textContent).toBe('Couldn\'t share your card')
    vi.advanceTimersByTime(2000)
    await nextTick()
    expect(button.getAttribute('aria-label')).toBe('Share card')
    expect(button.querySelector('svg')!.getAttribute('class')).not.toContain('triangle-alert')
  })

  it('announces nothing when unmounted before the share completes', async () => {
    let finish!: () => void
    const promise = new Promise<void>((resolve) => { finish = resolve })
    stubShare(() => promise)
    const { button, unmount } = mount({})
    button.click()
    await settle()
    unmount()
    finish()
    await settle()
    expect([politeMessage.value, assertiveMessage.value]).toEqual(['', ''])
  })
})
