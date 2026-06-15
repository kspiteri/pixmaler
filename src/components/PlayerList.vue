<script setup lang="ts">
// Player list — single <li> per player, with optional "Make GM" button when
// the viewer is the GM and the row is for a connected non-self player.

import type { ClientMsg, Player } from '../lib/types'
import { inject } from 'vue'
import { clientIdKey, socketKey } from '../lib/keys'

interface Props {
  players: Player[]
  // The GM as recorded in server state. Compared to viewer's clientId to gate
  // the "Make GM" button.
  gmClientId: string
}
const props = defineProps<Props>()

const socket = inject(socketKey)!
const viewerClientId = inject(clientIdKey)!

const viewerIsGm = () => props.gmClientId === viewerClientId

function canTransfer(p: Player): boolean {
  return viewerIsGm() && p.connected && p.clientId !== viewerClientId && !p.isGm
}

function transferGm(p: Player) {
  if (!confirm(`Transfer GM to ${p.name}?`))
    return
  const msg: ClientMsg = { type: 'gm:transfer', toClientId: p.clientId }
  socket.send(JSON.stringify(msg))
}
</script>

<template>
  <ul class="player-list">
    <li v-for="p in players" :key="p.clientId">
      {{ p.name }}{{ p.isGm ? " (GM)" : "" }}{{ p.connected ? "" : " [offline]" }}
      <button
        v-if="canTransfer(p)"
        class="player-list__make-gm"
        type="button"
        @click="transferGm(p)"
      >
        Make GM
      </button>
    </li>
  </ul>
</template>

<style scoped lang="scss">
@use '../styles/tokens' as *;

.player-list {
  padding-left: 1.25rem;

  &__make-gm {
    margin-left: $gap-2;
  }
}
</style>
