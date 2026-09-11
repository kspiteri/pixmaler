<script setup lang="ts">
// Image picker — used by the GM controls (with `showPreview`/`showMobileWarn`/
// `showDrawSeconds`) and the /paint sandbox (without). Owns the file input, scale/colour/
// ratio controls, sample buttons, and runs the pipeline on change.

import type { CropSelection, PickerMeta, PipelineResult, TargetRatioId } from '@/lib'
import { Loader2, TriangleAlert } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { asset, clampDrawSeconds, CLASSIC_BASE, decodeImage, DEFAULT_BACKGROUND, DEFAULT_COLOR_COUNT, DEFAULT_RATIO, DEFAULT_SCALE, DRAW_SECONDS_MAX, DRAW_SECONDS_MIN, FULL_CROP, gridSizeFor, hasTransparency, ImageDecodeError, isHeic, isMobileWarning, nearestRatioFor, PixelCanvas, processImage, rgbToHex, unsupportedImage } from '@/lib'
import CropWidget from './CropWidget.vue'

// The bundled sample images (`public/assets/<name>.png`).
type SampleName = 'monalisa' | 'scream' | 'pearls'

interface Props {
  showMobileWarn?: boolean
  showDrawSeconds?: boolean
  showPreview?: boolean
  // Autoload a sample on first render, for the sandbox where an image is required.
  autoLoadSample?: SampleName
}
const props = defineProps<Props>()

const emit = defineEmits<{
  result: [result: PipelineResult, meta: PickerMeta]
  // Fires when input changes but before processing finishes — lets a caller disable Start.
  processing: []
}>()

const scale = ref(DEFAULT_SCALE)
const colorCount = ref(DEFAULT_COLOR_COUNT)
// Target shape. Preselected from the loaded image's own framing (`nearestRatioFor`).
const ratio = ref<TargetRatioId>(DEFAULT_RATIO)
// What part of the source to keep. Source-relative, so switching ratio keeps the framing.
const crop = ref<CropSelection>({ ...FULL_CROP })
// What shows through a transparent upload, and whether this image has any. Sticky: the
// choice survives an opaque image in between and returns on the next transparent upload.
const background = ref(DEFAULT_BACKGROUND)
const hasAlpha = ref(false)
// Natural size of the loaded image, read once on adopt; resolves the crop and overlay shape.
const naturalDims = ref<{ w: number, h: number } | null>(null)
// Object URL for the crop widget's preview. Revoked whenever it is replaced.
const sourceUrl = ref('')
const DEFAULT_DRAW_SECONDS = 120
const drawSecs = ref(DEFAULT_DRAW_SECONDS)
// The floor is stated in the label and applied here on commit — HTML `min` doesn't stop a
// typed value, and an under-floor config is rejected server-side, blocking Start silently.
function commitDrawSecs() {
  // An emptied input yields NaN via `v-model.number`, which would put an unstartable config
  // on the wire.
  drawSecs.value = Number.isFinite(drawSecs.value)
    ? clampDrawSeconds(drawSecs.value)
    : DEFAULT_DRAW_SECONDS
}
// `status` carries user-facing messages (errors) only; in-flight processing is `busy`.
const status = ref('')
const busy = ref(false)
const showWarn = ref(false)

// Colour-count options — the number is what the player cares about, so the control shows it
// and the friendly wording rides along as the accessible name.
const COLOUR_OPTIONS: { value: number, label: string }[] = [
  { value: 8, label: 'Very few colours' },
  { value: 16, label: 'A normal number of colours' },
  { value: 24, label: 'Slightly more colours' },
  { value: 32, label: 'Many more colours' },
]

// The six fill-ramp anchors, reused as background choices: whatever the GM picks is a colour
// the swatch can also express, so a player can paint the background back in.
const BACKGROUND_OPTIONS = CLASSIC_BASE.map(({ name, rgb }) => ({ name, hex: rgbToHex(...rgb) }))

defineExpose({ getDrawSeconds: () => drawSecs.value })

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const previewSlot = useTemplateRef<HTMLDivElement>('previewSlot')

let cachedFile: File | null = null
let runId = 0
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// Labels stay short — the caption sits under the thumbnail on one line.
const samples: { name: SampleName, label: string }[] = [
  { name: 'monalisa', label: 'Mona Lisa' },
  { name: 'scream', label: 'The Scream' },
  { name: 'pearls', label: 'Pearl Earring' },
]

// Which sample is currently loaded — drives the selected state. `null` once an upload takes over.
const selected = ref<SampleName | null>(null)

// Label for whatever is loaded — the sample's title, or the uploaded filename.
const sourceLabel = ref('')

const showWarnNode = computed(() => props.showMobileWarn && showWarn.value)

// Normalised source dimensions from the last result. Scale-independent, so the grid readout
// recomputes live as the slider moves, with no reprocessing and no drift (both call `gridSizeFor`).
const sourceDims = ref<{ w: number, h: number } | null>(null)

const gridPreview = computed(() => {
  if (!sourceDims.value)
    return ''
  const { gridW, gridH } = gridSizeFor(sourceDims.value.w, sourceDims.value.h, scale.value)
  return `${gridW}×${gridH}`
})

function sampleUrl(name: SampleName) {
  return asset(`assets/${name}.png`)
}

async function reprocess() {
  if (!cachedFile)
    return
  const myRun = ++runId
  busy.value = true
  status.value = ''
  // The previous preview stays on screen (dimmed by `is-busy`) rather than being cleared —
  // blanking it flashed an empty box on every slider nudge.
  showWarn.value = false
  emit('processing')

  try {
    const result = await processImage(
      cachedFile,
      scale.value,
      colorCount.value,
      ratio.value,
      crop.value,
      background.value,
    )
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

    emit('result', result, { source: sourceLabel.value })
  }
  catch (err) {
    if (myRun !== runId)
      return
    busy.value = false
    // `decodeImage` tried the fast path and an <img> fallback, so ImageDecodeError means the
    // browser truly can't render these bytes. HEIC is named because every iPhone shoots it
    // and only Safari reads it; everything else is a corrupt or unsupported file.
    status.value = err instanceof ImageDecodeError
      ? (cachedFile && isHeic(cachedFile)
          ? `${sourceLabel.value} looks like an iPhone HEIC photo, which only Safari can open. Export it as a JPEG, or open this page in Safari.`
          : `Could not read ${sourceLabel.value}: it looks corrupted, or in a format this browser can't decode. Try a PNG or JPEG.`)
      : `Error: ${err}`
  }
}

function scheduleReprocess() {
  if (debounceTimer)
    clearTimeout(debounceTimer)
  debounceTimer = setTimeout(reprocess, 150)
}

watch([scale, colorCount, ratio, background, crop], scheduleReprocess)

// Adopt a newly-chosen image: preselect the ratio closest to its own framing and reset the
// crop to the whole frame, so any crop is a deliberate second choice. Costs one extra decode.
async function adoptFile(file: File, label: string) {
  cachedFile = file
  sourceLabel.value = label
  crop.value = { ...FULL_CROP }
  if (sourceUrl.value)
    URL.revokeObjectURL(sourceUrl.value)
  sourceUrl.value = URL.createObjectURL(file)
  try {
    const bitmap = await decodeImage(file)
    naturalDims.value = { w: bitmap.width, h: bitmap.height }
    ratio.value = nearestRatioFor(bitmap.width, bitmap.height)
    // Once per file, while the bitmap is decoded; nothing later can change the answer.
    hasAlpha.value = hasTransparency(bitmap)
    bitmap.close()
  }
  catch {
    // Undecodable here means undecodable in the pipeline too, which reports it properly —
    // leave the ratio alone and let `reprocess` surface the error.
    naturalDims.value = null
    hasAlpha.value = false
  }
  scheduleReprocess()
}

function onFileChange() {
  const file = fileInput.value?.files?.[0]
  if (!file)
    return
  // `accept` is only a hint — the OS "All Files" escape hatch and programmatic picks get here.
  const unsupported = unsupportedImage(file)
  if (unsupported) {
    // Whatever is already loaded stays: a mistaken pick shouldn't cost a working target.
    // Clearing the input lets the same file re-fire `change` for a second attempt.
    status.value = unsupported === 'vector'
      ? `${file.name} is a vector image, so there are no pixels to sample. Try a PNG or JPEG.`
      : `${file.name} is not an image. Try a PNG or JPEG.`
    if (fileInput.value)
      fileInput.value.value = ''
    return
  }
  status.value = ''
  selected.value = null
  adoptFile(file, file.name)
}

async function loadSample(name: SampleName) {
  try {
    const res = await fetch(sampleUrl(name))
    if (!res.ok)
      throw new Error(`${res.status} ${res.statusText}`)
    const blob = await res.blob()
    selected.value = name
    if (fileInput.value)
      fileInput.value.value = ''
    await adoptFile(
      new File([blob], `${name}.png`, { type: blob.type || 'image/png' }),
      samples.find(s => s.name === name)?.label ?? name,
    )
  }
  catch (err) {
    status.value = `Could not load sample "${name}": ${err}`
  }
}

onMounted(() => {
  if (props.autoLoadSample)
    loadSample(props.autoLoadSample)
})

onBeforeUnmount(() => {
  if (sourceUrl.value)
    URL.revokeObjectURL(sourceUrl.value)
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
        <!-- Value + the grid it produces. Computed, not measured, so it tracks the slider. -->
        <span class="picker__scale-out">
          <span class="picker__scale-val">{{ scale }}</span>
          <span v-if="gridPreview" class="picker__scale-grid">→ {{ gridPreview }}</span>
          <!-- Busy indicator in the eye-line of the dragged control. Always rendered so it
               reserves its space — appearing/disappearing would twitch the slider mid-drag. -->
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
          <!-- The floor is stated here rather than discovered by a round refusing to start. -->
          <span class="picker__setting-label">Draw seconds (min: {{ DRAW_SECONDS_MIN }}s)</span>
          <input
            v-model.number="drawSecs"
            class="picker__time"
            type="number" :min="DRAW_SECONDS_MIN" :max="DRAW_SECONDS_MAX"
            @change="commitDrawSecs"
          >
        </label>
      </div>

      <!-- Only rendered for an upload that actually has transparent pixels -->
      <div v-if="hasAlpha" class="picker__setting picker__setting--inline">
        <span id="picker-bg" class="picker__setting-label">Alpha colour</span>
        <div class="picker__bg-list" role="group" aria-labelledby="picker-bg">
          <button
            v-for="opt in BACKGROUND_OPTIONS"
            :key="opt.name"
            class="picker__bg"
            :class="{ 'is-active': background === opt.hex }"
            type="button"
            :style="{ background: opt.hex }"
            :aria-label="`${opt.name} background`"
            :aria-pressed="background === opt.hex"
            @click="background = opt.hex"
          />
        </div>
      </div>

      <!-- Crop framing. Renders only once an image is loaded and measured. Shape and crop
           are one decision: shape decides what the frame can be, the drag where it sits. -->
      <CropWidget
        v-if="sourceUrl && naturalDims"
        v-model:ratio="ratio"
        v-model:crop="crop"
        :natural-dims="naturalDims"
        :source-url="sourceUrl"
        :source-label="sourceLabel"
        :background="background"
      />
    </div>

    <!-- Image card: upload + samples + preview -->
    <div class="picker__card">
      <div class="picker__upload-row">
        <span class="picker__setting-label">Upload image</span>
        <label class="picker__browse pressable">
          Browse…
          <!-- Raster formats only: `image/*` offers SVGs the pipeline can't decode. HEIC/HEIF
               stay listed so an iPhone photo is selectable, since Safari decodes those. -->
          <input
            ref="fileInput"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,image/avif,image/heic,image/heif"
            hidden
            @change="onFileChange"
          >
        </label>
      </div>

      <div class="picker__samples">
        <span class="picker__samples-label">Or try a sample:</span>
        <ul class="picker__sample-list">
          <li v-for="s in samples" :key="s.name">
            <button
              class="picker__sample pressable"
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

      <!-- Polite, not role="alert": this re-fires on every scale-slider settle, and an
           assertive live region would interrupt each pass. -->
      <p v-if="showWarnNode" class="picker__warn" role="status">
        <TriangleAlert :size="16" />
        <span>Grid exceeds 64px on its longest side; mobile players may struggle.</span>
      </p>

      <p v-if="status" class="picker__status">
        {{ status }}
      </p>

      <div v-if="showPreview" ref="previewSlot" class="picker__preview" :class="{ 'is-busy': busy }" />
    </div>
  </div>
</template>
