<script setup lang="ts">
// DRAWING phase — countdown + done tally + canvas pair + Done social signal.
//
// Submit semantics:
//   - Submission is automatic. Every stroke triggers a debounced `draw:submit`;
//     what's on the canvas at the deadline is what counts.
//   - The canvas is NEVER locked from this view — only the server's phase transition
//     to VOTING ends the round, unmounting this view.
//   - "Done" is a social signal, not a submit action. Clicking it fires `draw:done`
//     so the room sees the player in the "X of Y ready" tally; it doesn't gate submission.

import type { ClientMsg, ServerMsg } from '../../lib/types'
import { CircleSlash, TriangleAlert } from '@lucide/vue'
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
import { useCountdownAnnounce } from '../../lib/countdown'
import { askConfirm } from '../../lib/dialog'
import { clientIdKey, socketKey } from '../../lib/keys'

type State = Extract<ServerMsg, { type: 'state' }>

const props = defineProps<{
  state: State
  // Held by App.vue rather than read off `state.config`, which no longer carries it.
  targetGrid: number[]
  initialGrid: number[] | null
  // Joined mid-round: watch, don't draw. The server refuses this client's `draw:submit`
  // and `draw:done`, so this flag only decides what they see.
  spectating: boolean
}>()

const socket = inject(socketKey)!.value!
const clientId = inject(clientIdKey)!
// `state.config` is checked non-null in App.vue's v-if, so this assertion is safe.
const config = computed(() => props.state.config!)
// Server-echoed grid for a mid-round rejoin; ignored unless its length matches the live
// config, since the server stores whatever a client sent without validating.
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

// Spectator-only: the reference, rendered read-only. `PixelCanvas` is imperative, so it's
// mounted into a slot and re-mounted if the config changes under it.
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
    targetGrid: props.targetGrid,
    editable: false,
  })
  watchSlot.value.replaceChildren(watchCanvas.canvas)
}, { immediate: true, flush: 'post' })

// GM-only. The step and cap live on the server; this only reports whether to show the button.
const isGm = computed(() => props.state.gmClientId === clientId)
const canExtend = computed(() => props.state.extensionsLeft > 0)

function extendTime() {
  const msg: ClientMsg = { type: 'gm:extendTime' }
  socket.send(JSON.stringify(msg))
}

// Always confirmed: cancelling throws everyone back to the lobby and their drawings are
// gone — a warning that is never untrue, so never suppressed.
async function cancelRound() {
  if (!await askConfirm('Cancel this round? Everyone goes back to the lobby and the drawings are lost.'))
    return
  const msg: ClientMsg = { type: 'gm:cancelRound' }
  socket.send(JSON.stringify(msg))
}

// The countdown jumping upward reads as a glitch unless something marks it as a decision.
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
// Announced into the hidden live region at 60/30/10 then the last five seconds — never
// per second, which would bury the "X of Y ready" tally.
const countdownAnnounce = useCountdownAnnounce(secondsLeft, [60, 30, 10, 5, 4, 3, 2, 1])
// The round's current length, not the configured one — it grows when the GM adds time,
// and dividing by the config would pin the bar at 100%.
const totalSeconds = computed(() => props.state.roundSeconds || config.value.drawSeconds)

// Ratio-aware layout. The fixed shell flips the reference/canvas pair between row and
// column so the editable canvas always claims the largest fitting area (`orientationFor`).
const viewportW = ref(window.innerWidth)
const viewportH = ref(window.innerHeight)
function onResize() {
  viewportW.value = window.innerWidth
  viewportH.value = window.innerHeight
}
const orientation = computed(() =>
  orientationFor(config.value.gridW, config.value.gridH, viewportW.value, viewportH.value),
)

// "Done" is a purely social signal. Local optimistic flag for instant click feedback,
// OR'd with the server's truth so a reconnect restores the flagged state.
const flaggedLocally = ref(false)
const flaggedDone = computed(() =>
  flaggedLocally.value
  || (props.state.players.find(p => p.clientId === clientId)?.doneDrawing ?? false),
)

// Derived timer presentation. Bar shrinks as time runs out and shifts lime → orange → red.
const timerText = computed(() =>
  secondsLeft.value === null ? 'drawing…' : `${secondsLeft.value}s left`,
)
const timerPct = computed(() => {
  if (secondsLeft.value === null || totalSeconds.value <= 0)
    return 100
  return Math.max(0, Math.min(100, (secondsLeft.value / totalSeconds.value) * 100))
})
// Themed, so no hex lives here: one value drives both the ribbon fill and the timer text.
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
// Last grid actually sent over the wire, to skip no-op resubmits.
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
  // Snapshot the array — `latestGrid` may keep mutating as more strokes land.
  lastSentGrid = [...grid]
  socket.send(JSON.stringify({ type: 'draw:submit', grid } satisfies ClientMsg))
}

// Whether the canvas currently has nothing on it. Seeded true (a fresh round starts empty);
// a restored grid and every stroke correct it.
const canvasBlank = ref(true)

// Shown only in the closing stretch and only over an empty canvas — earlier would be noise,
// with nothing underneath to obscure. 20 s reuses the `--timer-danger` threshold.
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
  // Pure social ping — no `draw:submit` here; auto-submit handles the wire state.
  socket.send(JSON.stringify({ type: 'draw:done' } satisfies ClientMsg))
}

function autoSubmitAtDeadline() {
  // Whatever's on the canvas at the deadline is locked in. The server transitions to
  // VOTING immediately after, dropping further submits via its phase guard.
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

// Restartable, because the deadline can move: the GM's "+15s" arrives as a fresh `state`
// push mid-round, so tick and auto-submit must not pin to the mount-time value.
function armCountdown() {
  if (autoSubmitTimer) { clearTimeout(autoSubmitTimer); autoSubmitTimer = null }
  if (rafId) { cancelAnimationFrame(rafId); rafId = null }

  const dl = deadline.value
  // No deadline → secondsLeft stays null; timerText shows "drawing…".
  if (!dl)
    return

  // Tick unconditionally until 0 — the countdown reflects wall-clock time. Reads
  // `deadline.value` each frame, so an extension lands on the very next frame.
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
  // The server already has this exact grid. Priming `lastSentGrid` makes `sendSubmit`'s
  // equality check suppress the redundant round-trip CanvasPair's watcher would trigger.
  if (restoredGrid.value)
    lastSentGrid = [...restoredGrid.value]

  armCountdown()

  // Cancel pending sends if the socket goes away; phase change is handled by onBeforeUnmount.
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
  // `{ once: true }` above only self-removes when the listener fires, and the socket outlives
  // this component, so without this each DRAWING round would leak a listener across the loop.
  socket.removeEventListener('close', cancelTimers)
  cancelTimers()
})
</script>

<template>
  <PhaseLayout heading="Drawing" class="phase--fixed" :progress="timerPct" :progress-colour="timerColour">
    <template #status>
      <span
        class="drawing__timer"
        :class="{ 'drawing__timer--added': timeAdded }"
        :style="{ color: timerColour }"
      >
        {{ timerText }}
      </span>
      <span class="drawing__done" role="status">{{ doneText }}</span>
      <!-- The visible timer ticks silently; this reads the remaining time aloud at
           milestones only (see `countdownAnnounce`), so it isn't sight-only. -->
      <span class="sr-only" role="status">{{ countdownAnnounce }}</span>
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
        class="btn btn--ghost btn--icon-mobile drawing__cancel"
        type="button"
        title="Abandon this round and return everyone to the lobby"
        aria-label="Cancel round"
        @click="cancelRound"
      >
        <CircleSlash class="btn__icon" :size="16" aria-hidden="true" />
        <span class="btn__label">Cancel round</span>
      </button>
    </template>

    <!-- Spectators get the reference and the room's progress, but no canvas: they joined
         after this round started. The target is safe to show — a new image next round. -->
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
        :target-grid="targetGrid"
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
