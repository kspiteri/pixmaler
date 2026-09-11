<script setup lang="ts">
// Pixel canvas pair — target reference + editable canvas, shared by the DRAWING
// phase and the /paint sandbox. `PixelCanvas` is imperative: it owns its
// `<canvas>` and pixels, Vue only owns the surrounding layout.

import type { BrushHandle, SwatchHandle } from '@/lib'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { buildBrushControls, buildSwatch, PixelCanvas, useAppLayout, useCanvasShortcuts } from '@/lib'
import PaletteTools from './PaletteTools.vue'

interface Props {
  gridW: number
  gridH: number
  palette: string[]
  targetGrid: number[]
  // "drawing" → wider editable canvas, no Clear button (committed strokes only).
  // "paint"   → narrower target reference, Clear button included (sandbox toy).
  variant: 'drawing' | 'paint'
  // Layout direction for the drawing shell: `'row'` side by side, `'column'`
  // stacked. Only the "drawing" variant consumes it.
  orientation?: 'row' | 'column'
  // DRAWING only — whether the player has flagged themselves done, forwarded to
  // the palette's Ready button.
  flaggedDone?: boolean
  // DRAWING only — a grid echoed back by the server on rejoin, so a reload
  // restores work in progress. `/paint` never passes it.
  initialGrid?: number[] | null
}
const props = defineProps<Props>()

// `update` bubbles grid changes so parents can debounce-resubmit; `done` relays Ready.
const emit = defineEmits<{
  update: [grid: number[]]
  done: []
}>()

// `paletteHeight` is the docked palette's measured height, published by <PaletteTools>.
const { isMobile, paletteHeight } = useAppLayout()

// Space the docked palette needs below the canvas area (mobile only).
const reservedForPalette = computed(() =>
  isMobile.value ? paletteHeight.value : 0,
)

// Layout slots
const targetSlot = useTemplateRef<HTMLDivElement>('targetSlot')
const drawSlot = useTemplateRef<HTMLDivElement>('drawSlot')

// PixelCanvas instances are imperative — plain vars. `player` uses shallowRef so
// <PaletteTools> sees it after mount.
let target: PixelCanvas | null = null
const playerRef = shallowRef<PixelCanvas | null>(null)

// The swatch and brush handles, kept so the keyboard shortcuts can drive them; the
// getters below stay valid because both are assigned in onMounted before any keypress.
let swatchHandle: SwatchHandle | null = null
let brushHandle: BrushHandle | null = null
useCanvasShortcuts({
  player: () => playerRef.value,
  swatch: () => swatchHandle,
  brush: () => brushHandle,
  canvas: () => playerRef.value?.canvas ?? null,
})

// Imperative palette + brush DOM handed to <PaletteTools>; shallowRef, not reactive data.
const swatchEl = shallowRef<HTMLElement | null>(null)
const brushEl = shallowRef<HTMLElement | null>(null)

// Mirrors `player.canUndo()` for the Undo button; refreshed from `onUpdate`.
const canUndo = ref(false)

// Anchor for the panel's default position — targetWrap's DOM element.
const anchorEl = ref<HTMLElement | null>(null)

// The reference `<canvas>` and its in-flow home slot: on mobile <PaletteTools>
// relocates it into the docked bar, and back to `targetHomeEl` on desktop.
const targetEl = shallowRef<HTMLElement | null>(null)
const targetHomeEl = ref<HTMLElement | null>(null)

// Fit-zoom: `fitTo` sets the editable canvas's display box to the largest aspect-preserving
// fit of its slot, re-run whenever the slot resizes.
let drawResizeObserver: ResizeObserver | null = null
function fitDrawCanvas() {
  const slot = drawSlot.value
  const player = playerRef.value
  if (!slot || !player)
    return
  player.fitTo(slot.clientWidth, slot.clientHeight)
}

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
  // Swatch first, so the canvases' onHover handlers can highlight it.
  const swatch = buildSwatch(props.palette, i => playerRef.value?.selectColor(i))
  swatchHandle = swatch

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
  // Inline, not a partial: this must beat the class rules, and the constructor styles the
  // editable canvas only, so the read-only target needs its own border.
  target.canvas.style.border = '1px solid var(--canvas-edge)'
  targetSlot.value!.appendChild(target.canvas)

  const player = new PixelCanvas({
    gridW: props.gridW,
    gridH: props.gridH,
    palette: props.palette,
    editable: true,
    initialGrid: props.initialGrid ?? undefined,
    onHover: (cell) => {
      target!.showMarker(cell)
      swatch.highlight(cell ? props.targetGrid[cell.y * props.gridW + cell.x] : null)
    },
    onUpdate: (grid) => {
      canUndo.value = player.canUndo()
      emit('update', grid)
    },
  })
  player.canvas.classList.add('canvas-pair__draw-canvas')
  drawSlot.value!.appendChild(player.canvas)

  // Publish what the panel needs. Order matters: `player` before the imperative controls,
  // so a subscriber watching it reads valid swatchEl/brushEl.
  playerRef.value = player
  swatchEl.value = swatch.element
  brushHandle = buildBrushControls(player)
  brushEl.value = brushHandle.element
  // The reference now lives in the palette panel (docked on every viewport), so anchor
  // the panel's default position to the top-left of the editable canvas area.
  anchorEl.value = drawSlot.value
  targetEl.value = target.canvas
  targetHomeEl.value = targetSlot.value

  // Fit the editable canvas to its slot and keep it fitted as the slot resizes.
  if (drawSlot.value) {
    fitDrawCanvas()
    drawResizeObserver = new ResizeObserver(() => fitDrawCanvas())
    drawResizeObserver.observe(drawSlot.value)
  }
})

// Covers a late `draw-state` on rejoin. Guarded on `canUndo` so a server grid can't
// clobber strokes; NOT `immediate`.
watch(() => props.initialGrid, (grid) => {
  const player = playerRef.value
  if (!player || !grid || canUndo.value)
    return
  player.setGrid(grid)
})

// Orientation flips row↔column, changing the slot's shape — refit on nextTick so it lands
// on the prop change (the ResizeObserver would catch it a frame later).
watch(() => props.orientation, () => {
  nextTick(fitDrawCanvas)
})

// The reserved band changes the draw slot's height — refit on nextTick, once the style
// binding's layout has settled, so fitTo reads the final clientHeight.
watch(reservedForPalette, () => {
  nextTick(fitDrawCanvas)
})

onBeforeUnmount(() => {
  // Drop references so PixelCanvas's listeners fall away with the DOM nodes.
  drawResizeObserver?.disconnect()
  drawResizeObserver = null
  target = null
  playerRef.value = null
  swatchEl.value = null
  brushEl.value = null
  swatchHandle = null
  brushHandle = null
})
</script>

<template>
  <div
    class="canvas-pair"
    :class="`canvas-pair--${variant}`"
    :style="reservedForPalette ? { 'padding-bottom': `${reservedForPalette}px` } : undefined"
  >
    <PaletteTools
      :player="playerRef"
      :swatch-el="swatchEl"
      :brush-el="brushEl"
      :variant="variant"
      :anchor="anchorEl"
      :flagged-done="flaggedDone"
      :can-undo="canUndo"
      :target-el="targetEl"
      :target-home="targetHomeEl"
      @done="emit('done')"
    />
    <div
      class="canvas-pair__row"
      :style="orientation ? { 'flex-direction': orientation } : undefined"
    >
      <div ref="targetSlot" class="canvas-pair__target" />
      <div class="canvas-pair__draw">
        <div ref="drawSlot" class="canvas-pair__draw-slot" />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
// Canvas-pair `:deep()` overrides — the `<canvas>` elements are mounted imperatively by
// `lib/canvas/pixel.ts`, and `:deep()` only works in a scoped block. Static flex layout
// for the row lives in `_tools-panel.scss`.
@use 'tokens' as *;

// Fit-zoom shell shared by DRAWING and /paint: `fitTo` sets the editable canvas's display
// size — never CSS.
.canvas-pair {
  flex: 1;
  min-height: 0;
  display: flex;

  // The box fitTo() measures; centres the fitted canvas.
  .canvas-pair__draw-slot {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  // fitTo owns this box — reset default sizing so CSS can't fight the JS size.
  :deep(.canvas-pair__draw-canvas) {
    width: auto;
    height: auto;
    max-width: none;
  }

  // Compact reference — capped on both axes so it can't crowd out the canvas.
  :deep(.canvas-pair__target-canvas) {
    width: auto;
    height: auto;
    max-width: min(28vw, 240px);
    max-height: min(28vh, 240px);
  }
}
</style>
