<script setup lang="ts">
// DRAWING phase — countdown + done tally + canvas pair + Done social signal.
//
// Submit semantics (plan 04, item 2):
//   - Submission is automatic. Every stroke triggers a debounced
//     `draw:submit`; what's on the canvas at the deadline is what counts.
//   - The canvas is NEVER locked from this view — only the server's phase
//     transition to VOTING ends the round, at which point this whole view
//     unmounts.
//   - "Done" is a *social signal*, not a submit action. Clicking it fires
//     `draw:done` so the GM and the room see "Aida is done" via the
//     "X of Y done" tally. Submission already happens automatically, so
//     this button doesn't gate it.

import type { ClientMsg, ServerMsg } from '../../lib/types'
import {
  computed,
  inject,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
} from 'vue'
import CanvasPair from '../../components/CanvasPair.vue'
import PhaseLayout from '../../components/PhaseLayout.vue'
import { orientationFor } from '../../lib/aspect'
import { clientIdKey, socketKey } from '../../lib/keys'

type State = Extract<ServerMsg, { type: 'state' }>

const props = defineProps<{ state: State, initialGrid: number[] | null }>()

const socket = inject(socketKey)!.value!
const clientId = inject(clientIdKey)!
// `state.config` is checked non-null in App.vue's v-if, so this assertion is safe.
const config = computed(() => props.state.config!)
// Server-echoed grid for a rejoin mid-round. Length-checked against the live
// config: `handleSubmit` stores whatever a client sent without validating, so
// a wrong-sized grid would render as garbage. Mismatch → ignore and start
// blank, which is the pre-existing behaviour.
const restoredGrid = computed(() => {
  const g = props.initialGrid
  if (!g)
    return null
  const expected = config.value.gridW * config.value.gridH
  if (g.length !== expected) {
    console.warn(`[pixmaler] ignoring restored grid: got ${g.length} cells, expected ${expected}`)
    return null
  }
  return g
})
const deadline = computed(() => props.state.deadline)
const doneText = computed(() =>
  `${props.state.doneCount} of ${props.state.totalDrawing} done`,
)

const pairRef = useTemplateRef<InstanceType<typeof CanvasPair>>('pair')
// Seconds remaining on the countdown (null until we know the deadline).
const secondsLeft = ref<number | null>(null)
const totalSeconds = computed(() => config.value.drawSeconds)

// Ratio-aware layout (item 5). The drawing screen is a fixed, non-scrolling
// shell; we flip the reference/canvas pair between a row and a column so the
// editable canvas always claims the largest fitting area. `orientationFor`
// compares the grid's aspect to the live viewport.
const viewportW = ref(window.innerWidth)
const viewportH = ref(window.innerHeight)
function onResize() {
  viewportW.value = window.innerWidth
  viewportH.value = window.innerHeight
}
const orientation = computed(() =>
  orientationFor(config.value.gridW, config.value.gridH, viewportW.value, viewportH.value),
)

// "Done" is a purely social signal (it never gates submission). Local optimistic
// flag for instant feedback on click, OR'd with the server's truth so a player
// who reconnects mid-DRAWING (local flag reset to false) still sees their
// already-flagged state restored rather than a fresh "I'm done" button.
const flaggedLocally = ref(false)
const flaggedDone = computed(() =>
  flaggedLocally.value
  || (props.state.players.find(p => p.clientId === clientId)?.doneDrawing ?? false),
)

// Derived timer presentation. Bar shrinks as time runs out and shifts
// lime → orange → red in the final stretch for urgency.
const timerText = computed(() =>
  secondsLeft.value === null ? 'drawing…' : `${secondsLeft.value}s left`,
)
const timerPct = computed(() => {
  if (secondsLeft.value === null || totalSeconds.value <= 0)
    return 100
  return Math.max(0, Math.min(100, (secondsLeft.value / totalSeconds.value) * 100))
})
const timerColour = computed(() => {
  const s = secondsLeft.value
  if (s === null || s > 40)
    return '#c8ff2d' // accent
  if (s > 20)
    return '#ff8c00' // orange
  return '#ef130b' // danger
})

let autoSubmitTimer: ReturnType<typeof setTimeout> | null = null
let resubmitTimer: ReturnType<typeof setTimeout> | null = null
let rafId: number | null = null
// Latest grid from the @update event — the deadline auto-submit reads it.
let latestGrid: number[] | null = null
// Last grid we actually sent over the wire. Used to skip no-op resubmits
// (e.g. paint → undo → paint identical, or hover-click on the same colour).
let lastSentGrid: number[] | null = null

const RESUBMIT_DEBOUNCE_MS = 500

function gridsEqual(a: number[], b: number[]): boolean {
  if (a === b)
    return true
  if (a.length !== b.length)
    return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i])
      return false
  }
  return true
}

function sendSubmit(grid: number[]) {
  if (lastSentGrid && gridsEqual(grid, lastSentGrid))
    return
  // Snapshot the array — `latestGrid` may keep mutating as more strokes
  // land. (`getGrid()` already returns a copy, so this is belt-and-braces.)
  lastSentGrid = [...grid]
  socket.send(JSON.stringify({ type: 'draw:submit', grid } satisfies ClientMsg))
}

function onCanvasUpdate(grid: number[]) {
  latestGrid = grid
  if (resubmitTimer)
    clearTimeout(resubmitTimer)
  resubmitTimer = setTimeout(() => {
    if (latestGrid)
      sendSubmit(latestGrid)
  }, RESUBMIT_DEBOUNCE_MS)
}

function flagDone() {
  if (flaggedDone.value)
    return
  flaggedLocally.value = true
  // Pure social ping — no `draw:submit` here. Auto-submit handles the wire
  // state; this just tells the room "I think I'm finished".
  socket.send(JSON.stringify({ type: 'draw:done' } satisfies ClientMsg))
}

function autoSubmitAtDeadline() {
  // Whatever's on the canvas at the deadline is what gets locked in. The
  // server transitions to VOTING immediately after, dropping any further
  // submits via its phase guard.
  const player = pairRef.value?.player()
  if (!player)
    return
  const grid = latestGrid ?? player.getGrid()
  sendSubmit(grid)
}

function cancelTimers() {
  if (autoSubmitTimer) { clearTimeout(autoSubmitTimer); autoSubmitTimer = null }
  if (resubmitTimer) { clearTimeout(resubmitTimer); resubmitTimer = null }
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }
}

onMounted(() => {
  // The server already has this exact grid — it just sent it to us. Priming
  // `lastSentGrid` makes `sendSubmit`'s equality check suppress the redundant
  // round-trip that CanvasPair's watcher would otherwise trigger via onUpdate.
  if (restoredGrid.value)
    lastSentGrid = [...restoredGrid.value]

  const dl = deadline.value
  if (dl) {
    // Tick unconditionally until 0 — the countdown reflects wall-clock time,
    // independent of submit state.
    const tick = () => {
      const left = Math.max(0, Math.ceil((dl - Date.now()) / 1000))
      secondsLeft.value = left
      if (left > 0)
        rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    const remaining = Math.max(0, dl - Date.now())
    autoSubmitTimer = setTimeout(autoSubmitAtDeadline, remaining)
  }

  // No deadline → secondsLeft stays null; timerText shows "drawing…".

  // Cancel pending sends if the socket goes away. Phase change is handled by
  // onBeforeUnmount.
  socket.addEventListener('close', cancelTimers, { once: true })
})

// Cmd/Ctrl+Z → undo. Always available — the canvas never locks during DRAWING.
function onKeyDown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
    const player = pairRef.value?.player()
    if (!player)
      return
    e.preventDefault()
    player.undo()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('resize', onResize)
  cancelTimers()
})
</script>

<template>
  <PhaseLayout :progress="timerPct" :progress-colour="timerColour">
    <template #status>
      <span class="drawing__timer" :style="{ color: timerColour }">
        {{ timerText }}
      </span>
      <span class="drawing__done">{{ doneText }}</span>
    </template>

    <div class="drawing__body">
      <CanvasPair
        ref="pair"
        :grid-w="config.gridW"
        :grid-h="config.gridH"
        :palette="config.palette"
        :target-grid="config.targetGrid"
        :initial-grid="restoredGrid"
        variant="drawing"
        :orientation="orientation"
        :flagged-done="flaggedDone"
        @update="onCanvasUpdate"
        @done="flagDone"
      />
    </div>
  </PhaseLayout>
</template>

<style scoped lang="scss">
@use '../../styles/tokens' as *;

.drawing {
  &__timer {
    font-family: $font-display;
    font-weight: 700;
    font-size: 1.05rem;
  }
  &__done {
    color: $fg-35;
    font-size: 0.875rem;
  }

  &__body {
    // ── Fixed drawing shell (item 5, Pattern A) ─────────────────────────────
    // The drawing screen is a non-scrolling `--vh-safe` shell on every viewport:
    // the canvas pair fills the whole shell, and the editable canvas (sized
    // imperatively by PixelCanvas.fitTo) grows to the largest aspect-preserving
    // box that fits — so the page never scrolls and the canvas is never left
    // small. The "Ready" (done) control now lives inside the floating palette.
    height: 100%;
    max-width: $page-max;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    padding: $gap-4;
    gap: $gap-4;
    overflow: hidden;

    @media (max-width: $bp-mobile) {
      // On phones the tools panel docks fixed to the bottom. The space it needs
      // is reserved *inside* <CanvasPair> now (it reads the measured palette
      // height from the shared app-layout context and pads the canvas area by
      // exactly that much), so the shell body itself holds no reservation here —
      // this keeps a single source of truth for "how tall is the palette".
      max-width: none;
      padding: 0;
      gap: 0;
    }
  }
}

// Lock the shared phase shell to the safe viewport height so the body fills it
// exactly and nothing scrolls — the drawing surface is a fixed shell on every
// viewport. `.phase` is PhaseLayout's root, which inherits this component's
// scope id, so a plain selector reaches it and this only affects the DRAWING
// screen (other phases keep `min-height: 100vh`).
.phase {
  // `_phase.scss` sets `min-height: 100vh` on every phase shell. On mobile
  // `100vh` is TALLER than the visible viewport whenever the browser URL bar is
  // shown (it counts the collapsed-bar height), so leaving that min-height in
  // place forces `.phase` past the real viewport and the window scrolls even
  // though `height` is the safe `100dvh`. Reset both height AND min-height to
  // the safe value so the shell is exactly the visible viewport and nothing
  // scrolls.
  height: var(--vh-safe);
  min-height: var(--vh-safe);
  max-height: var(--vh-safe);
  overflow: hidden;
}
</style>
