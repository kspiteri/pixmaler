<script setup lang="ts">
// Crop framing for the image picker: the target shape (segmented) and a drag/zoom/keyboard
// crop over a dimmed preview. Shape and crop are one decision, so they live together.
// Geometry is in percentages of the image box, so it needs no measurement at any size.
// Emits shape/crop via v-model; the picker reprocesses off those.

import type { CropSelection, TargetRatioId } from '@/lib'
import { computed, useTemplateRef } from 'vue'
import { CROP_MIN_ZOOM, cropRect, TARGET_RATIO_IDS, TARGET_RATIOS } from '@/lib'

const props = defineProps<{
  naturalDims: { w: number, h: number } | null
  sourceUrl: string
  sourceLabel: string
  background: string
}>()

const ratio = defineModel<TargetRatioId>('ratio', { required: true })
const crop = defineModel<CropSelection>('crop', { required: true })

const cropBox = computed(() => {
  const dims = props.naturalDims
  if (!dims)
    return null
  const { sx, sy, sw, sh } = cropRect(dims.w, dims.h, ratio.value, crop.value)
  return {
    left: `${(sx / dims.w) * 100}%`,
    top: `${(sy / dims.h) * 100}%`,
    width: `${(sw / dims.w) * 100}%`,
    height: `${(sh / dims.h) * 100}%`,
  }
})

// The crop can move only when a maximal crop of the image's shape doesn't fill both axes.
const cropMovable = computed(() => {
  const dims = props.naturalDims
  if (!dims)
    return false
  const { sw, sh } = cropRect(dims.w, dims.h, ratio.value, crop.value)
  return sw < dims.w || sh < dims.h
})

const cropFrame = useTemplateRef<HTMLElement>('cropFrame')

function onCropPointerDown(e: PointerEvent) {
  if (!cropMovable.value)
    return
  const frame = cropFrame.value
  if (!frame)
    return
  try { frame.setPointerCapture(e.pointerId) }
  catch { /* best-effort; dragging still works without capture */ }
  e.preventDefault()
  moveCropTo(e)
}

function onCropPointerMove(e: PointerEvent) {
  // `buttons`, not a local flag: a release missed off-widget still stops steering.
  if (e.buttons === 0 || !cropMovable.value)
    return
  moveCropTo(e)
}

// Clamp the centre to 0-1; letting it drift outside would need the overshoot dragged back.
function setCropCentre(cx: number, cy: number) {
  crop.value = {
    ...crop.value,
    cx: Math.min(1, Math.max(0, cx)),
    cy: Math.min(1, Math.max(0, cy)),
  }
}

function moveCropTo(e: PointerEvent) {
  const frame = cropFrame.value
  if (!frame)
    return
  const box = frame.getBoundingClientRect()
  if (!box.width || !box.height)
    return
  setCropCentre((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height)
}

function onCropZoom(e: Event) {
  crop.value = { ...crop.value, zoom: Number((e.target as HTMLInputElement).value) / 100 }
}

// Keyboard path so framing is not pointer-only. One step is 2% of the source.
function onCropKeyDown(e: KeyboardEvent) {
  const step = 0.02
  const delta: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step],
  }
  const move = delta[e.key]
  if (!move || !cropMovable.value)
    return
  e.preventDefault()
  setCropCentre(crop.value.cx + move[0], crop.value.cy + move[1])
}
</script>

<template>
  <div class="picker__crop">
    <div class="picker__crop-head">
      <span id="picker-ratio" class="picker__setting-label">Framing</span>
      <!-- Preselected from the image's own proportions; an override, not a required step. -->
      <div class="segmented" role="group" aria-labelledby="picker-ratio">
        <button
          v-for="id in TARGET_RATIO_IDS"
          :key="id"
          class="segmented__item"
          :class="{ 'segmented__item--active': ratio === id }"
          type="button"
          :aria-label="`${TARGET_RATIOS[id].label} ${id}`"
          :aria-pressed="ratio === id"
          @click="ratio = id"
        >
          {{ TARGET_RATIOS[id].label }}
        </button>
      </div>
    </div>

    <!-- The frame is the interactive element, so it takes the tabindex and keyboard handler;
         the overlay and window inside it are decoration. -->
    <div
      ref="cropFrame"
      class="picker__crop-frame"
      :class="{ 'is-static': !cropMovable }"
      :tabindex="cropMovable ? 0 : -1"
      role="application"
      :aria-label="`Framing: ${TARGET_RATIOS[ratio].label}. Arrow keys reframe.`"
      @pointerdown="onCropPointerDown"
      @pointermove="onCropPointerMove"
      @keydown="onCropKeyDown"
    >
      <!-- Tinted with the chosen background so a transparent upload previews as it's sampled. -->
      <img
        class="picker__crop-img"
        :src="sourceUrl"
        :style="{ background }"
        :alt="`${sourceLabel}, full frame`"
      >
      <div class="picker__crop-shade" />
      <div v-if="cropBox" class="picker__crop-window" :style="cropBox" />
    </div>

    <label class="picker__crop-zoom">
      <span class="picker__sr">Crop size</span>
      <input
        type="range"
        :min="Math.round(CROP_MIN_ZOOM * 100)"
        max="100"
        :value="Math.round(crop.zoom * 100)"
        @input="onCropZoom"
      >
      <span class="picker__crop-zoom-val">{{ Math.round(crop.zoom * 100) }}%</span>
    </label>

    <p class="picker__crop-hint">
      {{ cropMovable ? 'drag or use arrow keys to reframe' : 'this shape uses the whole image' }}
    </p>
  </div>
</template>
