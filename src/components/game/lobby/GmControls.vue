<script setup lang="ts">
// The GM's lobby controls: the image picker, the start button and its gate hint. Sends
// gm:configure on each picker result and gm:start on click. The roster, name and shape
// controls stay in the lobby; this is only the game-setup column.

import type { ClientMsg, GmConfigureMsg, PipelineResult, Player, RoundConfig } from '@/lib'
import { Play } from '@lucide/vue'
import { computed, inject, ref, useTemplateRef } from 'vue'
import Button from '@/components/elements/Button.vue'
import { socketKey } from '@/lib'
import ImagePicker from '../image/ImagePicker.vue'

// `config`/`targetGrid` are the room's authoritative target — after a GM reload the local
// picker is blank but the room still holds one, so it seeds the preview and enables Start.
const props = defineProps<{
  players: Player[]
  config: RoundConfig | null
  targetGrid: number[] | null
}>()

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

// The room having a target is what enables Start — a fresh local pick or, after a reload, the
// config the server still holds. `startGame` sends a bare `gm:start` in the reload case.
const startDisabled = computed(() =>
  (!imageReady.value && !props.config) || (missingPlayers.value > 0 && !import.meta.env.DEV),
)

const startHint = computed(() => {
  if (!imageReady.value && !props.config)
    return 'choose an image to start'
  if (missingPlayers.value > 0) {
    const need = `need ${missingPlayers.value} more player${missingPlayers.value === 1 ? '' : 's'}`
    return import.meta.env.DEV ? `${need} (ignored in dev)` : need
  }
  return ''
})

function startGame() {
  // A fresh pick re-sends its config (with the latest drawSeconds); after a reload the server
  // already holds the room's config, so a bare start is enough.
  if (lastConfig) {
    const finalConfig: GmConfigureMsg = {
      ...lastConfig,
      drawSeconds: pickerRef.value?.getDrawSeconds() ?? 120,
    }
    socket.send(JSON.stringify(finalConfig))
  }
  else if (!props.config) {
    return
  }
  socket.send(JSON.stringify({ type: 'gm:start' } satisfies ClientMsg))
}

// The GM cleared the target: the picker has already reset itself, so drop our cached config and
// tell the server to un-configure the room.
function clearImage() {
  imageReady.value = false
  lastConfig = null
  socket.send(JSON.stringify({ type: 'gm:clear' } satisfies ClientMsg))
}
</script>

<template>
  <p class="label label--eyebrow">
    game setup
  </p>
  <ImagePicker
    ref="picker"
    show-mobile-warn
    show-draw-seconds
    show-preview
    :room-config="config"
    :room-target="targetGrid"
    @processing="onProcessing"
    @result="onResult"
    @clear="clearImage"
  />
  <div>
    <Button
      variant="primary"
      class="lobby__start"
      :disabled="startDisabled"
      :aria-describedby="startHint ? 'lobby-start-hint' : undefined"
      @click="startGame"
    >
      <template #icon>
        <Play :size="18" aria-hidden="true" />
      </template>
      Start game
    </Button>
    <p v-if="startHint" id="lobby-start-hint" class="lobby__start-hint" role="status">
      {{ startHint }}
    </p>
  </div>
</template>
