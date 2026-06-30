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

// Below $bp-mobile the panel docks to the bottom full-width and dragging is
// disabled — so we skip the free-floating transform and hide the drag handle.
// Kept in sync via matchMedia. Mirror of $bp-mobile in _tokens.scss.
const MOBILE_BP = 640
const isMobile = ref(false)
let mql: MediaQueryList | null = null
function onMobileChange(e: MediaQueryListEvent | MediaQueryList) {
  isMobile.value = e.matches
}

// Swatch + brush size — S / M / L. Drives a CSS var on the panel; the swatch
// grid reflows to fit. Kept on mobile, where bigger taps help most.
type SwatchSize = 'sm' | 'md' | 'lg'
const swatchSize = ref<SwatchSize>('md')
const SWATCH_SIZES: { id: SwatchSize, label: string }[] = [
  { id: 'sm', label: 'S' },
  { id: 'md', label: 'M' },
  { id: 'lg', label: 'L' },
]

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

  mql = window.matchMedia(`(max-width: ${MOBILE_BP}px)`)
  onMobileChange(mql)
  mql.addEventListener('change', onMobileChange)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  mql?.removeEventListener('change', onMobileChange)
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
      :class="[`tools-panel--${swatchSize}`, { 'tools-panel--docked': isMobile }]"
      :style="isMobile ? undefined : { transform: `translate(${panelX}px, ${panelY}px)` }"
    >
      <div
        v-if="!isMobile"
        class="tools-panel__handle"
        title="Drag to move"
        @pointerdown="startDrag"
      >
        <span class="tools-panel__grip">⋮⋮</span>
        <span class="tools-panel__label">palette</span>
        <!-- Swatch size lives up here in the handle, away from the brush slider,
             so it's not mistaken for the brush. pointerdown is stopped so
             clicking a size button doesn't start a panel drag. -->
        <div
          class="tools-panel__sizes"
          role="group"
          aria-label="Swatch size"
          @pointerdown.stop
        >
          <button
            v-for="s in SWATCH_SIZES"
            :key="s.id"
            class="tools-panel__size"
            :class="{ 'tools-panel__size--active': swatchSize === s.id }"
            type="button"
            :aria-pressed="swatchSize === s.id"
            @click="swatchSize = s.id"
          >
            {{ s.label }}
          </button>
        </div>
      </div>

      <!-- Mobile has no drag handle, so the swatch-size control gets a static
           header strip instead (same reason: keep it off the brush row). -->
      <div v-else class="tools-panel__mobile-head">
        <span class="tools-panel__label">palette</span>
        <div class="tools-panel__sizes" role="group" aria-label="Swatch size">
          <button
            v-for="s in SWATCH_SIZES"
            :key="s.id"
            class="tools-panel__size"
            :class="{ 'tools-panel__size--active': swatchSize === s.id }"
            type="button"
            :aria-pressed="swatchSize === s.id"
            @click="swatchSize = s.id"
          >
            {{ s.label }}
          </button>
        </div>
      </div>

      <div class="tools-panel__body">
        <div ref="swatchSlot" />
        <div ref="brushSlot" class="tools-panel__brush" />
        <div class="tools-panel__row">
          <div class="tools-panel__actions">
            <button
              class="btn btn--plain tools-panel__btn"
              type="button"
              title="Undo"
              aria-label="Undo"
              @click="undo"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 7v6h6" />
                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
              </svg>
            </button>
            <button
              v-if="variant === 'paint'"
              class="btn btn--plain tools-panel__btn"
              type="button"
              title="Clear"
              aria-label="Clear canvas"
              @click="clear"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18" />
                <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                <path d="M6 6l1 14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-14" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
// Static layout (the canvas-pair flex row + tools-panel chrome) lives in
// styles/_tools-panel.scss. Only :deep() rules (reaching the <canvas> and the
// swatch/brush DOM appended imperatively by lib/canvas.ts) and the reactive
// --sw swatch-size var stay here — :deep() only works in a scoped block.
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

.tools-panel {
  // Swatch cell size, driven by the S / M / L control (reactive --sm/--lg
  // classes). Consumed by the :deep(.swatch*) rules below, so it stays scoped.
  --sw: 26px;
  &--sm {
    --sw: 20px;
  }
  &--lg {
    --sw: 34px;
  }

  // Swatch + brush controls are imperative DOM (built in lib/canvas.ts and
  // appended into refs); `:deep()` lets scoped styles reach them.
  :deep(.swatch) {
    // Grid (not flex) so swatches fill rows left-to-right and a short last row
    // stays aligned to its columns instead of being blown to the edges the way
    // flex `space-between` does. auto-fill makes as many fixed `--sw` columns as
    // fit; space-between spreads the gaps evenly but per-column, so every row —
    // including the last — lines up.
    display: grid;
    grid-template-columns: repeat(auto-fill, var(--sw));
    justify-content: space-between;
    gap: 6px;
  }

  :deep(.swatch__cell) {
    // Fixed-size circular swatches. aspect-ratio keeps them round; size tracks
    // the S/M/L var. Width comes from the grid track.
    width: var(--sw);
    aspect-ratio: 1;
    padding: 0;
    border: 2px solid rgba(255, 255, 255, 0.15);
    border-radius: 50%;
    cursor: pointer;
    transition: transform 80ms;
  }

  :deep(.swatch__cell--selected) {
    border-color: #fff;
    transform: scale(1.12);
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
