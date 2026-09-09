<script setup lang="ts">
// LOBBY phase — player list and (for the GM) image picker / start button, or
// (for everyone else) "Waiting for GM…" with the target preview when ready.

import type { PipelineResult } from '../../lib/pipeline'
import type {
  AvatarShape,
  ClientMsg,
  GmConfigureMsg,
  ServerMsg,
} from '../../lib/types'
import { Check, CircleSlash, Copy, Power } from '@lucide/vue'
import { computed, inject, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import AlertToast from '../../components/AlertToast.vue'
import ImagePicker from '../../components/ImagePicker.vue'
import NameField from '../../components/NameField.vue'
import PhaseLayout from '../../components/PhaseLayout.vue'
import PlayerList from '../../components/PlayerList.vue'
import PlayerTag from '../../components/PlayerTag.vue'
import Tagline from '../../components/Tagline.vue'
import { PixelCanvas } from '../../lib/canvas/pixel'
import { askConfirm } from '../../lib/dialog'
import { setName, setShape } from '../../lib/identity'
import { clientIdKey, socketKey } from '../../lib/keys'
import { seatFor } from '../../lib/seats'
import { AVATAR_SHAPES } from '../../lib/types'

type State = Extract<ServerMsg, { type: 'state' }>

const props = defineProps<{
  state: State
  // Held by App.vue rather than read off `state.config`, which no longer carries it.
  targetGrid: number[] | null
  // The GM abandoned the last round, so this lobby says why everyone is here and their
  // drawing isn't. Owned by App.vue: the `round-cancelled` message arrives before this view.
  roundCancelled: boolean
}>()

const emit = defineEmits<{
  // Clears the flag in App.vue, which unmounts the toast — kept up there so a dismissal sticks.
  dismissCancelled: []
}>()

const socket = inject(socketKey)!.value!
const clientId = inject(clientIdKey)!

const isGm = computed(() => props.state.gmClientId === clientId)
const roomCode = new URLSearchParams(location.search).get('room') ?? ''

// ── Name editing ─────────────────────────────────────────────────────────────
// Everyone can set their display name here. The server seeds a random word-pair when
// none was chosen, so this field is pre-filled and editable.

const myName = computed(() =>
  props.state.players.find(p => p.clientId === clientId)?.name ?? '',
)
const nameDraft = ref(myName.value)
const renaming = ref(false)

// Keep the draft in sync if the server echoes a different name — but don't clobber what
// the user is actively typing.
watch(myName, (name) => {
  if (!renaming.value)
    nameDraft.value = name
})

function commitName() {
  renaming.value = false
  const next = nameDraft.value.trim()
  if (!next || next === myName.value) {
    nameDraft.value = myName.value // revert empty edits
    return
  }
  setName(next)
  socket.send(JSON.stringify({ type: 'rename', name: next } satisfies ClientMsg))
}

// Enter commits by blurring, so `@blur` stays the single commit path (no double send).
function onRenameKey(e: KeyboardEvent) {
  (e.target as HTMLInputElement).blur()
}

// ── Avatar shape ─────────────────────────────────────────────────────────────
// Browser-local (`pixmaler:shape`) so it follows the player into future rooms, echoed
// through the server so others see it. LOBBY-only, enforced server-side: the chip shows in RESULTS.

// The viewer's own seat, so each option previews in their real colour and initial. `null`
// when this client isn't in `players` yet — a state push can land before the server handles
// our `join`, and hiding the picker for that frame beats a wrong colour.
const mySeat = computed(() => {
  const i = props.state.players.findIndex(p => p.clientId === clientId)
  return i < 0 ? null : seatFor(i, props.state.players[i])
})

function pickShape(shape: AvatarShape) {
  if (shape === mySeat.value?.shape)
    return
  socket.send(JSON.stringify({ type: 'shape', shape } satisfies ClientMsg))
}

// Persist only what the server has accepted. Writing on click would durably store a shape
// the server may refuse (phase flips to DRAWING first) and re-apply on the next `join`.
// `mySeat.shape` is echoed state, so this only records a confirmed choice.
watch(() => mySeat.value?.shape, (shape) => {
  if (shape)
    setShape(shape)
}, { immediate: true })

// The GM's own chip + name, for the non-GM waiting line — waiting for a specific person you
// can see in the roster above. `null` if the GM isn't in `players` yet, falling back to the role.
// The name is not optional: the chip is `aria-hidden`, so alone a screen reader would read
// "waiting for to start…".
const gmSeat = computed(() => {
  const i = props.state.players.findIndex(p => p.clientId === props.state.gmClientId)
  if (i < 0)
    return null
  const seat = seatFor(i, props.state.players[i])
  return seat ? { seat, name: props.state.players[i].name } : null
})

// ── Copy room link ───────────────────────────────────────────────────────────

const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

async function copyLink() {
  try {
    await navigator.clipboard.writeText(location.href)
    copied.value = true
    if (copyTimer)
      clearTimeout(copyTimer)
    copyTimer = setTimeout(() => { copied.value = false }, 2000)
  }
  catch {
    // Clipboard API can fail (insecure context / denied) — no-op, the code is still visible.
  }
}

// ── GM controls ──────────────────────────────────────────────────────────────

const imageReady = ref(false)
const pickerRef = useTemplateRef<InstanceType<typeof ImagePicker>>('picker')
let lastConfig: GmConfigureMsg | null = null

function onProcessing() { imageReady.value = false }

function onResult(result: PipelineResult) {
  lastConfig = {
    type: 'gm:configure',
    gridW: result.gridW,
    gridH: result.gridH,
    palette: result.palette,
    targetGrid: result.targetGrid,
    drawSeconds: pickerRef.value?.getDrawSeconds() ?? 120,
  }
  socket.send(JSON.stringify(lastConfig))
  imageReady.value = true
}

// Mirror of the server's gate (`handleStart`), which stays authoritative. The count is
// always real; only the blocking is lifted in dev, so the hint still shows the gate.
const MIN_PLAYERS = 2

const missingPlayers = computed(() => {
  const present = props.state.players.filter(p => p.connected && !p.isGm).length
  return Math.max(0, MIN_PLAYERS - present)
})

const startDisabled = computed(() =>
  !imageReady.value || (missingPlayers.value > 0 && !import.meta.env.DEV),
)

const startHint = computed(() => {
  if (!imageReady.value)
    return 'choose an image to start'
  if (missingPlayers.value > 0) {
    const need = `need ${missingPlayers.value} more player${missingPlayers.value === 1 ? '' : 's'}`
    return import.meta.env.DEV ? `${need} — ignored in dev` : need
  }
  return ''
})

function startGame() {
  if (!lastConfig)
    return
  // Read drawSeconds fresh in case the GM edited it after the last reprocess.
  const finalConfig: GmConfigureMsg = {
    ...lastConfig,
    drawSeconds: pickerRef.value?.getDrawSeconds() ?? 120,
  }
  socket.send(JSON.stringify(finalConfig))
  socket.send(JSON.stringify({ type: 'gm:start' } satisfies ClientMsg))
}

// Ends the whole session, not just the round — everyone lands on the closed screen and the
// code is released. Always confirmed: irreversible and acts on everybody.
async function endSession() {
  if (!await askConfirm('End the session for everyone? The room closes and this code is released.'))
    return
  socket.send(JSON.stringify({ type: 'gm:endSession' } satisfies ClientMsg))
}

// ── Non-GM target preview ────────────────────────────────────────────────────
// PixelCanvas is imperative, so we render it into a slot div and rebuild on config change.
// (App.vue replaces the whole `state` ref per message, so `state.config` is a new object.)

const previewSlot = useTemplateRef<HTMLDivElement>('previewSlot')

// Only the canvas is built here — the label lives in the template so it can carry a class.
function renderPreview(config: State['config'], grid: number[] | null) {
  if (!previewSlot.value)
    return
  if (!config || !grid) {
    previewSlot.value.replaceChildren()
    return
  }
  const previewPc = new PixelCanvas({
    gridW: config.gridW,
    gridH: config.gridH,
    palette: config.palette,
    targetGrid: grid,
    editable: false,
  })
  previewSlot.value.replaceChildren(previewPc.canvas)
}

// `previewSlot` and `isGm` are watch sources, not just values read inside: the callback must
// re-run when the slot ref populates (before mount `previewSlot.value` is null) and when GM
// transfer mounts the `v-else` branch with no accompanying `config` change. Same shape as
// `Drawing.vue`'s spectator-canvas watcher.
watch(
  [() => props.state.config, () => props.targetGrid, isGm, previewSlot],
  () => {
    if (!isGm.value)
      renderPreview(props.state.config, props.targetGrid)
  },
  { immediate: true, flush: 'post' },
)

onBeforeUnmount(() => {
  if (copyTimer)
    clearTimeout(copyTimer)
})
</script>

<template>
  <PhaseLayout heading="Lobby">
    <template #status>
      <button
        class="lobby__room pressable no-shadow"
        type="button"
        :title="copied ? 'Copied!' : 'Click to copy the room link'"
        :aria-label="copied ? `Room ${roomCode} — link copied` : `Room ${roomCode} — copy link`"
        @click="copyLink"
      >
        <span class="lobby__room-label">Room:</span>
        <span class="lobby__code">{{ roomCode }}</span>
        <component :is="copied ? Check : Copy" class="lobby__copy-icon" :size="15" aria-hidden="true" />
      </button>
      <button
        v-if="isGm"
        class="btn btn--ghost btn--icon-mobile lobby__end"
        type="button"
        title="Close the room for everyone and release this code"
        aria-label="End session"
        @click="endSession"
      >
        <Power class="btn__icon" :size="16" aria-hidden="true" />
        <span class="btn__label">End session</span>
      </button>
    </template>

    <AlertToast
      v-if="roundCancelled"
      class="lobby__notice"
      @dismiss="emit('dismissCancelled')"
    >
      <template #icon>
        <CircleSlash class="toast__icon" :size="16" aria-hidden="true" />
      </template>
      the round was cancelled and you lost your drawing,<br>a new round will soon begin...
    </AlertToast>

    <div class="lobby__body">
      <aside class="lobby__players">
        <div class="lobby__name">
          <NameField
            v-model="nameDraft"
            label="your name"
            @focus="renaming = true"
            @keydown.enter="onRenameKey"
            @blur="commitName"
          />
        </div>
        <div v-if="mySeat" class="field lobby__shape">
          <span id="lobby-shape" class="label">your avatar shape</span>
          <div class="lobby__shapes" role="group" aria-labelledby="lobby-shape">
            <button
              v-for="s in AVATAR_SHAPES"
              :key="s"
              class="lobby__shape-btn pressable no-shadow"
              type="button"
              :aria-pressed="s === mySeat.shape"
              :aria-label="s"
              @click="pickShape(s)"
            >
              <span
                class="avatar"
                :class="`avatar--${s}`"
                :style="{ '--seat-colour': mySeat.colour }"
                aria-hidden="true"
              >{{ mySeat.initial }}</span>
            </button>
          </div>
        </div>
        <PlayerList :players="state.players" :gm-client-id="state.gmClientId" />
        <!-- GM sees the tagline here, under the roster. Non-GMs get it beside the
             "waiting for GM" line instead (below), where their eyes are. -->
        <Tagline v-if="isGm" class="lobby__tagline" />
      </aside>

      <section class="lobby__settings">
        <template v-if="isGm">
          <p class="label label--eyebrow">
            game settings
          </p>
          <ImagePicker
            ref="picker"
            show-mobile-warn
            show-draw-seconds
            show-preview
            @processing="onProcessing"
            @result="onResult"
          />
          <div>
            <button
              class="btn btn--primary lobby__start"
              type="button"
              :disabled="startDisabled"
              @click="startGame"
            >
              Start game
            </button>
            <p v-if="startHint" class="lobby__start-hint">
              {{ startHint }}
            </p>
          </div>
        </template>

        <template v-else>
          <div class="lobby__waiting">
            <p v-if="gmSeat" class="lobby__waiting-text">
              waiting for <PlayerTag :seat="gmSeat.seat" :name="gmSeat.name" /> to start…
            </p>
            <p v-else class="lobby__waiting-text">
              waiting for the GM…
            </p>
          </div>
          <div class="lobby__preview">
            <!-- The placeholder reserves the space so an unconfigured preview reads as
                 waiting rather than broken. -->
            <p class="lobby__preview-label">
              <template v-if="state.config">
                Target image ({{ state.config.gridW }}×{{ state.config.gridH }}):
              </template>
              <template v-else>
                the target image will appear here
              </template>
            </p>
            <div ref="previewSlot" class="lobby__preview-canvas" />
          </div>
          <div class="lobby__tagline">
            <Tagline class="lobby__waiting-tagline" />
          </div>
        </template>
      </section>
    </div>
  </PhaseLayout>
</template>
