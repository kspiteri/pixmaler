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
import PlayerList from '../../components/PlayerList.vue'
import { PixelCanvas } from '../../lib/canvas'
import { clientIdKey, socketKey } from '../../lib/keys'

type State = Extract<ServerMsg, { type: 'state' }>

const props = defineProps<{ state: State }>()

const socket = inject(socketKey)!
const clientId = inject(clientIdKey)!

const isGm = computed(() => props.state.gmClientId === clientId)
const roomCode = new URLSearchParams(location.search).get('room') ?? ''

// ── GM controls ──────────────────────────────────────────────────────────────

const startDisabled = ref(true)
const pickerRef = useTemplateRef<InstanceType<typeof ImagePicker>>('picker')
let lastConfig: GmConfigureMsg | null = null

function onProcessing() { startDisabled.value = true }

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
  startDisabled.value = false
}

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
let previewPc: PixelCanvas | null = null

function renderPreview(config: State['config']) {
  if (!previewSlot.value)
    return
  previewSlot.value.replaceChildren()
  previewPc = null
  if (!config)
    return
  const label = document.createElement('p')
  label.textContent = `Target image (${config.gridW}×${config.gridH}):`
  previewPc = new PixelCanvas({
    gridW: config.gridW,
    gridH: config.gridH,
    palette: config.palette,
    targetGrid: config.targetGrid,
    editable: false,
  })
  previewPc.canvas.style.maxWidth = '300px'
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

onBeforeUnmount(() => { previewPc = null })
</script>

<template>
  <div class="page page--mid lobby">
    <h2>Room: {{ roomCode }}</h2>

    <PlayerList :players="state.players" :gm-client-id="state.gmClientId" />

    <template v-if="isGm">
      <div class="lobby__gm">
        <ImagePicker
          ref="picker"
          show-mobile-warn
          show-draw-seconds
          show-preview
          @processing="onProcessing"
          @result="onResult"
        />
        <button
          class="lobby__start"
          type="button"
          :disabled="startDisabled"
          @click="startGame"
        >
          Start game
        </button>
      </div>
    </template>

    <template v-else>
      <p class="lobby__waiting">
        Waiting for GM to start…
      </p>
      <div ref="previewSlot" class="lobby__preview" />
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/tokens' as *;

.lobby {
  &__gm {
    margin-top: $gap-4;
  }
  &__start {
    margin-top: $gap-4;
  }
  &__waiting {
    margin-top: $gap-4;
  }

  &__preview {
    margin-top: $gap-4;
    :deep(canvas) {
      max-width: 300px;
      height: auto;
    }
  }
}
</style>
