<script setup lang="ts">
// Paint sandbox — solo canvas, no lobby/socket/timer. Picker left, canvas pair right;
// the pair re-mounts on each new picker result so PixelCanvas instances tear down cleanly.
// The chosen image, its settings and the canvas progress persist across reloads (lib/paintSession).

import type { PickerMeta, PipelineResult } from '@/lib'
import { ChevronDown, ChevronUp, Eraser, Settings } from '@lucide/vue'
import { computed, onBeforeUnmount, ref } from 'vue'
import Button from '@/components/elements/Button.vue'
import Tagline from '@/components/elements/Tagline.vue'
import { DrawBoard, ImagePicker } from '@/components/game'
import PhaseLayout from '@/components/layout/PhaseLayout.vue'
import { appHref, loadPaintSession, savePaintSession, useOrientation } from '@/lib'

const result = ref<PipelineResult | null>(null)
const meta = ref<PickerMeta | null>(null)
const pairRef = ref<InstanceType<typeof DrawBoard> | null>(null)

// Restore a previous session up front. `restoredGrid` seeds the canvas once (mount only);
// `currentGrid` tracks the live drawing for the header's Clear control and the debounced save.
const saved = loadPaintSession()
const restoredGrid = ref<number[] | null>(saved?.grid ?? null)
const currentGrid = ref<number[]>(saved?.grid ?? [])
// Skip the ImagePicker's default sample when we've restored an image, or it would overwrite it.
const autoLoadSample = saved ? undefined : 'monalisa'

// Settings start open, collapsing once the first image loads; a restored session opens collapsed.
const settingsOpen = ref(!saved)
let collapsedOnce = Boolean(saved)

if (saved) {
  result.value = saved.result
  meta.value = saved.meta
}

const backHref = appHref()

// Ratio-aware layout matching DRAWING: the canvas pair flips between row and column.
const orientation = useOrientation(() => result.value?.gridW, () => result.value?.gridH)

const hasDrawing = computed(() => currentGrid.value.some(cell => cell !== -1))

function onResult(next: PipelineResult, nextMeta: PickerMeta) {
  result.value = next
  meta.value = nextMeta
  // A new image starts on a blank canvas: drop the restored seed and persist the fresh state.
  const blank = Array.from<number>({ length: next.gridW * next.gridH }).fill(-1)
  restoredGrid.value = null
  currentGrid.value = blank
  savePaintSession(next, nextMeta, blank)
  if (!collapsedOnce) {
    collapsedOnce = true
    settingsOpen.value = false
  }
}

// Persist the drawing off the hot path — a stroke fires this often, so coalesce the writes.
let saveTimer: ReturnType<typeof setTimeout> | null = null
function onDrawUpdate(grid: number[]) {
  currentGrid.value = grid
  const r = result.value
  const m = meta.value
  if (!r || !m)
    return
  if (saveTimer)
    clearTimeout(saveTimer)
  saveTimer = setTimeout(savePaintSession, 600, r, m, grid)
}

function clearDrawing() {
  // Blanks the canvas (undoable); the resulting update persists the empty grid.
  pairRef.value?.clear()
}

onBeforeUnmount(() => {
  // Flush a pending save so navigating away within the debounce window doesn't lose strokes.
  if (saveTimer) {
    clearTimeout(saveTimer)
    if (result.value && meta.value)
      savePaintSession(result.value, meta.value, currentGrid.value)
  }
})

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
      <Button
        v-if="result && !settingsOpen"
        variant="tertiary"
        size="small"
        collapse
        title="Clear drawing"
        aria-label="Clear drawing"
        :disabled="!hasDrawing"
        @click="clearDrawing"
      >
        <template #icon>
          <Eraser :size="16" aria-hidden="true" />
        </template>
        Clear drawing
      </Button>
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
            :auto-load-sample="autoLoadSample"
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
          :initial-grid="restoredGrid"
          variant="paint"
          :orientation="orientation"
          @update="onDrawUpdate"
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
