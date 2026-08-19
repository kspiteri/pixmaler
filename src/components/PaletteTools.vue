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
import { Check, GripVertical, Pin, Trash2, Undo2 } from '@lucide/vue'
import { nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { setPaletteHeight, useAppLayout } from '../lib/appLayout'
import { useDraggable } from '../lib/useDraggable'

interface Props {
  // The editable PixelCanvas the buttons drive (Undo / Clear). May be null
  // for one tick while the parent mounts it.
  player: PixelCanvas | null
  // Pre-built imperative DOM for the palette + brush slider. Parent owns
  // their lifecycle (they're wired to the PixelCanvas hover/select handlers).
  swatchEl: HTMLElement | null
  brushEl: HTMLElement | null
  // "paint" → show Clear (sandbox). "drawing" → show Done (Ready) instead.
  variant: 'drawing' | 'paint'
  // Element to anchor the panel's default position under (usually the target
  // reference). If null / not laid out, we fall back to (16, 16).
  anchor?: HTMLElement | null
  // DRAWING only — whether this player has flagged themselves done. When true
  // the Done button reads as flagged and is disabled.
  flaggedDone?: boolean
  // Whether the canvas has anything on its undo stack. Parent-supplied because
  // `PixelCanvas.canUndo()` is imperative — the parent refreshes it from the
  // same `onUpdate` callback that painting and undo both fire.
  canUndo?: boolean
  // DRAWING only — the target reference <canvas> and its in-flow home slot.
  // On mobile the panel docks to the bottom and would cover the drawing canvas,
  // so we relocate the reference into the docked bar (next to the tools) and
  // move it back to `targetHome` on desktop.
  targetEl?: HTMLElement | null
  targetHome?: HTMLElement | null
}

const props = defineProps<Props>()

// DRAWING only — the Done button is a social "Ready" ping; the parent owns the
// actual state and wire message, we just surface the click.
const emit = defineEmits<{
  done: []
}>()

const swatchSlot = useTemplateRef<HTMLDivElement>('swatchSlot')
const brushSlot = useTemplateRef<HTMLDivElement>('brushSlot')
const panelEl = useTemplateRef<HTMLDivElement>('panelEl')
const dockTargetSlot = useTemplateRef<HTMLDivElement>('dockTargetSlot')

const panelVisible = ref(false)

const {
  x: panelX,
  y: panelY,
  start: startDrag,
  setPosition: setPanelPosition,
} = useDraggable({ initialX: 16, initialY: 16, desktopOnly: true, element: () => panelEl.value })

// Below $bp-mobile the panel docks to the bottom full-width and dragging is
// disabled. `isMobile` comes from the shared app-layout context so CanvasPair
// (and anyone else) agrees on the breakpoint without a second matchMedia.
const { isMobile } = useAppLayout()

// Docked ↔ floating flip changes whether the reference belongs in the dock and
// how tall the reserve should be — re-run once the layout has settled.
watch(isMobile, () => {
  nextTick(() => {
    placeTarget()
    schedulePublishDockHeight()
  })
})

// Relocate the target reference between its in-flow home (desktop) and the
// docked bar (mobile drawing). Moving the imperative <canvas> node is safe —
// it's non-editable and unaffected by fit-zoom — and keeps the reference
// visible without covering the drawing canvas on phones.
function placeTarget() {
  const el = props.targetEl
  if (!el)
    return
  const dock = dockTargetSlot.value
  if (isMobile.value && dock) {
    if (!dock.contains(el))
      dock.appendChild(el)
  }
  else if (props.targetHome && !props.targetHome.contains(el)) {
    props.targetHome.appendChild(el)
  }
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

// Mobile only — the docked panel is `position: fixed` at the bottom with a
// VARIABLE height (mobile head + body up to `max-height: 45vh`, growing with
// the swatch size / brush row). Measure its real height and publish it into the
// shared app-layout context (`paletteHeight`) so both the DRAWING shell and the
// /paint sandbox (via <CanvasPair>) can reserve exactly that much space and
// never let the canvas slide behind the palette. On desktop (floating panel)
// it's cleared so no space is held.
let dockObserver: ResizeObserver | null = null

function publishDockHeight() {
  const el = panelEl.value
  if (!isMobile.value || !el) {
    // Desktop (floating panel): hold no space.
    setPaletteHeight(0)
    return
  }
  const h = Math.ceil(el.getBoundingClientRect().height)
  // Guard against measuring a collapsed panel (e.g. while still `v-show`
  // hidden, or mid-layout before the relocated reference has sized): a 0/tiny
  // reading would under-reserve and let the canvas slide behind the dock.
  // Keep the last good value until a real height lands.
  if (h > 0)
    setPaletteHeight(h)
}

// The docked height only settles after the relocated reference <canvas> is in
// place AND the body has flipped to its row layout, so measure across two
// animation frames rather than a single microtask.
function schedulePublishDockHeight() {
  requestAnimationFrame(() => requestAnimationFrame(publishDockHeight))
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
    placeTarget()
    // Panel is now visible and the reference (if any) relocated — publish the
    // real docked height so the DRAWING shell reserves the correct band.
    schedulePublishDockHeight()
  },
  { immediate: true },
)

// Keep the reference in the right place when it (or the viewport) changes.
watch(() => props.targetEl, () => nextTick(() => {
  placeTarget()
  schedulePublishDockHeight()
}))

// Swatch size changes the docked panel's height — re-measure the reserve.
watch(swatchSize, () => schedulePublishDockHeight())

onMounted(() => {
  window.addEventListener('resize', onResize)
  // isMobile is already live from the shared context; reconcile the initial
  // reference placement / reserve now that our DOM exists.
  placeTarget()
  schedulePublishDockHeight()

  // Keep the reserve in sync with the panel's rendered height (swatch size
  // changes, brush row wrapping, etc.).
  if (panelEl.value) {
    dockObserver = new ResizeObserver(() => publishDockHeight())
    dockObserver.observe(panelEl.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  dockObserver?.disconnect()
  dockObserver = null
  // Return the reference to its home slot so the parent can tear it down with
  // the rest of its DOM (the node currently lives in our dock on mobile).
  if (props.targetEl && props.targetHome && !props.targetHome.contains(props.targetEl))
    props.targetHome.appendChild(props.targetEl)
  // Drop the reserve so other screens don't inherit a stale dock height.
  setPaletteHeight(0)
})

function undo() {
  props.player?.undo()
}

// Tooltip advertises the keyboard shortcut (handled by Paint.vue / Drawing.vue),
// spelled the way the platform spells it. Tooltip only — the aria-label stays a
// plain "Undo" so screen readers don't announce a keystroke.
const undoTitle = `Undo (${/mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent) ? '⌘Z' : 'Ctrl+Z'})`

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
      :class="[`tools-panel--${swatchSize}`, `tools-panel--${variant}`, { 'tools-panel--docked': isMobile }]"
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
          class="tools-panel__dock pressable"
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
          class="segmented"
          role="group"
          aria-label="Swatch size"
          @pointerdown.stop
        >
          <button
            v-for="s in SWATCH_SIZES"
            :key="s.id"
            class="segmented__item"
            :class="{ 'segmented__item--active': swatchSize === s.id }"
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
        <div class="segmented" role="group" aria-label="Swatch size">
          <button
            v-for="s in SWATCH_SIZES"
            :key="s.id"
            class="segmented__item"
            :class="{ 'segmented__item--active': swatchSize === s.id }"
            type="button"
            :aria-pressed="swatchSize === s.id"
            @click="swatchSize = s.id"
          >
            {{ s.label }}
          </button>
        </div>
      </div>

      <div class="tools-panel__body">
        <!-- Mobile only: the target reference is relocated here to save space -->
        <div
          v-if="isMobile"
          ref="dockTargetSlot"
          class="tools-panel__target"
        />
        <div class="tools-panel__controls">
          <div ref="swatchSlot" />
          <div ref="brushSlot" class="tools-panel__brush" />
          <div class="tools-panel__row">
            <div class="tools-panel__actions">
              <button
                class="btn btn--plain tools-panel__btn"
                type="button"
                :title="undoTitle"
                aria-label="Undo"
                :disabled="!canUndo"
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
              <button
                v-else
                class="btn btn--primary tools-panel__btn tools-panel__btn--done"
                :class="{ 'tools-panel__btn--flagged': flaggedDone }"
                type="button"
                title="Ready"
                :aria-label="flaggedDone ? 'Flagged as ready' : 'Ready'"
                :aria-pressed="flaggedDone"
                :disabled="flaggedDone"
                @click="emit('done')"
              >
                <Check :size="18" />
              </button>
            </div>
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
    color: $muted;
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
