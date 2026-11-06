<script setup lang="ts">
// A framed piece hanging on its nail: registers with the wall scene, binds its angle, and
// forwards pointer events. `wall.ts` holds the physics. Inert under reduced motion.

import type { Piece } from './wall'
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { prefersReducedMotion } from '@/lib'
import { addPiece, drag, grab, measureAll, release, removePiece, WONK_ART } from './wall'

const props = defineProps<{
  // Resting tilt and the bound a knock may re-roll within, both in multiples of `$wonk-art` (1.5°).
  tilt: number
  range: number
}>()

const root = useTemplateRef<HTMLElement>('root')
// Zero-sized and on the rotation origin, so its rect is the nail at any angle.
const pivot = useTemplateRef<HTMLElement>('pivot')

const angle = ref(props.tilt * WONK_ART)
// The pointer that owns the swing, so a second finger cannot take it over.
const grabbed = ref<number | null>(null)

let piece: Piece | null = null
let resize: ResizeObserver | null = null

onMounted(() => {
  const el = root.value!
  piece = addPiece({
    tilt: props.tilt,
    range: props.range,
    measure: () => {
      const nail = pivot.value!.getBoundingClientRect()
      // `offsetWidth`/`offsetHeight`, not a rect: the physics want the unrotated box.
      return { pivotX: nail.left, pivotY: nail.top, halfWidth: el.offsetWidth / 2, height: el.offsetHeight }
    },
    write: (deg) => { angle.value = deg },
  })
  // The wall is sized off the viewport and every piece is a fraction of it, so anything that
  // moves a frame also resizes it — and a contact solved against stale nails hits thin air.
  resize = new ResizeObserver(() => measureAll())
  resize.observe(el)
})

onBeforeUnmount(() => {
  resize?.disconnect()
  resize = null
  if (piece)
    removePiece(piece)
})

function onDown(e: PointerEvent) {
  if (!piece || grabbed.value !== null || e.button !== 0 || prefersReducedMotion())
    return
  grabbed.value = e.pointerId
  // Best-effort: the swing still works without capture, it just stops at the element's edge.
  try {
    root.value?.setPointerCapture(e.pointerId)
  }
  catch {}
  grab(piece, e.clientX, e.clientY)
}

function onMove(e: PointerEvent) {
  if (piece && e.pointerId === grabbed.value)
    drag(piece, e.clientX, e.clientY)
}

// A second finger must not re-base the grab mid-drag, or lifting the first reads as a tap and
// re-rolls the tilt at the end of a long swing.
function onUp(e: PointerEvent) {
  if (!piece || e.pointerId !== grabbed.value)
    return
  grabbed.value = null
  release(piece)
}
</script>

<template>
  <div
    ref="root"
    class="entry__hang"
    :class="{ 'entry__hang--held': grabbed !== null }"
    :style="{ '--angle': `${angle.toFixed(2)}deg` }"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
  >
    <span ref="pivot" class="entry__pivot" aria-hidden="true" />
    <slot />
  </div>
</template>
