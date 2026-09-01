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
import { TriangleAlert } from '@lucide/vue'
import {
  computed,
  inject,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
  watch,
} from 'vue'
import AlertToast from '../../components/AlertToast.vue'
import CanvasPair from '../../components/CanvasPair.vue'
import PhaseLayout from '../../components/PhaseLayout.vue'
import { orientationFor } from '../../lib/aspect'
import { PixelCanvas } from '../../lib/canvas/pixel'
import { askConfirm } from '../../lib/dialog'
import { clientIdKey, socketKey } from '../../lib/keys'

type State = Extract<ServerMsg, { type: 'state' }>

const props = defineProps<{
  state: State
  initialGrid: number[] | null
  // Joined mid-round: watch, don't draw. The server already refuses this client's
  // `draw:submit` and `draw:done` and leaves them out of the done tally, so this
  // flag only decides what they see — it is not the enforcement.
  spectating: boolean
}>()

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
  `${props.state.doneCount} of ${props.state.totalDrawing} ready`,
)

const pairRef = useTemplateRef<InstanceType<typeof CanvasPair>>('pair')

// Spectator-only: the reference, rendered read-only. Same shape as the lobby's
// non-GM preview — `PixelCanvas` is imperative, so it is mounted into a slot
// rather than driven by reactivity, and re-mounted if the config changes under it.
const watchSlot = useTemplateRef<HTMLElement>('watchSlot')
let watchCanvas: PixelCanvas | null = null

watch([() => props.spectating, () => props.state.config, watchSlot], () => {
  if (!props.spectating || !watchSlot.value || !props.state.config) {
    watchCanvas = null
    return
  }
  const cfg = props.state.config
  watchCanvas = new PixelCanvas({
    gridW: cfg.gridW,
    gridH: cfg.gridH,
    palette: cfg.palette,
    targetGrid: cfg.targetGrid,
    editable: false,
  })
  watchSlot.value.replaceChildren(watchCanvas.canvas)
}, { immediate: true, flush: 'post' })

// GM-only. The step and the cap live on the server; this only reports whether the
// button is still worth showing.
const isGm = computed(() => props.state.gmClientId === clientId)
const canExtend = computed(() => props.state.extensionsLeft > 0)

function extendTime() {
  const msg: ClientMsg = { type: 'gm:extendTime' }
  socket.send(JSON.stringify(msg))
}

// Always confirmed: cancelling throws everyone back to the lobby mid-paint and
// their drawings are gone. There is no state in which that warning is untrue, so
// unlike Voting's end-round confirm this one is never suppressed.
async function cancelRound() {
  if (!await askConfirm('Cancel this round? Everyone goes back to the lobby and the drawings are lost.'))
    return
  const msg: ClientMsg = { type: 'gm:cancelRound' }
  socket.send(JSON.stringify(msg))
}

// The countdown jumping upward reads as a glitch unless something marks it as a
// decision. Everyone sees this, not just the GM who pressed it.
const timeAdded = ref(false)
let bumpTimer: ReturnType<typeof setTimeout> | null = null
watch(() => props.state.roundSeconds, (now, before) => {
  if (before === undefined || now <= before)
    return
  timeAdded.value = true
  if (bumpTimer)
    clearTimeout(bumpTimer)
  bumpTimer = setTimeout(() => { timeAdded.value = false }, 700)
})

// Seconds remaining on the countdown (null until we know the deadline).
const secondsLeft = ref<number | null>(null)
// The round's current length, not the configured one — it grows when the GM adds
// time, and dividing by the config would pin the bar at 100%.
const totalSeconds = computed(() => props.state.roundSeconds || config.value.drawSeconds)

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
// Themed, so no hex lives here: one value drives both the ribbon fill and the timer
// text, and neither reads on a light page in bright lime.
const timerColour = computed(() => {
  const s = secondsLeft.value
  if (s === null || s > 40)
    return 'var(--timer-ok)'
  if (s > 20)
    return 'var(--timer-warn)'
  return 'var(--timer-danger)'
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

// Whether the canvas currently has nothing on it. Drives the late warning below.
// Seeded true because a fresh round starts empty; a restored grid corrects it on
// mount, and every stroke corrects it from here.
const canvasBlank = ref(true)

// Shown only in the closing stretch, and only over an empty canvas. A blank canvas
// is normal for most of the round, so warning early would be noise — and by
// definition there is nothing underneath to obscure. 20 s is the existing
// `--timer-danger` threshold rather than a new number.
const BLANK_WARN_AT = 20
const warnBlank = computed(() =>
  !props.spectating
  && canvasBlank.value
  && secondsLeft.value !== null
  && secondsLeft.value <= BLANK_WARN_AT,
)

function onCanvasUpdate(grid: number[]) {
  latestGrid = grid
  canvasBlank.value = grid.every(cell => cell === -1)
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
  if (bumpTimer) { clearTimeout(bumpTimer); bumpTimer = null }
  if (autoSubmitTimer) { clearTimeout(autoSubmitTimer); autoSubmitTimer = null }
  if (resubmitTimer) { clearTimeout(resubmitTimer); resubmitTimer = null }
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }
}

// Restartable, because the deadline can move: the GM's "+15s" arrives as a fresh
// `state` push mid-round. The old version read `deadline.value` into a local at
// mount, so both the tick and the auto-submit stayed pinned to the first value and
// a revised deadline was silently ignored.
function armCountdown() {
  if (autoSubmitTimer) { clearTimeout(autoSubmitTimer); autoSubmitTimer = null }
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }

  const dl = deadline.value
  // No deadline → secondsLeft stays null; timerText shows "drawing…".
  if (!dl)
    return

  // Tick unconditionally until 0 — the countdown reflects wall-clock time,
  // independent of submit state. Reads `deadline.value` each frame rather than the
  // captured `dl`, so an extension lands on the very next frame.
  const tick = () => {
    const now = deadline.value
    if (!now)
      return
    const left = Math.max(0, Math.ceil((now - Date.now()) / 1000))
    secondsLeft.value = left
    if (left > 0)
      rafId = requestAnimationFrame(tick)
  }
  rafId = requestAnimationFrame(tick)
  autoSubmitTimer = setTimeout(autoSubmitAtDeadline, Math.max(0, dl - Date.now()))
}

watch(deadline, armCountdown)

onMounted(() => {
  // The server already has this exact grid — it just sent it to us. Priming
  // `lastSentGrid` makes `sendSubmit`'s equality check suppress the redundant
  // round-trip that CanvasPair's watcher would otherwise trigger via onUpdate.
  if (restoredGrid.value)
    lastSentGrid = [...restoredGrid.value]

  armCountdown()

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
  // `{ once: true }` above only self-removes when the listener actually fires, and the socket
  // outlives this component — it is created in `App.vue` and survives every phase change. So
  // without this line each DRAWING round left another listener holding an unmounted scope
  // alive, growing with exactly the play-again / cancel loop items 50 and 55 are about.
  socket.removeEventListener('close', cancelTimers)
  cancelTimers()
})
</script>

<template>
  <PhaseLayout class="phase--fixed" :progress="timerPct" :progress-colour="timerColour">
    <template #status>
      <span
        class="drawing__timer"
        :class="{ 'drawing__timer--added': timeAdded }"
        :style="{ color: timerColour }"
      >
        {{ timerText }}
      </span>
      <span class="drawing__done">{{ doneText }}</span>
      <button
        v-if="isGm && canExtend"
        class="btn btn--ghost drawing__extend"
        type="button"
        title="Give everyone another 15 seconds"
        @click="extendTime"
      >
        +15s
      </button>
      <button
        v-if="isGm"
        class="btn btn--ghost drawing__cancel"
        type="button"
        title="Abandon this round and return everyone to the lobby"
        @click="cancelRound"
      >
        Cancel round
      </button>
    </template>

    <!-- Spectators get the reference and the room's progress, but no canvas: they
         joined after this round started. Showing the target is deliberate and
         harmless — the GM picks a new image next round, so there is nothing to
         leak, and it beats a blank wait for up to two minutes. -->
    <div v-if="spectating" class="drawing__body drawing__body--watching">
      <p class="drawing__watching-note">
        you joined mid-round — watching this one, drawing the next
      </p>
      <div ref="watchSlot" class="drawing__watching-target" />
    </div>

    <div v-else class="drawing__body">
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
      <AlertToast v-if="warnBlank" class="drawing__blank-warn">
        <template #icon>
          <TriangleAlert class="toast__icon" :size="16" aria-hidden="true" />
        </template>
        hello? your canvas is empty!
      </AlertToast>
    </div>
  </PhaseLayout>
</template>
