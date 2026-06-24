<script setup lang="ts">
// Pixel canvas pair — target reference + editable canvas + floating tools panel.
// Shared by the DRAWING phase and the /paint sandbox.
//
// `PixelCanvas` is an imperative class (canvas + ctx + mouse handlers + undo
// stack), so we instantiate it in onMounted and append its <canvas> into a
// template slot. Vue handles the layout; PixelCanvas handles its own pixels.
//
// The swatch + brush controls live in a `<Teleport to="body">` panel so they
// can be dragged anywhere on the page. Default position: just below the target
// reference. Resizing the window snaps the panel back to its default — by
// design (we don't persist position; clearer behaviour for first-time players).

import type { SwatchHandle } from '../lib/canvas'
import { nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import {
  buildBrushControls,
  buildSwatch,
  PixelCanvas,

} from '../lib/canvas'
import { useDraggable } from '../lib/useDraggable'

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

// Floating panel slots
const swatchSlot = useTemplateRef<HTMLDivElement>('swatchSlot')
const brushSlot = useTemplateRef<HTMLDivElement>('brushSlot')

let target: PixelCanvas | null = null
let player: PixelCanvas | null = null
let swatch: SwatchHandle | null = null

// Floating tools panel position. We use a ref instead of inlining into
// useDraggable so we can update it from the resize handler.
const panelVisible = ref(false)
// Destructure the refs so they unwrap automatically in the template; the
// returned object's `x`/`y` are nested refs and wouldn't auto-unwrap.
const {
  x: panelX,
  y: panelY,
  start: startDrag,
  setPosition: setPanelPosition,
} = useDraggable({ initialX: 16, initialY: 16, desktopOnly: true })

function defaultPosition(): { x: number, y: number } {
  // Sit just below the target reference, aligned to its left edge. Falls back
  // to a sensible viewport spot if the target hasn't laid out yet.
  const rect = targetWrap.value?.getBoundingClientRect()
  if (!rect)
    return { x: 16, y: 16 }
  return { x: Math.round(rect.left), y: Math.round(rect.bottom + 12) }
}

function snapToDefault() {
  const { x, y } = defaultPosition()
  setPanelPosition(x, y)
}

function onResize() {
  // Reset to default on resize so the panel never floats off-screen after a
  // viewport change — simpler than clamping, and matches the "no persistence"
  // decision.
  snapToDefault()
}

defineExpose({
  player: () => player,
  clear() {
    if (!player)
      return
    player.pushUndoSnapshot()
    player.setGrid(Array.from<number>({ length: props.gridW * props.gridH }).fill(-1))
  },
})

onMounted(async () => {
  // Build the swatch first so the canvases' onHover handlers can highlight it.
  // `player` is referenced in onSelect, but that fires on click, by which time
  // it's defined.
  swatch = buildSwatch(props.palette, i => player?.selectColor(i))

  target = new PixelCanvas({
    gridW: props.gridW,
    gridH: props.gridH,
    palette: props.palette,
    targetGrid: props.targetGrid,
    editable: false,
    onHover: cell => swatch!.highlight(
      cell ? props.targetGrid[cell.y * props.gridW + cell.x] : null,
    ),
  })
  target.canvas.classList.add('canvas-pair__target-canvas')
  // PixelCanvas defaults editable canvases to a soft border, applied inline by
  // the constructor. Force the theme border here — inline beats class rules.
  target.canvas.style.border = '1px solid rgba(255,255,255,0.1)'
  targetSlot.value!.appendChild(target.canvas)

  player = new PixelCanvas({
    gridW: props.gridW,
    gridH: props.gridH,
    palette: props.palette,
    editable: true,
    onHover: (cell) => {
      target!.showMarker(cell)
      swatch!.highlight(cell ? props.targetGrid[cell.y * props.gridW + cell.x] : null)
    },
    onUpdate: grid => emit('update', grid),
  })
  player.canvas.classList.add('canvas-pair__draw-canvas')
  player.canvas.style.border = '1px solid rgba(255,255,255,0.1)'
  player.canvas.style.background = '#fff'
  drawSlot.value!.appendChild(player.canvas)

  // Reveal the floating panel only after we know where to put it. Without
  // this guard the panel flashes at (16, 16) for one frame before snapping.
  await nextTick()
  swatchSlot.value!.appendChild(swatch.element)
  brushSlot.value!.appendChild(buildBrushControls(player))
  snapToDefault()
  panelVisible.value = true

  window.addEventListener('resize', onResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  // Drop references so PixelCanvas's listeners fall away with the DOM nodes.
  target = null
  player = null
  swatch = null
})

function undo() { player?.undo() }
function clear() {
  if (!player)
    return
  player.pushUndoSnapshot()
  player.setGrid(Array.from<number>({ length: props.gridW * props.gridH }).fill(-1))
}
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

  <Teleport to="body">
    <div
      v-show="panelVisible"
      class="tools-panel"
      :style="{ transform: `translate(${panelX}px, ${panelY}px)` }"
    >
      <div
        class="tools-panel__handle"
        title="Drag to move"
        @pointerdown="startDrag"
      >
        <span class="tools-panel__grip">⋮⋮</span>
        <span class="tools-panel__label">colour palette</span>
      </div>
      <div class="tools-panel__body">
        <div ref="swatchSlot" />
        <div ref="brushSlot" class="tools-panel__brush" />
        <div class="tools-panel__actions">
          <button class="btn btn--plain tools-panel__btn" type="button" @click="undo">
            Undo
          </button>
          <button v-if="variant === 'paint'" class="btn btn--plain tools-panel__btn" type="button" @click="clear">
            Clear
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
@use '../styles/tokens' as *;

.canvas-pair {
  &__row {
    display: flex;
    gap: $gap-4;
    flex-wrap: wrap;
    align-items: flex-start;
  }
  &__target {
    flex: 0 0 240px;
    min-width: 0;
  }
  &__draw {
    flex: 1 1 480px;
    min-width: 0;
  }

  // Smaller variant for the paint sandbox reference.
  &--paint &__target {
    flex: 0 0 200px;
  }
  &--paint &__draw {
    flex: 1 1 360px;
  }

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

// Floating tools panel — teleported into <body>, so :deep() isn't needed.
// Scoped styles still apply because Vue tags the root with a data attribute.
.tools-panel {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 100;
  background: $surface;
  border: 1px solid $border;
  border-radius: $radius-lg;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  user-select: none;
  // `transform` for movement is faster than animating left/top.
  will-change: transform;

  &__handle {
    display: flex;
    align-items: center;
    gap: $gap-2;
    padding: $gap-2 $gap-3;
    border-bottom: 1px solid $border-soft;
    color: $fg-40;
    cursor: grab;
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.15em;

    &:active {
      cursor: grabbing;
    }
  }

  &__grip {
    color: $fg-30;
    letter-spacing: -0.1em;
  }
  &__label {
    flex: 1;
  }

  &__body {
    padding: $gap-3;
    display: flex;
    flex-direction: column;
    gap: $gap-3;
  }

  &__actions {
    display: flex;
    gap: $gap-2;
  }
  &__btn {
    flex: 1;
    font-size: 0.8125rem;
    padding: 0.5rem;
  }

  // Swatch + brush controls are imperative DOM (built in lib/canvas.ts and
  // appended into refs); `:deep()` lets scoped styles reach them.
  :deep(.swatch) {
    display: grid;
    grid-template-columns: repeat(4, 32px);
    gap: 6px;
    justify-content: start;
    align-items: center;
  }

  :deep(.swatch__cell) {
    width: 26px;
    height: 26px;
    padding: 0;
    border: 2px solid rgba(255, 255, 255, 0.15);
    border-radius: $radius-sm;
    cursor: pointer;
    // Centre within the grid cell — matters when --selected makes one cell
    // larger than its neighbours.
    justify-self: center;
    transition:
      width 80ms,
      height 80ms;
  }

  :deep(.swatch__cell--selected) {
    width: 32px;
    height: 32px;
    border-color: #fff;
    border-width: 2px;
  }

  // Highlight is set on hover-over via `swatch.highlight()` from canvas
  // hover handlers; --selected wins when both apply.
  :deep(.swatch__cell--highlighted) {
    border-color: $accent;
  }

  :deep(.brush) {
    display: flex;
    align-items: center;
    gap: $gap-2;
    font-family: $font-body;
    font-size: 0.75rem;
    color: $fg-40;
  }

  :deep(.brush__slider) {
    flex: 1;
    accent-color: $primary;
  }

  :deep(.brush__label) {
    min-width: 56px;
  }
}
</style>
