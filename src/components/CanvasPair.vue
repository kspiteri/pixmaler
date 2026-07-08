<script setup lang="ts">
// Pixel canvas pair — target reference + editable canvas. Shared by the
// DRAWING phase and the /paint sandbox.
//
// `PixelCanvas` is an imperative class (canvas + ctx + input handlers + undo
// stack), so we instantiate it in onMounted and append its <canvas> into a
// template slot. Vue handles the layout; PixelCanvas handles its own pixels.
//
// The floating swatch + brush + undo/clear panel lives in <PaletteTools>
// (teleported to <body>). Split out of this file so the canvas surface stays
// layout-agnostic ahead of item 5's fixed drawing shell.

import { onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef } from 'vue'
import { buildBrushControls, buildSwatch, PixelCanvas } from '../lib/canvas'
import PaletteTools from './PaletteTools.vue'

interface Props {
  gridW: number
  gridH: number
  palette: string[]
  targetGrid: number[]
  // "drawing" → wider editable canvas, no Clear button (committed strokes only).
  // "paint"   → narrower target reference, Clear button included (sandbox toy).
  variant: 'drawing' | 'paint'
}
const props = defineProps<Props>()

// Bubble up grid changes so parents (e.g. Drawing.vue) can debounce-resubmit
// while the player keeps painting after their first "Done" click.
const emit = defineEmits<{
  update: [grid: number[]]
}>()

// Layout slots
const targetSlot = useTemplateRef<HTMLDivElement>('targetSlot')
const drawSlot = useTemplateRef<HTMLDivElement>('drawSlot')
const targetWrap = useTemplateRef<HTMLDivElement>('targetWrap')

// PixelCanvas instances — imperative, so kept in plain vars (no deep reactivity).
// `player` is also exposed reactively via shallowRef so <PaletteTools> can
// react to it becoming available after onMounted.
let target: PixelCanvas | null = null
const playerRef = shallowRef<PixelCanvas | null>(null)

// Imperative palette + brush DOM handed to <PaletteTools> once the player
// canvas exists. shallowRef because these are HTMLElements, not reactive data.
const swatchEl = shallowRef<HTMLElement | null>(null)
const brushEl = shallowRef<HTMLElement | null>(null)

// Anchor for the panel's default position — targetWrap's DOM element.
const anchorEl = ref<HTMLElement | null>(null)

defineExpose({
  player: () => playerRef.value,
  clear() {
    const p = playerRef.value
    if (!p)
      return
    p.pushUndoSnapshot()
    p.setGrid(Array.from<number>({ length: props.gridW * props.gridH }).fill(-1))
  },
})

onMounted(() => {
  // Build the swatch first so the canvases' onHover handlers can highlight it.
  // `player` is referenced in onSelect, but that fires on click, by which time
  // it's defined.
  const swatch = buildSwatch(props.palette, i => playerRef.value?.selectColor(i))

  target = new PixelCanvas({
    gridW: props.gridW,
    gridH: props.gridH,
    palette: props.palette,
    targetGrid: props.targetGrid,
    editable: false,
    onHover: cell => swatch.highlight(
      cell ? props.targetGrid[cell.y * props.gridW + cell.x] : null,
    ),
  })
  target.canvas.classList.add('canvas-pair__target-canvas')
  // PixelCanvas defaults editable canvases to a soft border, applied inline by
  // the constructor. Force the theme border here — inline beats class rules.
  target.canvas.style.border = '1px solid rgba(255,255,255,0.1)'
  targetSlot.value!.appendChild(target.canvas)

  const player = new PixelCanvas({
    gridW: props.gridW,
    gridH: props.gridH,
    palette: props.palette,
    editable: true,
    onHover: (cell) => {
      target!.showMarker(cell)
      swatch.highlight(cell ? props.targetGrid[cell.y * props.gridW + cell.x] : null)
    },
    onUpdate: grid => emit('update', grid),
  })
  player.canvas.classList.add('canvas-pair__draw-canvas')
  player.canvas.style.border = '1px solid rgba(255,255,255,0.1)'
  player.canvas.style.background = '#fff'
  drawSlot.value!.appendChild(player.canvas)

  // Publish everything the panel needs. Order matters: player before the
  // imperative controls, so a subscriber watching `player` sees a valid ref
  // when it reads swatchEl/brushEl.
  playerRef.value = player
  swatchEl.value = swatch.element
  brushEl.value = buildBrushControls(player)
  anchorEl.value = targetWrap.value
})

onBeforeUnmount(() => {
  // Drop references so PixelCanvas's listeners fall away with the DOM nodes.
  target = null
  playerRef.value = null
  swatchEl.value = null
  brushEl.value = null
})
</script>

<template>
  <div class="canvas-pair" :class="`canvas-pair--${variant}`">
    <div class="canvas-pair__row">
      <div ref="targetWrap" class="canvas-pair__target">
        <p class="label label--eyebrow">
          {{ variant === "paint" ? "Reference" : "Target" }}
        </p>
        <div ref="targetSlot" />
      </div>
      <div class="canvas-pair__draw">
        <p class="label label--eyebrow">
          {{ variant === "paint" ? "Your canvas" : "Your drawing" }}
        </p>
        <div ref="drawSlot" />
      </div>
    </div>
  </div>

  <PaletteTools
    :player="playerRef"
    :swatch-el="swatchEl"
    :brush-el="brushEl"
    :variant="variant"
    :anchor="anchorEl"
  />
</template>

<style scoped lang="scss">
// Static layout (the canvas-pair flex row) lives in styles/_tools-panel.scss.
// Only :deep() rules (reaching the <canvas> appended imperatively by
// lib/canvas.ts) stay here — :deep() only works in a scoped block.
@use '../styles/tokens' as *;

.canvas-pair {
  // PixelCanvas's <canvas> is appended into the slot; size it via :deep so
  // the scoped CSS reaches it.
  :deep(.canvas-pair__target-canvas) {
    width: 100%;
    max-width: 240px;
    height: auto;
  }
  :deep(.canvas-pair__draw-canvas) {
    width: 100%;
    max-width: 900px;
    height: auto;
  }
  &--paint :deep(.canvas-pair__target-canvas) {
    max-width: 200px;
  }
}
</style>
