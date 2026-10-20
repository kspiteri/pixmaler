// B9 — InfoModal backdrop hit-test: the modal compares click coordinates against the laid-out
// <dialog> box, so a click on its own padding (inside the box) must not close while a click at
// true backdrop coordinates must. Only a real showModal layout gives a box to test against.

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'
import InfoModal from '@/components/elements/InfoModal.vue'
import { activeInfo } from '@/lib'

const unmounts: Array<() => void> = []

async function mountInfo() {
  activeInfo.value = 'privacy'
  const app = createApp(InfoModal)
  const host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  unmounts.push(() => app.unmount())
  await nextTick()
}

function dialogEl(): HTMLDialogElement {
  return document.querySelector('dialog.info-modal')!
}

function clickAt(x: number, y: number) {
  dialogEl().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }))
}

afterEach(() => {
  activeInfo.value = null
  unmounts.splice(0).forEach(unmount => unmount())
  document.body.replaceChildren()
})

describe('infoModal backdrop hit-test (browser)', () => {
  it('a click at true backdrop coordinates closes it', async () => {
    await mountInfo()
    clickAt(1, 1)
    expect(activeInfo.value).toBeNull()
  })

  it('a click inside the dialog box (its padding) keeps it open', async () => {
    await mountInfo()
    const r = dialogEl().getBoundingClientRect()
    clickAt(r.left + 2, r.top + 2)
    expect(activeInfo.value).toBe('privacy')
    clickAt(r.left + r.width / 2, r.top + r.height / 2)
    expect(activeInfo.value).toBe('privacy')
  })
})
