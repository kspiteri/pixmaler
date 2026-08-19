<script setup lang="ts">
// Paint sandbox — solo canvas, no lobby/socket/timer. Picker on the left, the
// canvas pair (target + editable + tools) on the right. Pair re-mounts each
// time the picker emits a new result, so PixelCanvas instances tear down cleanly.

import type { PickerMeta, PipelineResult } from '../lib/pipeline'
import { ChevronDown, ChevronUp, Settings } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import CanvasPair from '../components/CanvasPair.vue'
import ImagePicker from '../components/ImagePicker.vue'
import Tagline from '../components/Tagline.vue'
import { orientationFor } from '../lib/aspect'

const result = ref<PipelineResult | null>(null)
const meta = ref<PickerMeta | null>(null)
const pairRef = ref<InstanceType<typeof CanvasPair> | null>(null)

// Settings start open; collapse automatically once the first image is loaded
// so the canvas gets the focus. The toggle re-opens them for a quick tweak.
const settingsOpen = ref(true)
let collapsedOnce = false

const base = import.meta.env.BASE_URL.replace(/\/+$/, '')
const backHref = `${base}/`

// Ratio-aware layout, matching the DRAWING phase (item 5): the canvas pair
// flips between a row (reference beside the canvas) and a column (stacked) so
// the editable canvas always claims the largest fitting area. `orientationFor`
// compares the grid's aspect to the live viewport.
const viewportW = ref(window.innerWidth)
const viewportH = ref(window.innerHeight)
function onResize() {
  viewportW.value = window.innerWidth
  viewportH.value = window.innerHeight
}
const orientation = computed(() =>
  result.value
    ? orientationFor(result.value.gridW, result.value.gridH, viewportW.value, viewportH.value)
    : 'row',
)

function onResult(next: PipelineResult, nextMeta: PickerMeta) {
  result.value = next
  meta.value = nextMeta
  if (!collapsedOnce) {
    collapsedOnce = true
    settingsOpen.value = false
  }
}

// Collapsed toggle caption — "Mona Lisa · 32×48 · 16 colours" — so the player
// can see what they're painting without re-opening the panel.
const summary = computed(() => {
  if (!result.value || !meta.value)
    return ''
  const { gridW, gridH } = result.value
  return [meta.value.source, `${gridW}×${gridH}`, `${meta.value.colours} colours`]
    .filter(Boolean)
    .join(' · ')
})

// Cmd/Ctrl+Z → undo on the active canvas.
function onKeyDown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
    e.preventDefault()
    pairRef.value?.player()?.undo()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <div class="paint">
    <a class="paint__back" :href="backHref">← Back to Homepage</a>
    <h1 class="paint__title">
      Paint Sandbox
    </h1>
    <Tagline class="paint__sub" seed="solo sandbox, no lobby, no timer" />

    <div class="paint__row">
      <div class="paint__settings">
        <button
          class="paint__toggle pressable"
          type="button"
          :aria-expanded="settingsOpen"
          @click="settingsOpen = !settingsOpen"
        >
          <span class="paint__toggle-label">
            <Settings :size="16" />
            <span>Settings</span>
            <span v-if="!settingsOpen && summary" class="paint__toggle-summary">
              · {{ summary }}
            </span>
          </span>
          <span class="paint__chevron">
            <ChevronUp v-if="settingsOpen" :size="16" />
            <ChevronDown v-else :size="16" />
          </span>
        </button>
        <div v-show="settingsOpen" class="paint__settings-body">
          <ImagePicker
            auto-load-sample="monalisa"
            @result="onResult"
          />
        </div>
      </div>

      <CanvasPair
        v-if="result"
        ref="pairRef"
        :key="`${result.gridW}x${result.gridH}-${result.palette.join(',')}`"
        :grid-w="result.gridW"
        :grid-h="result.gridH"
        :palette="result.palette"
        :target-grid="result.targetGrid"
        variant="paint"
        :orientation="orientation"
      />
      <div v-else class="paint__skeleton" role="status">
        <div class="paint__skeleton-box" />
        <p class="paint__skeleton-text">
          Preparing canvas…
        </p>
      </div>
    </div>
  </div>
</template>
