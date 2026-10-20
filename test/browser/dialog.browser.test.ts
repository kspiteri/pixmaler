// B8 — dialog focus & queue: lib/dialog.ts driving the real <AlertDialog> on a native
// <dialog>. showModal gives platform focus to the mode-correct button, the native `cancel`
// event (Esc) resolves the awaited promise without leaking an element, and two queued
// requests resolve in FIFO order. None of this is observable without a live modal.

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import AlertDialog from '@/components/elements/AlertDialog.vue'
import { askAlert, askConfirm, currentDialog, settleDialog } from '@/lib'

const unmounts: Array<() => void> = []

// The App.vue host: render the queue head on a keyed <AlertDialog> and settle on its events.
function mountHost() {
  const app = createApp(defineComponent({
    setup() {
      return () => {
        const d = currentDialog.value
        return d
          ? h(AlertDialog, {
              key: d.id,
              message: d.message,
              mode: d.mode,
              confirmLabel: d.confirmLabel,
              cancelLabel: d.cancelLabel,
              onConfirm: () => settleDialog(true),
              onCancel: () => settleDialog(false),
            })
          : null
      }
    },
  }))
  const host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  unmounts.push(() => app.unmount())
}

function dialogEl(): HTMLDialogElement {
  return document.querySelector('dialog.alert-dialog')!
}

function buttonByText(text: string): HTMLButtonElement {
  return [...dialogEl().querySelectorAll('button')].find(b => b.textContent?.trim() === text)!
}

afterEach(() => {
  // Drain any request a failing test left queued so module state never leaks across tests.
  while (currentDialog.value)
    settleDialog(false)
  unmounts.splice(0).forEach(unmount => unmount())
  document.body.replaceChildren()
})

describe('dialog focus & queue (browser)', () => {
  it('a confirm opens focused on its cancel button', async () => {
    mountHost()
    void askConfirm('End voting now?', { confirm: 'End voting' })
    await nextTick()
    expect(document.activeElement).toBe(buttonByText('Cancel'))
  })

  it('an alert opens focused on its sole action', async () => {
    mountHost()
    void askAlert('Saved.')
    await nextTick()
    expect(document.activeElement).toBe(buttonByText('OK'))
  })

  it('esc resolves a confirm as false and leaves no dialog behind', async () => {
    mountHost()
    const answer = askConfirm('End voting now?', { confirm: 'End voting' })
    await nextTick()
    dialogEl().dispatchEvent(new Event('cancel', { cancelable: true }))
    expect(await answer).toBe(false)
    await nextTick()
    expect(document.querySelector('dialog.alert-dialog')).toBeNull()
  })

  it('two queued dialogs resolve in FIFO order', async () => {
    mountHost()
    const order: string[] = []
    const first = askConfirm('First?', { confirm: 'Yes' }).then((a) => { order.push(`first:${a}`); return a })
    const second = askConfirm('Second?', { confirm: 'Yes' }).then((a) => { order.push(`second:${a}`); return a })
    await nextTick()
    expect(dialogEl().textContent).toContain('First?')
    buttonByText('Yes').click()
    await nextTick()
    expect(dialogEl().textContent).toContain('Second?')
    buttonByText('Yes').click()
    await Promise.all([first, second])
    expect(order).toEqual(['first:true', 'second:true'])
  })
})
