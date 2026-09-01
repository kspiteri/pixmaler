<script setup lang="ts">
// Palette tools panel — swatch + brush + undo/clear, teleported to <body> so it
// can be dragged (desktop) or dock full-width to the bottom (mobile). The swatch
// and brush are imperative DOM built by the parent; we only mount them in slots.

import type { PixelCanvas } from '../lib/canvas/pixel'
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
  flaggedDone?: boolean
  // Whether the canvas has anything on its undo stack — parent-supplied because
  // `PixelCanvas.canUndo()` is imperative.
  canUndo?: boolean
  // DRAWING only — the target reference `<canvas>` and its in-flow home slot. On
  // mobile we relocate it into the docked bar, back to `targetHome` on desktop.
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

// Below $bp-mobile the panel docks to the bottom full-width and dragging is off.
// `isMobile` comes from the shared context so everyone agrees on the breakpoint.
const { isMobile } = useAppLayout()

// Docked ↔ floating flip changes whether the reference belongs in the dock and
// how tall the reserve should be — re-run once the layout has settled.
watch(isMobile, () => {
  nextTick(() => {
    placeTarget()
    schedulePublishDockHeight()
  })
})

// Move the reference between its in-flow home (desktop) and the docked bar
// (mobile). Safe to move the imperative `<canvas>`: non-editable, no fit-zoom.
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

// Mobile only — the docked panel's height varies, so we publish its measured
// height as `paletteHeight`: the single source of truth canvas areas reserve.
let dockObserver: ResizeObserver | null = null

function publishDockHeight() {
  const el = panelEl.value
  if (!isMobile.value || !el) {
    // Desktop (floating panel): hold no space.
    setPaletteHeight(0)
    return
  }
  const h = Math.ceil(el.getBoundingClientRect().height)
  // Ignore a 0/tiny reading (panel hidden or mid-layout) and keep the last good
  // value — under-reserving would let the canvas slide behind the dock.
  if (h > 0)
    setPaletteHeight(h)
}

// The docked height only settles once the reference is placed AND the body has
// flipped to its row layout — hence two frames, not a single microtask.
function schedulePublishDockHeight() {
  requestAnimationFrame(() => requestAnimationFrame(publishDockHeight))
}

// Mount the parent's imperative swatch/brush DOM into our slots. `watch`, not
// onMounted: the parent builds them in its own onMounted, after we've mounted.
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

// Tooltip advertises the shortcut (handled by Paint.vue / Drawing.vue) the way
// the platform spells it; the aria-label stays a plain "Undo".
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
                type="button"
                :aria-pressed="flaggedDone"
                :disabled="flaggedDone"
                @click="emit('done')"
              >
                <Check :size="18" />
                <span>{{ flaggedDone ? "ready!" : 'mark as ready' }}</span>
              </button>
            </div>
          </div>
          <div v-if="variant === 'drawing'" class="tools-panel__hint">
            <p>
              {{
                flaggedDone
                  ? 'the room knows'
                  : "tell the room you're ready"
              }}
            </p>
            <p>saved as you draw, good or not</p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
// Swatch/brush `:deep()` overrides plus the reactive `--sw` size var — the DOM
// is mounted imperatively by `lib/canvas/pixel.ts`, and `:deep()` only works in a
// scoped block. Static tools-panel chrome lives in `_tools-panel.scss`.
@use '../styles/tokens' as *;

.tools-panel {
  // Swatch cell size — set by the S / M / L control, read by `:deep(.swatch*)`.
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
    border-color: $accent-ink;
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
