<script setup lang="ts">
// Image picker orchestrator — owns the source file, the pipeline and all tuning state, and lays
// the flow out as a persistent target preview plus a single-open accordion of steps
// (Game mode → Image → Adjust Target → Game settings). The step controls and the preview are
// under ./picker; this file wires them and runs `processImage` on any change.

import type { CropSelection, MusicTrackId, PickerMeta, PipelineResult, PixelationStyle, RoundConfig, TargetRatioId } from '@/lib'
import { ChevronDown, Trash2 } from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Accordion from '@/components/elements/accordion/Accordion.vue'
import AccordionItem from '@/components/elements/accordion/Item.vue'
import Button from '@/components/elements/Button.vue'
import { asset, decodeImage, DEFAULT_BACKGROUND, DEFAULT_COLOR_COUNT, DEFAULT_PIXELATION_STYLE, DEFAULT_RATIO, DEFAULT_SCALE, FULL_CROP, gridSizeFor, hasTransparency, ImageDecodeError, isHeic, isMobileWarning, nearestRatioFor, processImage, quantiserFor, TARGET_RATIOS, trackLabel, unsupportedImage } from '@/lib'
import AlphaControl from './picker/AlphaControl.vue'
import ColourControl from './picker/ColourControl.vue'
import CropWidget from './picker/CropWidget.vue'
import DetailControl from './picker/DetailControl.vue'
import MusicControl from './picker/MusicControl.vue'
import PixelationStyleControl from './picker/PixelationStyleControl.vue'
import SourcePicker from './picker/SourcePicker.vue'
import { detailLabel, DURATION_STOPS } from './picker/stops'
import TargetPreview from './picker/TargetPreview.vue'
import TimerControl from './picker/TimerControl.vue'

// The bundled sample images (`public/assets/<name>.png`).
type SampleName = 'monalisa' | 'scream' | 'pearls'

interface Props {
  showMobileWarn?: boolean
  showDrawSeconds?: boolean
  showPreview?: boolean
  // The room's current target, so a reloaded GM sees it in the preview and can start off it.
  roomConfig?: RoundConfig | null
  roomTarget?: number[] | null
  // Autoload a sample on first render, for the sandbox where an image is required.
  autoLoadSample?: SampleName
}
const props = defineProps<Props>()

const emit = defineEmits<{
  result: [result: PipelineResult, meta: PickerMeta]
  // Fires when input changes but before processing finishes — lets a caller disable Start.
  processing: []
  // The GM cleared the target — the host un-configures the room.
  clear: []
  // Free Mode plays the picked track live; the lobby ignores this (music starts at DRAWING).
  music: [track: MusicTrackId | null]
}>()

const DEFAULT_DRAW_SECONDS = 120

const scale = ref(DEFAULT_SCALE)
const colorCount = ref(DEFAULT_COLOR_COUNT)
const pixelationStyle = ref<PixelationStyle>(DEFAULT_PIXELATION_STYLE)
const ratio = ref<TargetRatioId>(DEFAULT_RATIO)
const crop = ref<CropSelection>({ ...FULL_CROP })
const background = ref(DEFAULT_BACKGROUND)
const hasAlpha = ref(false)
const naturalDims = ref<{ w: number, h: number } | null>(null)
const sourceUrl = ref('')
const drawSecs = ref(DEFAULT_DRAW_SECONDS)
const musicTrack = ref<MusicTrackId | null>(null)
const status = ref('')
const busy = ref(false)
// Scale-independent source dims from the last result, so the grid readout recomputes live as
// the Detail slider moves with no reprocessing (both call `gridSizeFor`).
const sourceDims = ref<{ w: number, h: number } | null>(null)
const lastResult = ref<PipelineResult | null>(null)
const selected = ref<string | null>(null)
const sourceLabel = ref('')
// Which accordion step is open; auto-advances to Adjust once an image is adopted.
const openStep = ref<string | null>('source')

const samples: { name: SampleName, label: string }[] = [
  { name: 'monalisa', label: 'Mona Lisa' },
  { name: 'scream', label: 'The Scream' },
  { name: 'pearls', label: 'Pearl Earring' },
]

defineExpose({ getDrawSeconds: () => drawSecs.value, getMusicTrack: () => musicTrack.value, reset })

let cachedFile: File | null = null
let runId = 0
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const hasImage = computed(() => !!sourceUrl.value && !!naturalDims.value)
const gridPreview = computed(() => {
  if (!sourceDims.value)
    return ''
  const { gridW, gridH } = gridSizeFor(sourceDims.value.w, sourceDims.value.h, scale.value)
  return `${gridW}×${gridH}`
})
// After a reload the GM has no local pick, but the room still holds a target — show that so the
// GM sees what everyone sees and can start or re-pick off it (a reload is a mistake to correct).
// A fresh local pick takes over immediately.
const roomResult = computed<PipelineResult | null>(() => {
  const c = props.roomConfig
  const g = props.roomTarget
  return c && g && g.length > 0
    ? { gridW: c.gridW, gridH: c.gridH, palette: c.palette, targetGrid: g, sourceW: c.gridW, sourceH: c.gridH }
    : null
})
const previewResult = computed(() => lastResult.value ?? roomResult.value)
const canClear = computed(() => !!(props.showDrawSeconds && previewResult.value))
const warn = computed(() =>
  !!(props.showMobileWarn && previewResult.value && isMobileWarning(Math.max(previewResult.value.gridW, previewResult.value.gridH))),
)

// Accordion summaries — the current value of each collapsed step.
const sourceSummary = computed(() => sourceLabel.value || 'none chosen')
const ratioLabel = computed(() => TARGET_RATIOS[ratio.value].label)
const lookSummary = computed(() => `${detailLabel(scale.value)} · ${colorCount.value} colours`)
const timerSummary = computed(() =>
  DURATION_STOPS.find(s => s.value === drawSecs.value)?.label ?? `${drawSecs.value}s`,
)

const adjustSummary = computed(() =>
  hasImage.value ? `${ratioLabel.value} · ${lookSummary.value}` : 'pick an image first',
)

// With no timer (Free Mode) the section is music-only, so its summary follows the track.
const settingsSummary = computed(() =>
  props.showDrawSeconds ? timerSummary.value : (musicTrack.value ? trackLabel(musicTrack.value) : 'no music'),
)

// Flow-ordered steps for the "Next step" buttons — advance to the next *enabled* step. The
// disabled 'mode' placeholder sits above the flow, so it is not a target.
const flowSteps = computed(() => [
  { id: 'source', enabled: true },
  { id: 'adjust', enabled: hasImage.value },
  ...(props.showDrawSeconds ? [{ id: 'settings', enabled: hasImage.value }] : []),
])
function stepAfter(id: string): string | null {
  const list = flowSteps.value
  const i = list.findIndex(s => s.id === id)
  return i < 0 ? null : (list.slice(i + 1).find(s => s.enabled)?.id ?? null)
}

async function reprocess() {
  if (!cachedFile)
    return
  const myRun = ++runId
  busy.value = true
  status.value = ''
  emit('processing')

  try {
    const result = await processImage(cachedFile, scale.value, colorCount.value, ratio.value, crop.value, background.value, quantiserFor(pixelationStyle.value))
    if (myRun !== runId)
      return // stale

    busy.value = false
    sourceDims.value = { w: result.sourceW, h: result.sourceH }
    lastResult.value = result
    emit('result', result, { source: sourceLabel.value })
  }
  catch (err) {
    if (myRun !== runId)
      return
    busy.value = false
    // `decodeImage` tried the fast path and an <img> fallback, so ImageDecodeError means the
    // browser truly can't render these bytes. HEIC is named because every iPhone shoots it and
    // only Safari reads it; everything else is a corrupt or unsupported file.
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

watch([scale, colorCount, ratio, background, crop, pixelationStyle], scheduleReprocess)
watch(musicTrack, t => emit('music', t))

// Adopt a newly-chosen image: preselect the ratio closest to its own framing and reset the crop
// to the whole frame, so any crop is a deliberate second choice. Costs one extra decode.
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
    hasAlpha.value = hasTransparency(bitmap)
    bitmap.close()
    openStep.value = 'adjust' // image in hand — move to adjusting
  }
  catch {
    // Undecodable here means undecodable in the pipeline too, which reports it properly —
    // leave the ratio alone and let `reprocess` surface the error.
    naturalDims.value = null
    hasAlpha.value = false
  }
  scheduleReprocess()
}

function onFile(file: File) {
  // `accept` is only a hint — the OS "All Files" escape hatch and programmatic picks get here.
  const unsupported = unsupportedImage(file)
  if (unsupported) {
    // Whatever is already loaded stays: a mistaken pick shouldn't cost a working target.
    status.value = unsupported === 'vector'
      ? `${file.name} is a vector image, so there are no pixels to sample. Try a PNG or JPEG.`
      : `${file.name} is not an image. Try a PNG or JPEG.`
    return
  }
  status.value = ''
  selected.value = null
  adoptFile(file, file.name)
}

async function loadSample(name: string) {
  try {
    const res = await fetch(asset(`assets/${name}.png`))
    if (!res.ok)
      throw new Error(`${res.status} ${res.statusText}`)
    const blob = await res.blob()
    selected.value = name
    await adoptFile(
      new File([blob], `${name}.png`, { type: blob.type || 'image/png' }),
      samples.find(s => s.name === name)?.label ?? name,
    )
  }
  catch (err) {
    status.value = `Could not load sample "${name}": ${err}`
  }
}

// A reload is treated as a mistake, not state to rehydrate: this drops the local pick back to a
// blank picker. Exposed for the host's "clear image", and used by `clearImage` below.
function reset() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (sourceUrl.value)
    URL.revokeObjectURL(sourceUrl.value)
  cachedFile = null
  runId++ // invalidate any in-flight reprocess
  sourceUrl.value = ''
  naturalDims.value = null
  sourceDims.value = null
  hasAlpha.value = false
  lastResult.value = null
  selected.value = null
  sourceLabel.value = ''
  status.value = ''
  busy.value = false
  scale.value = DEFAULT_SCALE
  colorCount.value = DEFAULT_COLOR_COUNT
  ratio.value = DEFAULT_RATIO
  crop.value = { ...FULL_CROP }
  background.value = DEFAULT_BACKGROUND
  drawSecs.value = DEFAULT_DRAW_SECONDS
  openStep.value = 'source'
}

// Clear the room's target: blank the local picker, then tell the host to un-configure the room.
function clearImage() {
  reset()
  emit('clear')
}

onMounted(() => {
  if (props.autoLoadSample)
    loadSample(props.autoLoadSample)
})

onBeforeUnmount(() => {
  if (debounceTimer)
    clearTimeout(debounceTimer)
  if (sourceUrl.value)
    URL.revokeObjectURL(sourceUrl.value)
})
</script>

<template>
  <div class="picker">
    <div class="picker__steps">
      <p v-if="status" class="picker__error">
        {{ status }}
      </p>

      <Accordion v-model="openStep">
        <AccordionItem v-if="showDrawSeconds" id="mode" title="Game mode" disabled>
          <template #summary>
            coming soon
          </template>
        </AccordionItem>

        <AccordionItem id="source" title="Image">
          <template #summary>
            {{ sourceSummary }}
          </template>
          <SourcePicker :samples="samples" :selected="selected" @file="onFile" @sample="loadSample" />
        </AccordionItem>

        <AccordionItem id="adjust" title="Adjust Target" :disabled="!hasImage">
          <template #summary>
            {{ adjustSummary }}
          </template>
          <CropWidget
            v-model:ratio="ratio"
            v-model:crop="crop"
            :natural-dims="naturalDims"
            :source-url="sourceUrl"
            :source-label="sourceLabel"
            :background="background"
          />
          <PixelationStyleControl v-model="pixelationStyle" />
          <DetailControl v-model="scale" :grid-preview="gridPreview" :busy="busy" />
          <ColourControl v-model="colorCount" />
          <AlphaControl v-if="hasAlpha" v-model="background" />
          <div v-if="stepAfter('adjust')" class="picker__next">
            <Button variant="secondary" size="small" @click="openStep = stepAfter('adjust')">
              Next step
              <template #trailing>
                <ChevronDown :size="16" aria-hidden="true" />
              </template>
            </Button>
          </div>
        </AccordionItem>

        <AccordionItem id="settings" title="Game settings" :disabled="!hasImage">
          <template #summary>
            {{ settingsSummary }}
          </template>
          <TimerControl v-if="showDrawSeconds" v-model="drawSecs" />
          <MusicControl v-model="musicTrack" />
        </AccordionItem>
      </Accordion>
    </div>

    <div v-if="showPreview" class="picker__status">
      <TargetPreview :result="previewResult" :busy="busy" :warn="warn" />
      <Button v-if="canClear" variant="subtle" size="small" @click="clearImage">
        <template #icon>
          <Trash2 :size="15" aria-hidden="true" />
        </template>
        Clear image
      </Button>
    </div>
  </div>
</template>
