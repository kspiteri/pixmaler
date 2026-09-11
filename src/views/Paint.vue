<script setup lang="ts">
// Paint sandbox — solo canvas, no lobby/socket/timer. Picker left, canvas pair right;
// the pair re-mounts on each new picker result so PixelCanvas instances tear down cleanly.

import type { PickerMeta, PipelineResult } from '@/lib'
import { ChevronDown, ChevronUp, Settings } from '@lucide/vue'
import { computed, ref } from 'vue'
import Tagline from '@/components/elements/Tagline.vue'
import { DrawBoard, ImagePicker } from '@/components/game'
import PhaseLayout from '@/components/layout/PhaseLayout.vue'
import { appHref, useOrientation } from '@/lib'

const result = ref<PipelineResult | null>(null)
const meta = ref<PickerMeta | null>(null)
const pairRef = ref<InstanceType<typeof DrawBoard> | null>(null)

// Settings start open, collapse once the first image loads; the toggle re-opens them.
const settingsOpen = ref(true)
let collapsedOnce = false

const backHref = appHref()

// Ratio-aware layout matching DRAWING: the canvas pair flips between row and column.
const orientation = useOrientation(() => result.value?.gridW, () => result.value?.gridH)

function onResult(next: PipelineResult, nextMeta: PickerMeta) {
  result.value = next
  meta.value = nextMeta
  if (!collapsedOnce) {
    collapsedOnce = true
    settingsOpen.value = false
  }
}

// Collapsed toggle caption — "Mona Lisa · 32×48 · 16 colours".
const summary = computed(() => {
  if (!result.value || !meta.value)
    return ''
  const { gridW, gridH, palette } = result.value
  // The palette that came back, not the count the GM asked for: a flat image cannot
  // always fill that count, so the caption must not claim it did.
  return [meta.value.source, `${gridW}×${gridH}`, `${palette.length} colours`]
    .filter(Boolean)
    .join(' · ')
})
</script>

<template>
  <PhaseLayout
    heading="Practice"
    :home="backHref"
    class="phase--fixed paint"
    :class="{ 'paint--settings-open': settingsOpen }"
  >
    <template #status>
      <Tagline class="paint__sub" seed="solo sandbox, no lobby, no timer" />
    </template>

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

      <!-- Only while settings are collapsed: opening them unmounts the pair and its
           teleported palette, so neither overlaps the panel. -->
      <template v-if="!settingsOpen">
        <DrawBoard
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
      </template>
    </div>
  </PhaseLayout>
</template>
