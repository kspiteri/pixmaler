<script setup lang="ts">
// The GM's lobby controls: the image picker, the start button and its gate hint. Sends
// gm:configure on each picker result and gm:start on click. The roster, name and shape
// controls stay in the lobby; this is only the game-setup column.

import type { ClientMsg, GmConfigureMsg, PipelineResult, Player } from '@/lib'
import { computed, inject, ref, useTemplateRef } from 'vue'
import { socketKey } from '@/lib'
import ImagePicker from '../image/ImagePicker.vue'

const props = defineProps<{ players: Player[] }>()

const socket = inject(socketKey)!.value!

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

// Mirror of the server's gate (handleStart), which stays authoritative. The count is always
// real; only the blocking is lifted in dev, so the hint still shows the gate.
const MIN_PLAYERS = 2

const missingPlayers = computed(() => {
  const present = props.players.filter(p => p.connected && !p.isGm).length
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
    return import.meta.env.DEV ? `${need} (ignored in dev)` : need
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
</script>

<template>
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
