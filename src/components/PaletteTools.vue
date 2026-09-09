<script setup lang="ts">
// Palette tools panel — swatch + brush + undo/clear, teleported to <body> so it can be
// dragged (desktop) or dock full-width to the bottom (mobile). The swatch and brush are
// imperative DOM built by the parent; we only mount them in slots.

import type { Component } from 'vue'
import type { PixelCanvas } from '../lib'
import { ArrowBigUp, ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, GripVertical, Keyboard, Mouse, Pin, Trash2, Undo2 } from '@lucide/vue'
import { markRaw, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { setPaletteHeight, shortcutsEnabled, useAppLayout, useDraggable } from '../lib'

interface Props {
  // The editable PixelCanvas the buttons drive; null for one tick while the parent mounts it.
  player: PixelCanvas | null
  // Pre-built imperative DOM for the palette + brush slider; the parent owns their lifecycle.
  swatchEl: HTMLElement | null
  brushEl: HTMLElement | null
  // "paint" → show Clear (sandbox). "drawing" → show Done (Ready) instead.
  variant: 'drawing' | 'paint'
  // Element to anchor the panel's default position under; falls back to (16, 16).
  anchor?: HTMLElement | null
  // DRAWING only — whether this player has flagged themselves done.
  flaggedDone?: boolean
  // Whether the canvas has anything on its undo stack — parent-supplied (canUndo is imperative).
  canUndo?: boolean
  // DRAWING only — the target reference and its home slot; relocated into the dock on mobile.
  targetEl?: HTMLElement | null
  targetHome?: HTMLElement | null
}

const props = defineProps<Props>()

// DRAWING only — Done is a social "Ready" ping; the parent owns the state and wire message.
const emit = defineEmits<{
  done: []
}>()

const swatchSlot = useTemplateRef<HTMLDivElement>('swatchSlot')
const brushSlot = useTemplateRef<HTMLDivElement>('brushSlot')
const panelEl = useTemplateRef<HTMLDivElement>('panelEl')
const dockTargetSlot = useTemplateRef<HTMLDivElement>('dockTargetSlot')

const panelVisible = ref(false)

// Desktop-only keyboard shortcuts help, toggled by the ? in the handle. Hidden on mobile,
// where there's no keyboard to shortcut with.
const shortcutsOpen = ref(false)
interface Shortcut {
  // The actual key, in words — the truth, the fallback when there's no icon, and what a
  // screen reader announces (the icons are silent to it).
  key: string
  // Optional icon visualisation; omit and the pill shows `key`. Icons must be markRaw'd.
  shortcut?: (string | Component)[]
  desc: string
  // Optional fuller spoken label; falls back to `key` — e.g. read "⌘/Ctrl+Z" as words.
  aria?: string
}
const SHORTCUTS: Shortcut[] = [
  { key: 'hold Shift', shortcut: ['hold', markRaw(ArrowBigUp)], desc: 'show colour map - tap to switch' },
  { key: 'arrow keys', shortcut: [markRaw(ArrowLeft), markRaw(ArrowRight)], desc: 'change colour' },
  { key: 'scroll wheel', shortcut: [markRaw(Mouse), 'scroll'], desc: 'change brush size' },
  { key: '⌘/Ctrl+Z', aria: 'Command or Control plus Z', desc: 'undo' },
]

const {
  x: panelX,
  y: panelY,
  start: startDrag,
  setPosition: setPanelPosition,
} = useDraggable({ initialX: 16, initialY: 16, desktopOnly: true, element: () => panelEl.value })

// Below $bp-mobile the panel docks full-width at the bottom and dragging is off.
const { isMobile } = useAppLayout()

// The docked/floating flip changes whether the reference belongs in the dock and how tall
// the reserve is — re-run once the layout has settled.
watch(isMobile, () => {
  nextTick(() => {
    placeTarget()
    schedulePublishDockHeight()
  })
})

// Move the reference between its in-flow home (desktop) and the docked bar (mobile). Safe
// to move the imperative `<canvas>`: non-editable, no fit-zoom.
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
  // Reset to default on resize so the panel never floats off-screen.
  snapToDefault()
}

// Mobile only — the docked panel's height varies, so publish it as `paletteHeight`, the
// single source of truth canvas areas reserve.
let dockObserver: ResizeObserver | null = null

function publishDockHeight() {
  const el = panelEl.value
  if (!isMobile.value || !el) {
    // Desktop (floating panel): hold no space.
    setPaletteHeight(0)
    return
  }
  const h = Math.ceil(el.getBoundingClientRect().height)
  // Ignore a 0/tiny reading (hidden or mid-layout) and keep the last good value —
  // under-reserving would let the canvas slide behind the dock.
  if (h > 0)
    setPaletteHeight(h)
}

// The docked height settles only once the reference is placed AND the body has flipped to
// its row layout — hence two frames, not a single microtask.
function schedulePublishDockHeight() {
  requestAnimationFrame(() => requestAnimationFrame(publishDockHeight))
}

// Mount the parent's imperative swatch/brush DOM into our slots. `watch`, not onMounted:
// the parent builds them in its own onMounted, after we've mounted.
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
    // Panel is visible and the reference relocated — publish the real docked height.
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
  // Reconcile the initial reference placement / reserve now that our DOM exists.
  placeTarget()
  schedulePublishDockHeight()

  // Keep the reserve in sync with the panel's rendered height.
  if (panelEl.value) {
    dockObserver = new ResizeObserver(() => publishDockHeight())
    dockObserver.observe(panelEl.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  dockObserver?.disconnect()
  dockObserver = null
  // Return the reference to its home slot so the parent can tear it down (it lives in our
  // dock on mobile).
  if (props.targetEl && props.targetHome && !props.targetHome.contains(props.targetEl))
    props.targetHome.appendChild(props.targetEl)
  // Drop the reserve so other screens don't inherit a stale dock height.
  setPaletteHeight(0)
})

function undo() {
  props.player?.undo()
}

// Tooltip advertises the shortcut the way the platform spells it; aria-label stays "Undo".
const undoTitle = `Undo (${/mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent) ? '⌘Z' : 'Ctrl+Z'})`

function clear() {
  const p = props.player
  if (!p)
    return
  p.pushUndoSnapshot()
  // Bounce through getGrid() to read the current size — the panel needn't know gridW/gridH.
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
        <!-- Dock button — snaps the panel to its default position; pointerdown stopped so
             it doesn't start a drag. -->
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
        <!-- Swatch size sits in the handle, away from the brush slider; pointerdown stopped
             so a size click doesn't start a panel drag. -->
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

      <!-- Mobile has no drag handle, so the swatch-size control gets a static header strip. -->
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
          <div v-if="variant === 'drawing' && !isMobile" class="tools-panel__hint">
            <p>
              {{
                flaggedDone
                  ? 'the room knows'
                  : "tell the room you're ready"
              }}
            </p>
            <p>saved as you draw, good or not</p>
          </div>
          <!-- Keyboard shortcuts help, at the foot of the panel; desktop only, since there's
               no keyboard to shortcut with on mobile. -->
          <div v-if="!isMobile && shortcutsEnabled" class="tools-panel__shortcuts">
            <button
              class="tools-panel__shortcuts-toggle pressable"
              type="button"
              aria-label="Keyboard shortcuts"
              :aria-expanded="shortcutsOpen"
              @pointerdown.stop
              @click="shortcutsOpen = !shortcutsOpen"
            >
              <Keyboard :size="14" />
              <span class="tools-panel__shortcuts-title">for the pros</span>
              <ChevronUp v-if="shortcutsOpen" :size="14" class="tools-panel__shortcuts-chevron" />
              <ChevronDown v-else :size="14" class="tools-panel__shortcuts-chevron" />
            </button>
            <ul v-if="shortcutsOpen">
              <li v-for="s in SHORTCUTS" :key="s.desc">
                <kbd role="img" :aria-label="s.aria ?? s.key">
                  <template v-if="s.shortcut">
                    <template v-for="(t, i) in s.shortcut" :key="i">
                      <component :is="t" v-if="typeof t !== 'string'" :size="13" />
                      <span v-else>{{ t }}</span>
                    </template>
                  </template>
                  <template v-else>{{ s.key }}</template>
                </kbd>
                <span>{{ s.desc }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
// Swatch/brush `:deep()` overrides plus the reactive `--sw` size var — the DOM is mounted
// imperatively by `lib/canvas/pixel.ts`, and `:deep()` only works in a scoped block. Static
// tools-panel chrome lives in `_tools-panel.scss`.
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
    position: relative;
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

  // Hold-Shift quick-swap overlay: a key badge per swatch, hidden until the overlay is on.
  // Dark scrim + white glyph reads on any swatch colour, like the selected-cell white border.
  :deep(.swatch__key) {
    position: absolute;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-family: $font-body;
    font-size: 0.7rem;
    font-weight: 700;
    pointer-events: none;
  }

  :deep(.swatch--keys .swatch__key) {
    display: flex;
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
    // Firefox won't shrink `input[type=range]` below its intrinsic min-width as a flex
    // item, clipping the label; `min-width: 0` lets it give the label its space back.
    min-width: 0;
    accent-color: $primary;
  }

  :deep(.brush__label) {
    min-width: 56px;
    flex-shrink: 0;
    white-space: nowrap;
  }
}
</style>
