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

import type { ClientMsg, ServerMsg } from '../../lib'
import { CircleSlash, TriangleAlert } from '@lucide/vue'
import {
  computed,
  inject,
  onBeforeUnmount,
  ref,
  useTemplateRef,
  watch,
} from 'vue'
import AlertToast from '../../components/AlertToast.vue'
import CanvasPair from '../../components/CanvasPair.vue'
import PhaseLayout from '../../components/PhaseLayout.vue'
import PixelThumb from '../../components/PixelThumb.vue'
import { clientIdKey, socketKey, useCountdownAnnounce, useDrawSubmit, useGmActions, useOrientation } from '../../lib'

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
const { cancelRound } = useGmActions(socket)
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
const doneText = computed(() =>
  `${props.state.doneCount} of ${props.state.totalDrawing} ready`,
)

const pairRef = useTemplateRef<InstanceType<typeof CanvasPair>>('pair')

const { secondsLeft, canvasBlank, onCanvasUpdate } = useDrawSubmit({
  socket,
  deadline: () => props.state.deadline,
  player: () => pairRef.value?.player() ?? null,
  restoredGrid: () => restoredGrid.value,
})

// GM-only. The step and cap live on the server; this only reports whether to show the button.
const isGm = computed(() => props.state.gmClientId === clientId)
const canExtend = computed(() => props.state.extensionsLeft > 0)

function extendTime() {
  const msg: ClientMsg = { type: 'gm:extendTime' }
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

// Announced into the hidden live region at 60/30/10 then the last five seconds — never
// per second, which would bury the "X of Y ready" tally.
const countdownAnnounce = useCountdownAnnounce(secondsLeft, [60, 30, 10, 5, 4, 3, 2, 1])
// The round's current length, not the configured one — it grows when the GM adds time,
// and dividing by the config would pin the bar at 100%.
const totalSeconds = computed(() => props.state.roundSeconds || config.value.drawSeconds)

// Ratio-aware layout: the fixed shell flips the reference/canvas pair between row and column.
const orientation = useOrientation(() => config.value.gridW, () => config.value.gridH)

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

// Shown only in the closing stretch and only over an empty canvas — earlier would be noise,
// with nothing underneath to obscure. 20 s reuses the `--timer-danger` threshold.
const BLANK_WARN_AT = 20
const warnBlank = computed(() =>
  !props.spectating
  && canvasBlank.value
  && secondsLeft.value !== null
  && secondsLeft.value <= BLANK_WARN_AT,
)

function flagDone() {
  if (flaggedDone.value)
    return
  flaggedLocally.value = true
  // Pure social ping — no `draw:submit` here; auto-submit handles the wire state.
  socket.send(JSON.stringify({ type: 'draw:done' } satisfies ClientMsg))
}

onBeforeUnmount(() => {
  if (bumpTimer)
    clearTimeout(bumpTimer)
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
        you joined mid-round, watching this one and drawing the next
      </p>
      <PixelThumb
        v-if="config"
        class="drawing__watching-target"
        :grid-w="config.gridW"
        :grid-h="config.gridH"
        :palette="config.palette"
        :grid="targetGrid"
      />
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
        hello? your canvas is empty
      </AlertToast>
    </div>
  </PhaseLayout>
</template>
