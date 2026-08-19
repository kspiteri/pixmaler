<script setup lang="ts">
// LOBBY phase — player list and (for the GM) image picker / start button, or
// (for everyone else) "Waiting for GM…" with the target preview when ready.

import type { PipelineResult } from '../../lib/pipeline'
import type {
  ClientMsg,
  GmConfigureMsg,
  ServerMsg,
} from '../../lib/types'
import { computed, inject, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import ImagePicker from '../../components/ImagePicker.vue'
import PhaseLayout from '../../components/PhaseLayout.vue'
import PlayerList from '../../components/PlayerList.vue'
import Tagline from '../../components/Tagline.vue'
import { PixelCanvas } from '../../lib/canvas'
import { clientIdKey, socketKey } from '../../lib/keys'

type State = Extract<ServerMsg, { type: 'state' }>

const props = defineProps<{ state: State }>()

const socket = inject(socketKey)!.value!
const clientId = inject(clientIdKey)!

const isGm = computed(() => props.state.gmClientId === clientId)
const roomCode = new URLSearchParams(location.search).get('room') ?? ''

// ── Name editing ─────────────────────────────────────────────────────────────
// Everyone can set their display name here. The server seeds a random word-pair
// (App.vue) when none was chosen, so this field is pre-filled and editable.

const myName = computed(() =>
  props.state.players.find(p => p.clientId === clientId)?.name ?? '',
)
const nameDraft = ref(myName.value)
const nameInput = useTemplateRef<HTMLInputElement>('nameInput')

// Keep the draft in sync if the server echoes a different name (e.g. another
// tab renamed us) — but don't clobber what the user is actively typing.
watch(myName, (name) => {
  if (document.activeElement !== nameInput.value)
    nameDraft.value = name
})

function commitName() {
  const next = nameDraft.value.trim()
  if (!next || next === myName.value) {
    nameDraft.value = myName.value // revert empty edits
    return
  }
  localStorage.setItem('pixmaler:name', next)
  socket.send(JSON.stringify({ type: 'rename', name: next } satisfies ClientMsg))
}

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
    // Clipboard API can fail (insecure context / denied) — no-op, the code is
    // still visible for manual copying.
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

// Mirror of the server's gate (`handleStart`), which stays authoritative. The
// count is always real; only the *blocking* is lifted in dev, matching the
// worker's PIXMALER_DEV=1 escape hatch so `pnpm dev` stays solo-testable. The
// hint still renders there, so the gate is visible while it's being bypassed.
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

// ── Non-GM target preview ────────────────────────────────────────────────────
//
// PixelCanvas is imperative, so we render it into a slot div and rebuild on
// config change. (Re-watching by reference works because App.vue replaces the
// whole `state` ref on each server message, which means `state.config` becomes
// a new object reference too.)

const previewSlot = useTemplateRef<HTMLDivElement>('previewSlot')

function renderPreview(config: State['config']) {
  if (!previewSlot.value)
    return
  previewSlot.value.replaceChildren()
  if (!config)
    return
  const label = document.createElement('p')
  label.textContent = `Target image (${config.gridW}×${config.gridH}):`
  const previewPc = new PixelCanvas({
    gridW: config.gridW,
    gridH: config.gridH,
    palette: config.palette,
    targetGrid: config.targetGrid,
    editable: false,
  })
  previewPc.canvas.style.maxWidth = '280px'
  previewPc.canvas.style.height = 'auto'
  previewSlot.value.append(label, previewPc.canvas)
}

watch(
  () => props.state.config,
  (config) => {
    if (!isGm.value)
      renderPreview(config)
  },
  { immediate: true, flush: 'post' },
)

onBeforeUnmount(() => {
  if (copyTimer)
    clearTimeout(copyTimer)
})
</script>

<template>
  <PhaseLayout>
    <template #status>
      <button
        class="lobby__room"
        type="button"
        :title="copied ? 'Copied!' : 'Click to copy the room link'"
        @click="copyLink"
      >
        Room: <span class="lobby__code">{{ roomCode }}</span>
        <span class="lobby__copy">{{ copied ? "copied!" : "copy link" }}</span>
      </button>
    </template>

    <div class="lobby__body">
      <aside class="lobby__players">
        <label class="field lobby__name">
          <span class="label">Your name</span>
          <input
            ref="nameInput"
            v-model="nameDraft"
            class="input"
            type="text"
            maxlength="24"
            placeholder="choose a name"
            @keydown.enter="nameInput?.blur()"
            @blur="commitName"
          >
        </label>
        <PlayerList :players="state.players" :gm-client-id="state.gmClientId" />
        <!-- GM sees the tagline here, under the roster. Non-GMs get it beside
             the "waiting for GM" line instead (below), where their eyes are. -->
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
            <p class="lobby__waiting-text">
              Waiting for GM to start…
            </p>
            <Tagline class="lobby__waiting-tagline" />
          </div>
          <div ref="previewSlot" class="lobby__preview" />
        </template>
      </section>
    </div>
  </PhaseLayout>
</template>
