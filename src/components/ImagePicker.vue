<script setup lang="ts">
// Image picker — used by the GM controls (with `showPreview`/`showMobileWarn`/
// `showDrawSeconds`) and the /paint sandbox (without). Owns the file input,
// scale/colour controls, sample buttons, and runs the pipeline on change.

import type { PipelineResult } from '../lib/pipeline'
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'
import { PixelCanvas } from '../lib/canvas'
import {
  DEFAULT_COLOR_COUNT,
  DEFAULT_SCALE,
  isMobileWarning,

  processImage,
} from '../lib/pipeline'

interface Props {
  showMobileWarn?: boolean
  showDrawSeconds?: boolean
  showPreview?: boolean
  // Auto-load a sample on first render. Useful for the sandbox where an image
  // is required.
  autoLoadSample?: 'monalisa' | 'scream' | 'pearls'
}
const props = defineProps<Props>()

const emit = defineEmits<{
  result: [result: PipelineResult]
  // Fires when input changes but before processing finishes — caller can use
  // this to disable a Start button etc.
  processing: []
}>()

const scale = ref(DEFAULT_SCALE)
const colorCount = ref(DEFAULT_COLOR_COUNT)
const drawSecs = ref(120)
const status = ref('')
const showWarn = ref(false)

defineExpose({ getDrawSeconds: () => drawSecs.value })

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const previewSlot = useTemplateRef<HTMLDivElement>('previewSlot')

let cachedFile: File | null = null
let runId = 0
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const samples = ['monalisa', 'scream', 'pearls'] as const
const showWarnNode = computed(() => props.showMobileWarn && showWarn.value)

async function reprocess() {
  if (!cachedFile)
    return
  const myRun = ++runId
  status.value = 'Processing…'
  if (props.showPreview && previewSlot.value)
    previewSlot.value.replaceChildren()
  showWarn.value = false
  emit('processing')

  try {
    const result = await processImage(cachedFile, scale.value, colorCount.value)
    if (myRun !== runId)
      return // stale

    status.value = ''
    if (props.showMobileWarn) {
      showWarn.value = isMobileWarning(Math.max(result.gridW, result.gridH))
    }

    if (props.showPreview && previewSlot.value) {
      const label = document.createElement('p')
      label.textContent = `Target image (${result.gridW}×${result.gridH}):`
      const pc = new PixelCanvas({
        gridW: result.gridW,
        gridH: result.gridH,
        palette: result.palette,
        targetGrid: result.targetGrid,
        editable: false,
      })
      pc.canvas.style.maxWidth = '160px'
      pc.canvas.style.height = 'auto'
      previewSlot.value.replaceChildren(label, pc.canvas)
    }

    emit('result', result)
  }
  catch (err) {
    if (myRun !== runId)
      return
    status.value = `Error: ${err}`
  }
}

function scheduleReprocess() {
  if (debounceTimer)
    clearTimeout(debounceTimer)
  debounceTimer = setTimeout(reprocess, 150)
}

watch([scale, colorCount], scheduleReprocess)

function onFileChange() {
  const file = fileInput.value?.files?.[0]
  if (!file)
    return
  cachedFile = file
  reprocess()
}

async function loadSample(name: typeof samples[number]) {
  try {
    const url = `${import.meta.env.BASE_URL}assets/${name}.png`
    const res = await fetch(url)
    if (!res.ok)
      throw new Error(`${res.status} ${res.statusText}`)
    const blob = await res.blob()
    cachedFile = new File([blob], `${name}.png`, { type: blob.type || 'image/png' })
    if (fileInput.value)
      fileInput.value.value = ''
    reprocess()
  }
  catch (err) {
    status.value = `Could not load sample "${name}": ${err}`
  }
}

onMounted(() => {
  if (props.autoLoadSample)
    loadSample(props.autoLoadSample)
})
</script>

<template>
  <div class="picker">
    <!-- Settings card: scale + colours + draw seconds -->
    <div class="picker__card">
      <label class="picker__setting">
        <span class="picker__setting-label">Scale</span>
        <input
          v-model.number="scale"
          class="picker__scale"
          type="range" min="1" max="50"
        >
        <span class="picker__scale-val">{{ scale }}</span>
      </label>

      <div class="picker__setting-row">
        <label class="picker__setting picker__setting--inline">
          <span class="picker__setting-label">Colours</span>
          <select v-model.number="colorCount" class="picker__select">
            <option :value="8">Very few</option>
            <option :value="16">Normal</option>
            <option :value="24">A bit more</option>
            <option :value="32">A lot more</option>
          </select>
        </label>

        <label v-if="showDrawSeconds" class="picker__setting picker__setting--inline">
          <span class="picker__setting-label">Draw seconds</span>
          <input
            v-model.number="drawSecs"
            class="picker__time"
            type="number" min="30" max="600"
          >
        </label>
      </div>
    </div>

    <!-- Image card: upload + samples + preview -->
    <div class="picker__card">
      <div class="picker__upload-row">
        <span class="picker__setting-label">Upload image</span>
        <label class="picker__browse">
          Browse…
          <input ref="fileInput" type="file" accept="image/*" hidden @change="onFileChange">
        </label>
      </div>

      <div class="picker__samples">
        <span class="picker__samples-label">Or try a sample:</span>
        <button
          v-for="name in samples"
          :key="name"
          class="picker__sample"
          type="button"
          @click="loadSample(name)"
        >
          {{ name }}
        </button>
      </div>

      <p v-if="showWarnNode" class="picker__warn">
        ⚠ Grid exceeds 64px on its longest side — mobile players may struggle.
      </p>

      <p v-if="status" class="picker__status">
        {{ status }}
      </p>

      <div v-if="showPreview" ref="previewSlot" class="picker__preview" />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/tokens' as *;

.picker {
  display: flex;
  flex-wrap: wrap;
  gap: $gap-5;

  &__card {
    flex: 1 1 320px;
    background: $surface;
    border: 1px solid $border-soft;
    border-radius: $radius-lg;
    padding: $gap-4;
    display: flex;
    flex-direction: column;
    gap: $gap-4;
  }

  &__setting {
    display: flex;
    align-items: center;
    gap: $gap-4;

    &--inline {
      gap: $gap-2;
    }
  }
  &__setting-row {
    display: flex;
    flex-wrap: wrap;
    gap: $gap-4;
    align-items: center;
  }
  &__setting-label {
    color: $fg-60;
    font-size: 0.875rem;
    flex-shrink: 0;
  }

  &__scale {
    flex: 1;
    accent-color: $primary;
  }
  &__scale-val {
    font-family: $font-display;
    font-weight: 700;
    width: 1.5rem;
    text-align: center;
  }

  &__select,
  &__time {
    padding: 0.5rem 0.75rem;
    border-radius: $radius;
    background: $bg;
    border: 1px solid $border;
    color: $fg;
    font-family: $font-body;
    font-size: 0.875rem;

    &:focus {
      outline: none;
      border-color: $primary;
    }
  }
  &__time {
    width: 5rem;
    text-align: center;
  }

  &__upload-row {
    display: flex;
    align-items: center;
    gap: $gap-3;
  }
  &__browse {
    padding: 0.375rem 0.75rem;
    border-radius: $radius-sm;
    background: $bg;
    border: 1px solid $border;
    color: $fg-60;
    font-size: 0.875rem;
    cursor: pointer;
    transition:
      color 0.15s,
      border-color 0.15s;

    &:hover {
      color: $fg;
      border-color: $fg-25;
    }
  }

  &__samples {
    display: flex;
    gap: $gap-2;
    align-items: center;
    flex-wrap: wrap;
  }
  &__samples-label {
    color: $fg-40;
    font-size: 0.875rem;
  }
  &__sample {
    padding: 0.375rem 0.75rem;
    border-radius: $radius-sm;
    background: transparent;
    border: 1px solid $border;
    color: $fg-50;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      color: $fg;
      border-color: $fg-25;
    }
  }

  &__warn {
    margin: 0;
    color: $warn;
    font-size: 0.875rem;
  }
  &__status {
    margin: 0;
    color: $muted;
    font-size: 0.875rem;
  }

  &__preview {
    :deep(p) {
      margin: 0 0 $gap-2;
      color: $fg-40;
      font-size: 0.75rem;
    }
    :deep(canvas) {
      max-width: 160px;
      height: auto;
      border-radius: $radius-sm;
      border: 1px solid $border;
    }
  }
}
</style>
