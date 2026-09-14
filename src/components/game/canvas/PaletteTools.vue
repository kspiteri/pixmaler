<script setup lang="ts">
// Palette tools panel — swatch + brush + undo/clear, teleported to <body> so it can be
// dragged (desktop) or dock full-width to the bottom (mobile). The swatch and brush are
// imperative DOM built by the parent; we only mount them in slots.

import type { PixelCanvas } from '@/lib'
import { Check, ChevronDown, ChevronUp, GripVertical, Image as ImageIcon, Pin, PinOff, Trash2, Undo2 } from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { isTouch, paletteDocked, paletteSize, setPaletteDocked, setPaletteHeight, useAppLayout, useDraggable } from '@/lib'
import PaletteShortcuts from './PaletteShortcuts.vue'
import PaletteSizeControl from './PaletteSizeControl.vue'

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
  // The target reference and its home slot; relocated into the panel's dock on every viewport.
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

// Desktop-only collapse for the reference, mirroring the shortcuts disclosure. Open by
// default; on mobile the reference is always shown in the docked bar.
const referenceOpen = ref(true)

const {
  x: panelX,
  y: panelY,
  start: startDrag,
  setPosition: setPanelPosition,
} = useDraggable({ initialX: 16, initialY: 16, disabled: () => isTouch.value, element: () => panelEl.value })

// Below $bp-mobile the panel docks full-width at the bottom and dragging is off.
const { isMobile } = useAppLayout()

// Desktop-only dock/float (persisted). Floating (draggable, over the canvas) by default;
// docked renders in-flow as a column beside the canvas (Teleport disabled).
const floatingDesktop = computed(() => !isMobile.value && !paletteDocked.value)
const inFlow = computed(() => !isMobile.value && paletteDocked.value)

// Draggable only when floating on a fine pointer: Touch mode (or a docked panel) turns the
// handle into a static header, and useDraggable's `disabled` enforces the same at drag start.
const canDrag = computed(() => floatingDesktop.value && !isTouch.value)

// The docked/floating flip changes whether the reference belongs in the dock and how tall
// the reserve is — re-run once the layout has settled.
watch(isMobile, () => {
  nextTick(() => {
    placeTarget()
    schedulePublishDockHeight()
  })
})

// Move the reference into the panel's dock slot. It lives here on every viewport now — a
// compact thumbnail attached to the palette, freeing the whole main area for the canvas.
// Safe to move the imperative `<canvas>`: non-editable, no fit-zoom.
function placeTarget() {
  const el = props.targetEl
  if (!el)
    return
  const dock = dockTargetSlot.value
  if (dock) {
    if (!dock.contains(el))
      dock.appendChild(el)
  }
  else if (props.targetHome && !props.targetHome.contains(el)) {
    props.targetHome.appendChild(el)
  }
}

function defaultPosition(): { x: number, y: number } {
  const rect = props.anchor?.getBoundingClientRect()
  if (!rect)
    return { x: 16, y: 16 }
  // Top-left of the canvas area — the reference no longer sits above the panel in-flow.
  return { x: Math.round(rect.left), y: Math.round(rect.top) }
}

function snapToDefault() {
  const { x, y } = defaultPosition()
  setPanelPosition(x, y)
}

// Floating panel only — re-apply the viewport clamp against the panel's current size, so a
// change that grows it (S/M/L, opening the reference) can't push the header off-screen.
function reclampFloating() {
  if (floatingDesktop.value)
    setPanelPosition(panelX.value, panelY.value)
}

// The handle drags only when floating on a fine pointer; docked or in Touch mode it's static.
function onHandlePointerDown(e: PointerEvent) {
  if (canDrag.value)
    startDrag(e)
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

// Size or reference-collapse changes the docked height (re-measure) and the floating
// footprint (re-clamp so the header stays in view).
watch([paletteSize, referenceOpen], () => {
  schedulePublishDockHeight()
  nextTick(reclampFloating)
})

// Returning to floating re-anchors to the default spot; the canvas refit follows from the
// draw slot's ResizeObserver in either mode.
watch(paletteDocked, (isDocked) => {
  if (!isDocked)
    nextTick(snapToDefault)
})

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
  <Teleport to="body" :disabled="inFlow">
    <div
      v-show="panelVisible"
      ref="panelEl"
      class="tools-panel"
      :class="[`tools-panel--${paletteSize}`, `tools-panel--${variant}`, { 'tools-panel--docked': isMobile, 'tools-panel--float': floatingDesktop, 'tools-panel--dock-side': inFlow }]"
      :style="floatingDesktop ? { transform: `translate(${panelX}px, ${panelY}px)` } : undefined"
    >
      <div
        v-if="!isMobile"
        class="tools-panel__handle"
        :title="canDrag ? 'Drag to move' : undefined"
        @pointerdown="onHandlePointerDown"
      >
        <span v-if="canDrag" class="tools-panel__grip"><GripVertical :size="16" /></span>
        <span class="tools-panel__label">palette</span>
        <!-- Dock / float toggle. pointerdown stopped so it doesn't start a drag. -->
        <button
          class="tools-panel__dock pressable"
          type="button"
          :title="paletteDocked ? 'Float palette' : 'Dock palette to the side'"
          :aria-label="paletteDocked ? 'Float palette' : 'Dock palette'"
          @pointerdown.stop
          @click="setPaletteDocked(!paletteDocked)"
        >
          <PinOff v-if="paletteDocked" :size="14" />
          <Pin v-else :size="14" />
        </button>
        <PaletteSizeControl />
      </div>

      <!-- Mobile has no drag handle, so the swatch-size control gets a static header strip. -->
      <div v-else class="tools-panel__mobile-head">
        <span class="tools-panel__label">palette</span>
        <PaletteSizeControl />
      </div>

      <div class="tools-panel__body">
        <!-- Reference: full-width in the desktop panel with a collapse toggle (like the
             shortcuts); on the mobile dock it's a compact thumbnail beside the controls. -->
        <div class="tools-panel__reference">
          <button
            v-if="!isMobile"
            class="tools-panel__reference-toggle pressable"
            type="button"
            aria-label="Reference image"
            :aria-expanded="referenceOpen"
            @pointerdown.stop
            @click="referenceOpen = !referenceOpen"
          >
            <ImageIcon :size="14" />
            <span class="tools-panel__reference-title">reference</span>
            <ChevronUp v-if="referenceOpen" :size="14" class="tools-panel__reference-chevron" />
            <ChevronDown v-else :size="14" class="tools-panel__reference-chevron" />
          </button>
          <div v-show="isMobile || referenceOpen" ref="dockTargetSlot" class="tools-panel__target" />
        </div>
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
          <div v-if="variant === 'drawing' && !isTouch" class="tools-panel__hint">
            <p>
              {{
                flaggedDone
                  ? 'the room knows'
                  : "tell the room you're ready"
              }}
            </p>
            <p>saved as you draw, good or not</p>
          </div>
          <PaletteShortcuts />
        </div>
      </div>
    </div>
  </Teleport>
</template>
