// The app's one modal surface, as an awaitable call: `AlertDialog` emits rather
// than returning, so requests queue here and call sites keep reading like the
// native calls did — `if (!await askConfirm('End voting now?')) return`.
// Module-level, not a composable: there is one dialog for the whole app.

import { computed, ref } from 'vue'

export type DialogMode = 'alert' | 'confirm'

interface DialogRequest {
  // Keys the <AlertDialog> so each request mounts a fresh element — showModal()
  // runs in onMounted, so reusing one element leaves the next request invisible.
  id: number
  message: string
  mode: DialogMode
  resolve: (answer: boolean) => void
}

let nextId = 0

// A queue, not a slot: a server rejection can land while a confirm is open, and
// neither dropping the error nor letting it answer the confirm is acceptable.
const queue = ref<DialogRequest[]>([])

export const currentDialog = computed(() => queue.value[0] ?? null)

function ask(message: string, mode: DialogMode): Promise<boolean> {
  return new Promise((resolve) => {
    queue.value = [...queue.value, { id: nextId++, message, mode, resolve }]
  })
}

// One action, so there's no answer to return; it resolves when dismissed.
export async function askAlert(message: string): Promise<void> {
  await ask(message, 'alert')
}

export function askConfirm(message: string): Promise<boolean> {
  return ask(message, 'confirm')
}

export function settleDialog(answer: boolean): void {
  const [head, ...rest] = queue.value
  if (!head)
    return
  queue.value = rest
  head.resolve(answer)
}
