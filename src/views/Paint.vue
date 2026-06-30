<script setup lang="ts">
// Paint sandbox — solo canvas, no lobby/socket/timer. Picker on the left, the
// canvas pair (target + editable + tools) on the right. Pair re-mounts each
// time the picker emits a new result, so PixelCanvas instances tear down cleanly.

import type { PipelineResult } from '../lib/pipeline'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import CanvasPair from '../components/CanvasPair.vue'
import ImagePicker from '../components/ImagePicker.vue'
import Tagline from '../components/Tagline.vue'

const result = ref<PipelineResult | null>(null)
const pairRef = ref<InstanceType<typeof CanvasPair> | null>(null)

// Settings start open; collapse automatically once the first image is loaded
// so the canvas gets the focus. The toggle re-opens them for a quick tweak.
const settingsOpen = ref(true)
let collapsedOnce = false

const base = import.meta.env.BASE_URL.replace(/\/+$/, '')
const backHref = `${base}/`

function onResult(next: PipelineResult) {
  result.value = next
  if (!collapsedOnce) {
    collapsedOnce = true
    settingsOpen.value = false
  }
}

// Cmd/Ctrl+Z → undo on the active canvas.
function onKeyDown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
    e.preventDefault()
    pairRef.value?.player()?.undo()
  }
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))
</script>

<template>
  <div class="paint">
    <a class="paint__back" :href="backHref">← Back to entry</a>
    <h1 class="paint__title">
      Paint sandbox
    </h1>
    <Tagline class="paint__sub" seed="solo sandbox, no lobby, no timer" />

    <div class="paint__row">
      <div class="paint__settings">
        <button
          class="paint__toggle"
          type="button"
          :aria-expanded="settingsOpen"
          @click="settingsOpen = !settingsOpen"
        >
          <span>⚙ Settings</span>
          <span class="paint__chevron">{{ settingsOpen ? "▴" : "▾" }}</span>
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
      />
    </div>
  </div>
</template>
