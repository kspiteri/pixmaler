<script setup lang="ts">
// Palette tools panel — swatch + brush + undo/clear. Teleported to <body>
// so it can be dragged anywhere (desktop) or dock full-width to the bottom
// (mobile). Extracted from CanvasPair.vue so the canvas surface can be
// reshaped without dragging the panel logic along (item 5, fixed shell).
//
// Desktop users can drag the panel around; the pin button in the handle sends
// it back to its default position (below the target reference).
//
// Panel-owned concerns: teleport, drag, viewport-clamp, mobile dock,
// swatch-size (S/M/L), and the Undo/Clear buttons. The swatch and brush
// controls themselves are imperative DOM built by the parent (from
// lib/canvas.ts's buildSwatch / buildBrushControls, which need a live
// PixelCanvas reference); we just mount them into slots here.

import type { PixelCanvas } from '../lib/canvas'
import { GripVertical, Pin, Trash2, Undo2 } from '@lucide/vue'
import { nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useDraggable } from '../lib/useDraggable'

interface Props {
  // The editable PixelCanvas the buttons drive (Undo / Clear). May be null
  // for one tick while the parent mounts it.
  player: PixelCanvas | null
  // Pre-built imperative DOM for the palette + brush slider. Parent owns
  // their lifecycle (they're wired to the PixelCanvas hover/select handlers).
  swatchEl: HTMLElement | null
  brushEl: HTMLElement | null
  // "paint" → show Clear (sandbox). "drawing" → hide it.
  variant: 'drawing' | 'paint'
  // Element to anchor the panel's default position under (usually the target
  // reference). If null / not laid out, we fall back to (16, 16).
  anchor?: HTMLElement | null
}
const props = defineProps<Props>()

const swatchSlot = useTemplateRef<HTMLDivElement>('swatchSlot')
const brushSlot = useTemplateRef<HTMLDivElement>('brushSlot')
const panelEl = useTemplateRef<HTMLDivElement>('panelEl')

const panelVisible = ref(false)

const {
  x: panelX,
  y: panelY,
  start: startDrag,
  setPosition: setPanelPosition,
} = useDraggable({ initialX: 16, initialY: 16, desktopOnly: true, element: () => panelEl.value })

// Below $bp-mobile the panel docks to the bottom full-width and dragging is
// disabled. Mirror of $bp-mobile in _tokens.scss.
const MOBILE_BP = 640
const isMobile = ref(false)
let mql: MediaQueryList | null = null
function onMobileChange(e: MediaQueryListEvent | MediaQueryList) {
  isMobile.value = e.matches
}

// Swatch cell size — drives a CSS var on the panel; the swatch grid reflows.
type SwatchSize = 'sm' | 'md' | 'lg'
const swatchSize = ref<SwatchSize>('md')
const SWATCH_SIZES: { id: SwatchSize, label: string }[] = [
  { id: 'sm', label: 'S' },
  { id: 'md', label: 'M' },
  { id: 'lg', label: 'L' },
]

function defaultPosition(): { x: number, y: number } {
  const rect = props.anchor?.getBoundingClientRect()
  if (!rect)
    return { x: 16, y: 16 }
  return { x: Math.round(rect.left), y: Math.round(rect.bottom + 12) }
}

function snapToDefault() {
  const { x, y } = defaultPosition()
  setPanelPosition(x, y)
}

function onResize() {
  // Reset to default on resize so the panel never floats off-screen — matches
  // the "no position persistence" decision.
  snapToDefault()
}

// Mount imperative swatch/brush DOM into our slots whenever the parent
// finishes building them. `watch` (vs onMounted) covers the case where the
// parent's PixelCanvas is instantiated in its own onMounted and props arrive
// after we've already mounted.
watch(
  () => [props.swatchEl, props.brushEl] as const,
  async ([sw, br]) => {
    if (!sw || !br)
      return
    await nextTick()
    if (swatchSlot.value && !swatchSlot.value.contains(sw))
      swatchSlot.value.appendChild(sw)
    if (brushSlot.value && !brushSlot.value.contains(br))
      brushSlot.value.appendChild(br)
    snapToDefault()
    panelVisible.value = true
  },
  { immediate: true },
)

onMounted(() => {
  window.addEventListener('resize', onResize)
  mql = window.matchMedia(`(max-width: ${MOBILE_BP}px)`)
  onMobileChange(mql)
  mql.addEventListener('change', onMobileChange)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  mql?.removeEventListener('change', onMobileChange)
})

function undo() { props.player?.undo() }
function clear() {
  const p = props.player
  if (!p)
    return
  p.pushUndoSnapshot()
  // Bounce through getGrid() to read the current size — the panel doesn't
  // otherwise need to know gridW/gridH.
  const len = p.getGrid().length
  p.setGrid(Array.from<number>({ length: len }).fill(-1))
}
</script>

<template>
  <Teleport to="body">
    <div
      v-show="panelVisible"
      ref="panelEl"
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
        <span class="tools-panel__grip"><GripVertical :size="16" /></span>
        <span class="tools-panel__label">palette</span>
        <!-- Dock button — snaps the panel back to its default position. Click
             is stopped so it doesn't also initiate a drag on pointerdown. -->
        <button
          class="tools-panel__dock"
          type="button"
          title="Dock to default position"
          aria-label="Dock palette to default position"
          @pointerdown.stop
          @click="snapToDefault"
        >
          <Pin :size="14" />
        </button>
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
              <Undo2 :size="18" />
            </button>
            <button
              v-if="variant === 'paint'"
              class="btn btn--plain tools-panel__btn"
              type="button"
              title="Clear"
              aria-label="Clear canvas"
              @click="clear"
            >
              <Trash2 :size="18" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
// Static layout (tools-panel chrome) lives in styles/_tools-panel.scss. Only
// :deep() rules (reaching the swatch/brush DOM appended imperatively by
// lib/canvas.ts) and the reactive --sw swatch-size var stay here — :deep()
// only works in a scoped block.
@use '../styles/tokens' as *;

.tools-panel {
  // Swatch cell size, driven by the S / M / L control (reactive --sm/--lg
  // classes). Consumed by the :deep(.swatch*) rules below.
  --sw: 26px;
  &--sm {
    --sw: 20px;
  }
  &--lg {
    --sw: 34px;
  }

  :deep(.swatch) {
    display: grid;
    grid-template-columns: repeat(auto-fill, var(--sw));
    justify-content: space-between;
    gap: 6px;
  }

  :deep(.swatch__cell) {
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

  :deep(.swatch__cell--highlighted) {
    border-color: $accent;
  }

  :deep(.brush) {
    display: flex;
    align-items: center;
    gap: $gap-2;
    font-family: $font-body;
    font-size: $fs-xs;
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
