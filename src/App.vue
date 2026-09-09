<script setup lang="ts">
// Router (entry / paint / room). Resolves the route and feeds the room state from
// `lib/useRoom` into the phase views; descendants get `socket`/`clientId` by provide.

import AlertDialog from './components/AlertDialog.vue'
import PhaseBoundary from './components/PhaseBoundary.vue'
import { currentDialog, settleDialog, useRoom } from './lib'
import Entry from './views/Entry.vue'
import Paint from './views/Paint.vue'
import Drawing from './views/phases/Drawing.vue'
import Lobby from './views/phases/Lobby.vue'
import Results from './views/phases/Results.vue'
import Voting from './views/phases/Voting.vue'
import NameGate from './views/rooms/NameGate.vue'
import SessionClosed from './views/rooms/SessionClosed.vue'
// Hidden debug route (/taglines), not linked anywhere.
import Taglines from './views/Taglines.vue'

// ── Routing ──────────────────────────────────────────────────────────────────

const roomCode = new URLSearchParams(location.search).get('room')
const path = location.pathname.replace(/\/+$/, '')
const isPaintRoute = path.endsWith('/paint')
// Hidden debug page — read all taglines in bulk.
const isTaglinesRoute = path.endsWith('/taglines')
const route = isTaglinesRoute ? 'taglines' : isPaintRoute ? 'paint' : roomCode ? 'room' : 'entry'

// Connect only on the room route; useRoom leaves its state inert off it.
const {
  state,
  gallery,
  results,
  voteState,
  drawState,
  targetGrid,
  connectionStatus,
  sessionClosed,
  roundCancelled,
  showNameGate,
  spectating,
  submitName,
} = useRoom(route === 'room' ? roomCode : null)
</script>

<template>
  <Entry v-if="route === 'entry'" />
  <Paint v-else-if="route === 'paint'" />
  <Taglines v-else-if="route === 'taglines'" />

  <template v-else-if="route === 'room'">
    <!-- Session closed by a GM or timeout. -->
    <SessionClosed v-if="sessionClosed" />

    <!-- Name gate: shown before connecting when the player has no stored name -->
    <NameGate v-else-if="showNameGate" @submit="submitName" />

    <div v-else-if="!state" class="page">
      <p>{{ connectionStatus === "reconnecting" ? "Reconnecting…" : `Connecting to ${roomCode}…` }}</p>
    </div>

    <template v-else>
      <!-- Connection banner: a drop shows here rather than freezing silently.
           partysocket auto-reconnects; self-clearing, so no dismiss control. -->
      <div v-if="connectionStatus === 'reconnecting'" class="conn-banner" role="status">
        Reconnecting…
      </div>

      <!-- Keyed by phase so the boundary remounts when the room moves on, clearing
           a captured error. The banner above sits outside it: connection state is
           what a player wants to see while a view is broken. -->
      <PhaseBoundary :key="state.phase">
        <Lobby
          v-if="state.phase === 'LOBBY'"
          :state="state"
          :target-grid="targetGrid"
          :round-cancelled="roundCancelled"
          @dismiss-cancelled="roundCancelled = false"
        />
        <Drawing
          v-else-if="state.phase === 'DRAWING' && state.config && targetGrid"
          :state="state"
          :target-grid="targetGrid"
          :initial-grid="drawState?.grid ?? null"
          :spectating="spectating"
        />
        <Voting
          v-else-if="state.phase === 'VOTING'"
          :gallery="gallery"
          :gm-client-id="state.gmClientId"
          :voted-count="state.votedCount"
          :total-voters="state.totalVoters"
          :vote-state="voteState"
          :deadline="state.deadline"
          :spectating="spectating"
        />
        <Results
          v-else-if="state.phase === 'RESULTS'"
          :results="results"
          :gm-client-id="state.gmClientId"
          :players="state.players"
          :target-grid="targetGrid"
        />
      </PhaseBoundary>
    </template>
  </template>

  <!-- The app's only dialog instance (lib/dialog.ts), app-global so `askConfirm`/
       `askAlert` work everywhere. Keyed for a fresh <dialog>; outside the phase chain. -->
  <AlertDialog
    v-if="currentDialog"
    :key="currentDialog.id"
    :message="currentDialog.message"
    :mode="currentDialog.mode"
    @confirm="settleDialog(true)"
    @cancel="settleDialog(false)"
  />
</template>
