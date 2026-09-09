// Mount read-only PixelCanvases into Vue-managed `:ref` slots keyed by (group, key), for
// the voting and results galleries. Groups keep independent lifecycles: the same key can
// sit in two groups at once (a winner shown in both hero and gallery) without one group's
// unmount `:ref(null)` clearing the other's element. A thumb lists its groups in priority
// order and takes the first slot that exists.
//
// The two-tick wait is load-bearing: `flush: 'post'` does not guarantee the function-form
// `:ref` callbacks have run in Vue 3.5, so wait for the DOM patch (and a possible second
// patch from a v-if gate) before mounting.

import { nextTick, onBeforeUnmount, watch } from 'vue'
import { PixelCanvas } from '../canvas/pixel'

export interface ReadonlyThumb {
  groups: string[]
  key: string
  gridW: number
  gridH: number
  palette: string[]
  grid: number[]
}

export function useReadonlyCanvases(deps: () => unknown, thumbs: () => ReadonlyThumb[]) {
  const slots = new Map<string, HTMLElement>()
  let canvases: PixelCanvas[] = []
  const slotId = (group: string, key: string) => `${group}\u0000${key}`

  function setSlot(group: string, key: string, el: unknown) {
    if (el instanceof HTMLElement)
      slots.set(slotId(group, key), el)
    else slots.delete(slotId(group, key))
  }

  function mount() {
    canvases = []
    for (const t of thumbs()) {
      let slot: HTMLElement | undefined
      for (const g of t.groups) {
        slot = slots.get(slotId(g, t.key))
        if (slot)
          break
      }
      if (!slot)
        continue
      const pc = new PixelCanvas({
        gridW: t.gridW,
        gridH: t.gridH,
        palette: t.palette,
        targetGrid: t.grid,
        editable: false,
      })
      slot.replaceChildren(pc.canvas)
      canvases.push(pc)
    }
  }

  watch(deps, async () => {
    await nextTick()
    await nextTick()
    mount()
  }, { immediate: true })

  // Listeners live on the canvas elements; once they leave the DOM, dropping refs is enough.
  onBeforeUnmount(() => { canvases = [] })

  return { setSlot }
}
