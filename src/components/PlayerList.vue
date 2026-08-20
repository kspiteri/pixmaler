<script setup lang="ts">
// Player list — one row per player: avatar chip, name, GM pill, and an optional
// "Make GM" transfer button when the viewer is the GM and the row is for a
// connected non-self player.
//
// Styles live in `styles/_player-list.scss`, not here: it's static chrome with
// nothing that needs `:deep()`, so there was no reason for a scoped block.

import type { ClientMsg, Player } from '../lib/types'
import { computed, inject } from 'vue'
import { askConfirm } from '../lib/dialog'
import { clientIdKey, socketKey } from '../lib/keys'
import { seatFor } from '../lib/seats'

const props = defineProps<Props>()

interface Props {
  players: Player[]
  // The GM as recorded in server state. Compared to viewer's clientId to gate
  // the "Make GM" button.
  gmClientId: string
}
const socket = inject(socketKey)!.value!
const viewerClientId = inject(clientIdKey)!

// Seat is the player's index — join order, stable for the room's life (see
// `lib/seats.ts`). Paired up here so the template resolves it once per row
// rather than once per binding.
//
// `i` is doing double duty: it is both the seat and the render position, and
// that only holds while nothing reorders. Nothing does today, and the current
// intent is to keep it that way — a kicked player (`13-technical.md` item 33)
// would stay in place, exactly as an `[offline]` one does. **If that ever
// changes**, map first and sort the paired result, never the other way round:
// sorting `props.players` before the map re-seats every row below the moved one
// and silently re-colours players mid-game.
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
</script>

<template>
  <div class="player-list">
    <p class="label label--eyebrow">
      players ({{ players.length }})
    </p>
    <ul class="player-list__rows">
      <li
        v-for="{ player: p, seat } in rows"
        :key="p.clientId"
        class="player-list__row"
        :class="{ 'player-list__row--offline': !p.connected }"
        :style="{ '--seat-colour': seat?.colour }"
      >
        <!-- Decorative: the name sits right beside it, so the letter is never
             the only way to tell who this is. -->
        <span
          v-if="seat"
          class="avatar"
          :class="`avatar--${seat.shape}`"
          aria-hidden="true"
        >{{ seat.initial }}</span>
        <span class="player-list__name">
          {{ p.name }}<span v-if="!p.connected" class="player-list__offline"> [offline]</span>
        </span>
        <span v-if="p.isGm" class="player-list__pill">GM</span>
        <button
          v-if="canTransfer(p)"
          class="player-list__make-gm pressable"
          type="button"
          @click="transferGm(p)"
        >
          Make GM
        </button>
      </li>
    </ul>
  </div>
</template>
