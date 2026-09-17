<script setup lang="ts">
// Router (entry / paint / room). Resolves the route and feeds the room state from
// `lib/useRoom` into the phase views; descendants get `socket`/`clientId` by provide.

import AlertDialog from '@/components/elements/AlertDialog.vue'
import AlertNotice from '@/components/elements/AlertNotice.vue'
import PhaseBoundary from '@/components/layout/PhaseBoundary.vue'
import { assertiveMessage, currentDialog, politeMessage, settleDialog, useRoom } from '@/lib'
import Components from '@/views/Components.vue'
import Entry from '@/views/Entry.vue'
import Paint from '@/views/Paint.vue'
import Drawing from '@/views/phases/Drawing.vue'
import Lobby from '@/views/phases/Lobby.vue'
import Results from '@/views/phases/Results.vue'
import Voting from '@/views/phases/Voting.vue'
import DuplicateTab from '@/views/rooms/DuplicateTab.vue'
import NameGate from '@/views/rooms/NameGate.vue'
import NoSuchRoom from '@/views/rooms/NoSuchRoom.vue'
import RoomFull from '@/views/rooms/RoomFull.vue'
import SessionClosed from '@/views/rooms/SessionClosed.vue'
// Hidden debug route (/taglines), not linked anywhere.
import Taglines from '@/views/Taglines.vue'

// ── Routing ──────────────────────────────────────────────────────────────────

const params = new URLSearchParams(location.search)
const roomCode = params.get('room')
// Create intent rides in on the URL so it survives Entry's full-page navigation, then is
// stripped at once (#66): a shared or reloaded create-URL degrades to a plain join (a reload
// is a reconnect anyway, always allowed). Rewrite through URLSearchParams so the room code
// and any other params are preserved and correctly escaped.
const createIntent = params.get('create') === '1'
if (roomCode && createIntent) {
  params.delete('create')
  history.replaceState(null, '', `${location.pathname}?${params}`)
}
const path = location.pathname.replace(/\/+$/, '')
const isPaintRoute = path.endsWith('/paint')
// Hidden debug page — read all taglines in bulk.
const isTaglinesRoute = path.endsWith('/taglines')
// Dev-only component gallery; gated so `/components` never resolves in a production build.
const isComponentsRoute = import.meta.env.DEV && path.endsWith('/components')
const route = isComponentsRoute ? 'components' : isTaglinesRoute ? 'taglines' : isPaintRoute ? 'paint' : roomCode ? 'room' : 'entry'

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
  roomFull,
  noSuchRoom,
  duplicateTab,
  roundCancelled,
  showNameGate,
  spectating,
  submitName,
} = useRoom(route === 'room' ? roomCode : null, createIntent)
</script>

<template>
  <Entry v-if="route === 'entry'" />
  <Paint v-else-if="route === 'paint'" />
  <Taglines v-else-if="route === 'taglines'" />
  <Components v-else-if="route === 'components'" />

  <template v-else-if="route === 'room'">
    <!-- Session closed by a GM or timeout. -->
    <SessionClosed v-if="sessionClosed" />

    <!-- Refused: the room is at MAX_PLAYERS. Terminal, like session-closed. -->
    <RoomFull v-else-if="roomFull" />

    <!-- Refused: the room does not exist and we did not ask to create it (#66). -->
    <NoSuchRoom v-else-if="noSuchRoom" />

    <!-- Same room already open in another tab of this browser; this one takes over on close. -->
    <DuplicateTab v-else-if="duplicateTab" />

    <!-- Name gate: shown before connecting when the player has no stored name -->
    <NameGate v-else-if="showNameGate" @submit="submitName" />

    <div v-else-if="!state" class="page">
      <p>{{ connectionStatus === "reconnecting" ? "Reconnecting…" : `Connecting to ${roomCode}…` }}</p>
    </div>

    <template v-else>
      <!-- Connection state: a drop surfaces here rather than freezing silently. A
           non-dismissable notice (you can't change a dropped connection) shown and hidden
           purely from connectionStatus; partysocket auto-reconnects. -->
      <AlertNotice
        v-if="connectionStatus === 'reconnecting'"
        variant="info"
        class="conn-banner"
        :dismissable="false"
      >
        Reconnecting…
      </AlertNotice>

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

  <!-- One-off screen-reader announcements with no visible home (lib/announce.ts): a copy
       confirmation, say. Always present so the live region exists before its text changes. -->
  <span class="sr-only" aria-live="polite" aria-atomic="true">{{ politeMessage }}</span>
  <span class="sr-only" aria-live="assertive" aria-atomic="true">{{ assertiveMessage }}</span>

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
