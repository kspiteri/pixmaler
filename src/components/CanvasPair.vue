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

import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue'
import { useAppLayout } from '../lib/appLayout'
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
  // Ratio-aware layout direction for the fixed drawing shell (item 5). `'row'`
  // places reference + canvas side by side; `'column'` stacks them. Only the
  // "drawing" variant consumes it; the paint sandbox keeps its default flow.
  orientation?: 'row' | 'column'
  // DRAWING only — whether the player has flagged themselves done, forwarded to
  // the palette's Ready button.
  flaggedDone?: boolean
  // DRAWING only — a grid echoed back by the server on rejoin, used to seed the
  // editable canvas so a page reload restores work in progress. `/paint` never
  // passes it.
  initialGrid?: number[] | null
}
const props = defineProps<Props>()

// Bubble up grid changes so parents (e.g. Drawing.vue) can debounce-resubmit
// while the player keeps painting after their first "Done" click. `done` relays
// the palette's Ready button click for the DRAWING social ping.
const emit = defineEmits<{
  update: [grid: number[]]
  done: []
}>()

// Shared app-layout context. `isMobile` tells us the palette is docked to the
// bottom (fixed, overlapping the shell); `paletteHeight` is its measured height
// in px, published by <PaletteTools>. On mobile BOTH the DRAWING shell and the
// /paint sandbox must leave exactly that much room below the canvas so it never
// sits behind the docked palette — we reserve it as padding on the pair (and,
// for drawing, refit the fit-zoomed canvas into what's left). Desktop's panel
// floats, so no reservation is held.
const { isMobile, paletteHeight } = useAppLayout()

// Space the docked palette needs below the canvas area (mobile only — both
// variants, since the panel docks fixed to the bottom on either page).
const reservedForPalette = computed(() =>
  isMobile.value ? paletteHeight.value : 0,
)

// Layout slots
const targetSlot = useTemplateRef<HTMLDivElement>('targetSlot')
const drawSlot = useTemplateRef<HTMLDivElement>('drawSlot')

// PixelCanvas instances — imperative, so kept in plain vars (no deep reactivity).
// `player` is also exposed reactively via shallowRef so <PaletteTools> can
// react to it becoming available after onMounted.
let target: PixelCanvas | null = null
const playerRef = shallowRef<PixelCanvas | null>(null)

// Imperative palette + brush DOM handed to <PaletteTools> once the player
// canvas exists. shallowRef because these are HTMLElements, not reactive data.
const swatchEl = shallowRef<HTMLElement | null>(null)
const brushEl = shallowRef<HTMLElement | null>(null)

// Mirrors `player.canUndo()` for the panel's Undo button. `PixelCanvas` is
// imperative, so this is refreshed from `onUpdate` — which fires on every
// stroke AND from `undo()` itself, so the flag flips back off when the stack
// empties.
const canUndo = ref(false)

// Anchor for the panel's default position — targetWrap's DOM element.
const anchorEl = ref<HTMLElement | null>(null)

// The target reference <canvas> and its in-flow home slot. On mobile the
// palette docks to the bottom and would obscure the canvas, so <PaletteTools>
// relocates this reference into the docked bar (next to the tools) and returns
// it to `targetHomeEl` on desktop. Passing both lets the panel own the move.
const targetEl = shallowRef<HTMLElement | null>(null)
const targetHomeEl = ref<HTMLElement | null>(null)

// Pattern A fit-zoom: we size the editable canvas's DISPLAY box (via
// PixelCanvas.fitTo) to the largest aspect-preserving fit of its slot,
// re-running whenever the slot resizes (viewport, orientation flip). Used by
// BOTH variants now so the /paint sandbox shares the DRAWING look & feel.
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
  player.canvas.style.border = '1px solid rgba(255,255,255,0.1)'
  player.canvas.style.background = '#fff'
  drawSlot.value!.appendChild(player.canvas)

  // Publish everything the panel needs. Order matters: player before the
  // imperative controls, so a subscriber watching `player` sees a valid ref
  // when it reads swatchEl/brushEl.
  playerRef.value = player
  swatchEl.value = swatch.element
  brushEl.value = buildBrushControls(player)
  // Anchor the floating palette to the reference thumbnail itself (targetSlot),
  // NOT targetWrap: in the drawing shell the target column is stretched to the
  // full row height (align-items: stretch), so targetWrap's bottom sits below
  // the whole canvas. The slot hugs the thumbnail, so the palette opens right
  // beneath the reference image.
  anchorEl.value = targetSlot.value
  targetEl.value = target.canvas
  targetHomeEl.value = targetSlot.value

  // Fit the editable canvas to its slot and keep it fitted as the slot resizes.
  if (drawSlot.value) {
    fitDrawCanvas()
    drawResizeObserver = new ResizeObserver(() => fitDrawCanvas())
    drawResizeObserver.observe(drawSlot.value)
  }
})

// The grid normally arrives before this component mounts (the server sends it
// ahead of `state`, and App.vue only renders DRAWING once `state` lands), so
// the constructor seed above is the usual path. This covers the narrow case
// where an unrelated `state` broadcast renders DRAWING before our own
// `draw-state` is processed. Guarded on `canUndo`: an empty undo stack means
// the player has not drawn yet, so applying a server grid cannot clobber
// strokes. NOT `immediate` — mount is already handled by the constructor.
watch(() => props.initialGrid, (grid) => {
  const player = playerRef.value
  if (!player || !grid || canUndo.value)
    return
  player.setGrid(grid)
})

// Orientation flips row↔column, which changes the slot's shape — refit once the
// DOM has applied the new flex-direction. (The ResizeObserver also catches it,
// but this makes the refit deterministic on the same frame the prop changes.)
watch(() => props.orientation, () => {
  nextTick(fitDrawCanvas)
})

// The reserved palette band changes the draw slot's available height, so refit
// whenever it (or the mobile flag) changes. The style binding shrinks the slot
// first; nextTick lets that layout settle before fitTo reads clientHeight.
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
})
</script>

<template>
  <div
    class="canvas-pair"
    :class="`canvas-pair--${variant}`"
    :style="reservedForPalette ? { 'padding-bottom': `${reservedForPalette}px` } : undefined"
  >
    <div
      class="canvas-pair__row"
      :style="orientation ? { 'flex-direction': orientation } : undefined"
    >
      <div class="canvas-pair__target">
        <p class="label label--eyebrow">
          Reference
        </p>
        <div ref="targetSlot" class="canvas-pair__target-slot" />
      </div>
      <div class="canvas-pair__draw">
        <div ref="drawSlot" class="canvas-pair__draw-slot" />
      </div>
    </div>
  </div>

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
</template>

<style scoped lang="scss">
// Static layout (the canvas-pair flex row) lives in styles/_tools-panel.scss.
// Only :deep() rules (reaching the <canvas> appended imperatively by
// lib/canvas.ts) stay here — :deep() only works in a scoped block.
@use '../styles/tokens' as *;

// ── Fixed fit-zoom shell (item 5, Pattern A) ────────────────────────────────
// Shared by BOTH the DRAWING phase and the /paint sandbox so they look & feel
// identical. The pair fills its container's free area; the editable canvas's
// DISPLAY size is set imperatively by PixelCanvas.fitTo (JS fit-zoom) rather
// than CSS, so we must NOT constrain its width/height here — we only centre it
// in its slot. The reference stays a compact thumbnail so the editable canvas
// claims the rest. Static flex rules for the row/columns live in
// _tools-panel.scss. `variant` no longer changes the layout — only the palette
// button (Clear vs Ready).
.canvas-pair {
  flex: 1;
  min-height: 0;
  display: flex;

  // The draw slot is the measured box fitTo() reads (clientWidth/Height);
  // it grows to fill the row and centres the fitted canvas inside it.
  .canvas-pair__draw-slot {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  // fitTo owns the editable canvas box — reset any default CSS sizing so it
  // can't fight the JS-set width/height or reintroduce squish.
  :deep(.canvas-pair__draw-canvas) {
    width: auto;
    height: auto;
    max-width: none;
  }

  // Compact reference — capped on both axes and relative to the viewport so
  // it never crowds out the editable canvas in either orientation.
  :deep(.canvas-pair__target-canvas) {
    width: auto;
    height: auto;
    max-width: min(28vw, 240px);
    max-height: min(28vh, 240px);
  }
}
</style>
