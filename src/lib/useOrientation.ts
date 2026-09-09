// Ratio-aware layout for the two-pane canvas: track the viewport and derive whether the
// reference/canvas pair sits in a row or a column so the editable canvas claims the most
// area. Owns the resize listener. Falls back to 'row' until grid dimensions are known.

import type { ComputedRef } from 'vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { orientationFor } from './aspect'

export function useOrientation(
  gridW: () => number | null | undefined,
  gridH: () => number | null | undefined,
): ComputedRef<'row' | 'column'> {
  const w = ref(window.innerWidth)
  const h = ref(window.innerHeight)
  function onResize() {
    w.value = window.innerWidth
    h.value = window.innerHeight
  }
  onMounted(() => window.addEventListener('resize', onResize))
  onBeforeUnmount(() => window.removeEventListener('resize', onResize))

  return computed(() => {
    const gw = gridW()
    const gh = gridH()
    return gw && gh ? orientationFor(gw, gh, w.value, h.value) : 'row'
  })
}
