<script setup lang="ts">
// The salon wall: a horizontally-scrolling grid of hung frames — real drawings, the GM's
// target as the "original", and faded fillers between them. Owns the walk interaction
// (drag-to-scroll, vertical-wheel mapping, arrow-key focus) and opens a drawing on click or
// Enter. Anonymous by design: no names or avatars, just the drawings.

import type { ComponentPublicInstance } from 'vue'
import type { VoteCategoryMeta, WallItem } from '@/lib'
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { asset, salonItemStyle } from '@/lib'
import SalonFrame from './SalonFrame.vue'

const props = defineProps<{
  items: WallItem[]
  palette: string[]
  count: number
  mySubmissionId: string | null
  awardsOn: (submissionId: string) => VoteCategoryMeta[]
}>()
const emit = defineEmits<{ open: [realIndex: number] }>()

const wallEl = useTemplateRef<HTMLElement>('wall')
const pieceEls = ref<HTMLElement[]>([])
const reduce = matchMedia('(prefers-reduced-motion: reduce)')
const drag = { active: false, startX: 0, startScroll: 0, moved: false }
const dragging = ref(false)

function setPieceEl(i: number, el: Element | ComponentPublicInstance | null) {
  if (el)
    pieceEls.value[i] = el as HTMLElement
}
function scrollPieceIntoView(i: number) {
  pieceEls.value[i]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduce.matches ? 'auto' : 'smooth' })
}
// Return focus to a drawing — used on arrow-key walk and when the close-up modal closes.
function focusPiece(i: number) {
  const j = Math.max(0, Math.min(props.count - 1, i))
  pieceEls.value[j]?.focus()
  scrollPieceIntoView(j)
}
defineExpose({ focusPiece })

function requestOpen(i: number) {
  if (drag.moved)
    return // a drag-to-scroll ended here, not a click
  emit('open', i)
}
function onPieceKey(e: KeyboardEvent, i: number) {
  if (e.key === 'ArrowRight') { e.preventDefault(); focusPiece(i + 1) }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); focusPiece(i - 1) }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); requestOpen(i) }
}
function onWallPointerDown(e: PointerEvent) {
  if (e.button !== 0 || !wallEl.value)
    return
  drag.active = true
  drag.moved = false
  drag.startX = e.clientX
  drag.startScroll = wallEl.value.scrollLeft
  window.addEventListener('pointermove', onWallPointerMove)
  window.addEventListener('pointerup', onWallPointerUp)
  window.addEventListener('pointercancel', onWallPointerUp)
}
function onWallPointerMove(e: PointerEvent) {
  if (!drag.active || !wallEl.value)
    return
  const dx = e.clientX - drag.startX
  if (Math.abs(dx) > 5) {
    drag.moved = true
    dragging.value = true
  }
  if (drag.moved)
    wallEl.value.scrollLeft = drag.startScroll - dx
}
function onWallPointerUp() {
  drag.active = false
  dragging.value = false
  window.removeEventListener('pointermove', onWallPointerMove)
  window.removeEventListener('pointerup', onWallPointerUp)
  window.removeEventListener('pointercancel', onWallPointerUp)
  setTimeout(() => { drag.moved = false }, 0)
}
// Plain-mouse users can't shift-wheel: map a dominant vertical wheel onto horizontal scroll,
// yielding to the page at the wall's edges so it never traps the page.
function onWheel(e: WheelEvent) {
  const el = wallEl.value
  if (!el || Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth)
    return
  const atStart = el.scrollLeft <= 0 && e.deltaY < 0
  const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 && e.deltaY > 0
  if (atStart || atEnd)
    return
  el.scrollLeft += e.deltaY
  e.preventDefault()
}

onMounted(() => wallEl.value?.addEventListener('wheel', onWheel, { passive: false }))
onBeforeUnmount(() => wallEl.value?.removeEventListener('wheel', onWheel))
</script>

<template>
  <div
    ref="wall"
    class="salon-wall"
    :class="{ 'is-dragging': dragging }"
    role="list"
    aria-label="Exhibition wall"
    @pointerdown="onWallPointerDown"
  >
    <template v-for="item in items" :key="item.key">
      <article
        v-if="item.kind === 'piece'"
        :ref="el => setPieceEl(item.realIndex, el)"
        class="salon-wall__item salon-wall__item--piece"
        :class="{ 'is-mine': item.submissionId === mySubmissionId }"
        :style="salonItemStyle(item)"
        role="listitem"
        tabindex="0"
        :aria-label="item.submissionId === mySubmissionId ? 'Your drawing' : `Drawing ${item.realIndex + 1} of ${count}`"
        @click="requestOpen(item.realIndex)"
        @keydown="onPieceKey($event, item.realIndex)"
      >
        <SalonFrame :grid-w="item.gw" :grid-h="item.gh" :palette="palette" :grid="item.grid">
          <span v-if="item.submissionId === mySubmissionId" class="salon-frame__tag">yours</span>
          <div v-if="awardsOn(item.submissionId).length" class="salon-frame__badges">
            <img v-for="c in awardsOn(item.submissionId)" :key="c.id" :src="asset(c.icon)" :alt="c.label" class="salon-frame__badge">
          </div>
        </SalonFrame>
      </article>

      <div
        v-else-if="item.kind === 'original'"
        class="salon-wall__item salon-wall__item--original"
        :style="salonItemStyle(item)"
        role="listitem"
        aria-label="The original, not in the running"
      >
        <SalonFrame :grid-w="item.gw" :grid-h="item.gh" :palette="palette" :grid="item.grid">
          <span class="salon-frame__tag salon-frame__tag--original">original</span>
        </SalonFrame>
      </div>

      <div v-else class="salon-wall__item salon-wall__item--filler" :style="salonItemStyle(item)" aria-hidden="true">
        <SalonFrame :grid-w="item.gw" :grid-h="item.gh" :palette="palette" :grid="item.grid" />
      </div>
    </template>
  </div>
</template>
