<script setup lang="ts">
// Player list — one row per player: avatar chip, name, GM pill, an optional "Make GM"
// transfer button (connected non-self rows), and a "Remove" button on offline rows — both GM-only.
// Styles live in `styles/_player-list.scss`.

import type { ClientMsg, Player } from '@/lib'
import { computed, inject } from 'vue'
import PlayerTag from '@/components/elements/PlayerTag.vue'
import { askConfirm, clientIdKey, MAX_PLAYERS, seatFor, socketKey } from '@/lib'

const props = defineProps<Props>()

interface Props {
  players: Player[]
  // The GM in server state, compared to the viewer's clientId to gate the "Make GM" button.
  gmClientId: string
}
const socket = inject(socketKey)!.value!
const viewerClientId = inject(clientIdKey)!

// Seat is the player's index — join order, stable for the room's life (see `lib/seats.ts`).
// Paired up here so the template resolves it once per row. `i` doubles as seat and render
// position, which only holds while nothing reorders. If that ever changes, map first and
// sort the paired result — sorting `props.players` before the map re-seats every row below.
const rows = computed(() =>
  props.players.map((p, i) => ({ player: p, seat: seatFor(i, p) })),
)

const viewerIsGm = () => props.gmClientId === viewerClientId

function canTransfer(p: Player): boolean {
  return viewerIsGm() && p.connected && p.clientId !== viewerClientId && !p.isGm
}

// Not undoable by the player who does it: only the new GM can hand it back.
async function transferGm(p: Player) {
  if (!await askConfirm(`Transfer GM to ${p.name}?`))
    return
  const msg: ClientMsg = { type: 'gm:transfer', toClientId: p.clientId }
  socket.send(JSON.stringify(msg))
}

function canRemove(p: Player): boolean {
  return viewerIsGm() && !p.connected && !p.isGm
}

// Offline-only, and reversible on their side: a removed player can rejoin if there's room.
async function removePlayer(p: Player) {
  if (!await askConfirm(`Remove ${p.name}? They can rejoin if there's space.`))
    return
  const msg: ClientMsg = { type: 'gm:remove', toClientId: p.clientId }
  socket.send(JSON.stringify(msg))
}
</script>

<template>
  <div class="player-list">
    <p class="label label--eyebrow">
      players ({{ players.length }}/{{ MAX_PLAYERS }})
    </p>
    <ul class="player-list__rows">
      <li
        v-for="{ player: p, seat } in rows"
        :key="p.clientId"
        class="player-list__row"
        :class="{ 'player-list__row--offline': !p.connected }"
        :style="{ '--seat-colour': seat?.colour }"
      >
        <PlayerTag
          v-if="seat"
          :seat="seat"
          :name="p.name"
          size="row"
        >
          <template v-if="!p.connected" #suffix>
            <span class="player-list__offline"> [offline]</span>
          </template>
          <template v-else-if="p.spectating" #suffix>
            <span class="player-list__offline"> [watching]</span>
          </template>
        </PlayerTag>
        <span v-if="p.isGm" class="player-list__pill">GM</span>
        <button
          v-if="canTransfer(p)"
          class="player-list__make-gm pressable"
          type="button"
          :aria-label="`Make ${p.name} GM`"
          @click="transferGm(p)"
        >
          Make GM
        </button>
        <button
          v-if="canRemove(p)"
          class="player-list__remove pressable"
          type="button"
          :aria-label="`Remove ${p.name}`"
          @click="removePlayer(p)"
        >
          Remove
        </button>
      </li>
    </ul>
  </div>
</template>
