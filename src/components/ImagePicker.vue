<script setup lang="ts">
// Image picker — used by the GM controls (with `showPreview`/`showMobileWarn`/
// `showDrawSeconds`) and the /paint sandbox (without). Owns the file input,
// scale/colour controls, sample buttons, and runs the pipeline on change.

import type { PickerMeta, PipelineResult } from '../lib/pipeline'
import { Loader2, TriangleAlert } from '@lucide/vue'
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'
import { PixelCanvas } from '../lib/canvas'
import {
  DEFAULT_COLOR_COUNT,
  DEFAULT_SCALE,
  gridSizeFor,
  isMobileWarning,

  processImage,
} from '../lib/pipeline'

// The bundled sample images (`public/assets/<name>.png`). Add a sample by
// dropping the png in and appending an entry to `samples` below.
type SampleName = 'monalisa' | 'scream' | 'pearls'

interface Props {
  showMobileWarn?: boolean
  showDrawSeconds?: boolean
  showPreview?: boolean
  // Auto-load a sample on first render. Useful for the sandbox where an image
  // is required.
  autoLoadSample?: SampleName
}
const props = defineProps<Props>()

const emit = defineEmits<{
  result: [result: PipelineResult, meta: PickerMeta]
  // Fires when input changes but before processing finishes — caller can use
  // this to disable a Start button etc.
  processing: []
}>()

const scale = ref(DEFAULT_SCALE)
const colorCount = ref(DEFAULT_COLOR_COUNT)
const drawSecs = ref(120)
// `status` carries user-facing *messages* (errors) only; in-flight processing is
// `busy`, so the spinner never has to sniff the message string.
const status = ref('')
const busy = ref(false)
const showWarn = ref(false)

// Colour-count options — the number is what the player actually cares about, so
// the segmented control shows it and the friendly wording rides along as the
// accessible name.
const COLOUR_OPTIONS: { value: number, label: string }[] = [
  { value: 8, label: 'Very few colours' },
  { value: 16, label: 'A normal number of colours' },
  { value: 24, label: 'A bit more colours' },
  { value: 32, label: 'A lot more colours' },
]

defineExpose({ getDrawSeconds: () => drawSecs.value })

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const previewSlot = useTemplateRef<HTMLDivElement>('previewSlot')

let cachedFile: File | null = null
let runId = 0
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// Labels stay short — the caption sits under the thumbnail on one line, and a
// long title would stretch the button far wider than its image.
const samples: { name: SampleName, label: string }[] = [
  { name: 'monalisa', label: 'Mona Lisa' },
  { name: 'scream', label: 'The Scream' },
  { name: 'pearls', label: 'Pearl Earring' },
]

// Which sample is currently loaded — drives the selected state. `null` once an
// uploaded file takes over, so the swatches stop claiming credit for it.
const selected = ref<SampleName | null>(null)

// Label for whatever is loaded — the sample's title, or the uploaded filename.
const sourceLabel = ref('')

const showWarnNode = computed(() => props.showMobileWarn && showWarn.value)

// Normalised source dimensions of the loaded image, kept from the last result.
// They don't depend on scale, so the grid readout below can be recomputed live
// while the slider moves — no reprocessing, no lag, and no drift from what the
// pipeline will actually produce (both call `gridSizeFor`).
const sourceDims = ref<{ w: number, h: number } | null>(null)

const gridPreview = computed(() => {
  if (!sourceDims.value)
    return ''
  const { gridW, gridH } = gridSizeFor(sourceDims.value.w, sourceDims.value.h, scale.value)
  return `${gridW}×${gridH}`
})

function sampleUrl(name: SampleName) {
  return `${import.meta.env.BASE_URL}assets/${name}.png`
}

async function reprocess() {
  if (!cachedFile)
    return
  const myRun = ++runId
  busy.value = true
  status.value = ''
  // The previous preview deliberately stays on screen (dimmed by `is-busy`)
  // rather than being cleared — blanking it flashed an empty box on every
  // slider nudge, which read as slower than it was.
  showWarn.value = false
  emit('processing')

  try {
    const result = await processImage(cachedFile, scale.value, colorCount.value)
    if (myRun !== runId)
      return // stale

    busy.value = false
    sourceDims.value = { w: result.sourceW, h: result.sourceH }
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

    emit('result', result, { source: sourceLabel.value, colours: colorCount.value })
  }
  catch (err) {
    if (myRun !== runId)
      return
    busy.value = false
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
  selected.value = null
  sourceLabel.value = file.name
  reprocess()
}

async function loadSample(name: SampleName) {
  try {
    const res = await fetch(sampleUrl(name))
    if (!res.ok)
      throw new Error(`${res.status} ${res.statusText}`)
    const blob = await res.blob()
    cachedFile = new File([blob], `${name}.png`, { type: blob.type || 'image/png' })
    selected.value = name
    sourceLabel.value = samples.find(s => s.name === name)?.label ?? name
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
        <!-- Value + the grid it produces. The dims are computed, not measured,
             so they track the slider instantly instead of waiting on a run. -->
        <span class="picker__scale-out">
          <span class="picker__scale-val">{{ scale }}</span>
          <span v-if="gridPreview" class="picker__scale-grid">→ {{ gridPreview }}</span>
          <!-- Busy indicator lives here, in the eye-line of the control being
               dragged, rather than at the bottom of the card. Always rendered so
               it reserves its space — appearing/disappearing would nudge the
               slider's width and make the thumb twitch mid-drag. -->
          <Loader2
            class="picker__spinner"
            :class="{ 'is-on': busy }"
            :size="14"
            aria-hidden="true"
          />
          <span v-if="busy" class="picker__sr">Processing…</span>
        </span>
      </label>

      <div class="picker__setting-row">
        <div class="picker__setting picker__setting--inline">
          <span id="picker-colours" class="picker__setting-label">Colours</span>
          <div class="segmented segmented--wide" role="group" aria-labelledby="picker-colours">
            <button
              v-for="opt in COLOUR_OPTIONS"
              :key="opt.value"
              class="segmented__item"
              :class="{ 'segmented__item--active': colorCount === opt.value }"
              type="button"
              :aria-label="opt.label"
              :aria-pressed="colorCount === opt.value"
              @click="colorCount = opt.value"
            >
              {{ opt.value }}
            </button>
          </div>
        </div>

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
        <ul class="picker__sample-list">
          <li v-for="s in samples" :key="s.name">
            <button
              class="picker__sample"
              :class="{ 'is-selected': selected === s.name }"
              type="button"
              :aria-pressed="selected === s.name"
              @click="loadSample(s.name)"
            >
              <img class="picker__sample-thumb" :src="sampleUrl(s.name)" :alt="s.label">
              <span class="picker__sample-name">{{ s.label }}</span>
            </button>
          </li>
        </ul>
      </div>

      <p v-if="showWarnNode" class="picker__warn">
        <TriangleAlert :size="16" />
        <span>Grid exceeds 64px on its longest side — mobile players may struggle.</span>
      </p>

      <p v-if="status" class="picker__status">
        {{ status }}
      </p>

      <div v-if="showPreview" ref="previewSlot" class="picker__preview" :class="{ 'is-busy': busy }" />
    </div>
  </div>
</template>
