<script setup lang="ts">
// Router (entry / paint / room). The room connection and the server-message dispatch
// live in `lib/useRoom`; this file resolves the route and feeds the returned room state
// into the phase views. Descendants get `socket` and `clientId` by provide (from
// useRoom); the reactive room state comes down as props.

import AlertDialog from './components/AlertDialog.vue'
import PhaseBoundary from './components/PhaseBoundary.vue'
import { currentDialog, settleDialog } from './lib/dialog'
import { useRoom } from './lib/useRoom'
import Entry from './views/Entry.vue'
import Paint from './views/Paint.vue'
import Drawing from './views/phases/Drawing.vue'
import Lobby from './views/phases/Lobby.vue'
import Results from './views/phases/Results.vue'
import Voting from './views/phases/Voting.vue'
import NameGate from './views/rooms/NameGate.vue'
import SessionClosed from './views/rooms/SessionClosed.vue'
// Hidden debug route (/taglines) — not linked anywhere; for reading the full
// tagline set in bulk.
import Taglines from './views/Taglines.vue'

// ── Routing ──────────────────────────────────────────────────────────────────

const roomCode = new URLSearchParams(location.search).get('room')
const path = location.pathname.replace(/\/+$/, '')
const isPaintRoute = path.endsWith('/paint')
// Hidden debug page — read all taglines in bulk. Not linked from anywhere.
const isTaglinesRoute = path.endsWith('/taglines')
const route = isTaglinesRoute ? 'taglines' : isPaintRoute ? 'paint' : roomCode ? 'room' : 'entry'

// Connect only on the room route; useRoom leaves its state inert off it (a `?room=`
// on /paint or /taglines resolves to those routes first, so it passes null here).
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
    <!-- Session closed: when a game-session has been closed by a GM or timeout -->
    <SessionClosed v-if="sessionClosed" />

    <!-- Name gate: shown before connecting when the player has no stored name -->
    <NameGate v-else-if="showNameGate" @submit="submitName" />

    <div v-else-if="!state" class="page">
      <p>{{ connectionStatus === "reconnecting" ? "Reconnecting…" : `Connecting to ${roomCode}…` }}</p>
    </div>

    <template v-else>
      <!-- Connection banner: once we've loaded state, a drop shows here rather
           than freezing silently. partysocket auto-reconnects (reclaims the slot
           by clientId), so this is usually a brief blip. Condition-bound and
           self-clearing, so it carries no dismiss control. -->
      <div v-if="connectionStatus === 'reconnecting'" class="conn-banner" role="status">
        Reconnecting…
      </div>

      <!-- Keyed by phase so the boundary remounts when the server moves the room on,
           which clears a captured error. Without that reset a crash in DRAWING would
           still be showing its fallback through VOTING and RESULTS - the same
           forgotten-reset shape as the per-round flags on the server. The banner above
           sits outside it deliberately: connection state is exactly what a player
           wants to see while a view is broken. -->
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

    <!-- The app's only dialog instance (lib/dialog.ts). Outside the phase chain
         because a rejection can arrive before state loads and must survive a
         phase change. Keyed so each request mounts a fresh <dialog>. -->
    <AlertDialog
      v-if="currentDialog"
      :key="currentDialog.id"
      :message="currentDialog.message"
      :mode="currentDialog.mode"
      @confirm="settleDialog(true)"
      @cancel="settleDialog(false)"
    />
  </template>
</template>
