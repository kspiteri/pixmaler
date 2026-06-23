<script setup lang="ts">
// Player list — one row per player: avatar, name, GM pill, and an optional
// "Make GM" transfer button when the viewer is the GM and the row is for a
// connected non-self player.

import type { ClientMsg, Player } from '../lib/types'
import { inject } from 'vue'
import { clientIdKey, socketKey } from '../lib/keys'

const props = defineProps<Props>()
// Per-player accent colour — assigned by the player's position in the list.
// Index-based (not a clientId hash) so adjacent players never collide on a
// near-identical colour; cycles once past 7 players, which is past coworker
// party size anyway.
const ROW_COLOURS = [
  '#7c5cff',
  '#ff5ca8',
  '#c8ff2d',
  '#ff8c00',
  '#00cc00',
  '#ef130b',
  '#87ceeb',
]
function colourFor(index: number): string {
  return ROW_COLOURS[index % ROW_COLOURS.length]
}

interface Props {
  players: Player[]
  // The GM as recorded in server state. Compared to viewer's clientId to gate
  // the "Make GM" button.
  gmClientId: string
}
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
  <div class="player-list">
    <p class="label label--eyebrow">
      players ({{ players.length }})
    </p>
    <ul class="player-list__rows">
      <li
        v-for="(p, i) in players"
        :key="p.clientId"
        class="player-list__row"
        :class="{ 'player-list__row--offline': !p.connected }"
        :style="{ '--row-colour': colourFor(i) }"
      >
        <span class="player-list__name">
          {{ p.name }}<span v-if="!p.connected" class="player-list__offline"> [offline]</span>
        </span>
        <span v-if="p.isGm" class="player-list__pill">GM</span>
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
  </div>
</template>

<style scoped lang="scss">
@use '../styles/tokens' as *;

.player-list {
  &__rows {
    list-style: none;
    margin: $gap-3 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: $gap-2;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: $gap-3;
    padding: 0.625rem 0.75rem;
    border-radius: $radius;
    background: $surface;
    border: 2px solid var(--row-colour, #{$border});

    &--offline {
      opacity: 0.5;
    }
  }

  &__name {
    flex: 1;
    min-width: 0;
    color: $fg-80;
    font-size: 0.875rem;
  }
  &__offline {
    color: $fg-25;
  }

  &__pill {
    font-size: 0.625rem;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    border: 1px solid rgba(124, 92, 255, 0.5);
    color: $primary;
  }

  &__make-gm {
    font-size: 0.6875rem;
    padding: 0.25rem 0.5rem;
    border-radius: $radius-sm;
    background: transparent;
    border: 1px solid $border;
    color: $fg-50;
    cursor: pointer;
    transition:
      color 0.15s,
      border-color 0.15s;

    &:hover {
      color: $fg;
      border-color: $fg-25;
    }
  }
}
</style>
