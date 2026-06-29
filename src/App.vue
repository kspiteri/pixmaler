<script setup lang="ts">
// Router (entry / paint / room) + WebSocket dispatcher.
// Provides `socket` and `clientId` to descendants; passes mutable `state`,
// `gallery`, and `results` down as props.

import type { ClientMsg, ServerMsg } from './lib/types'
import PartySocket from 'partysocket'
import { onMounted, provide, ref, shallowRef } from 'vue'
import { clientIdKey, socketKey } from './lib/keys'
import { wordPair } from './lib/words'

import Entry from './views/Entry.vue'
import Paint from './views/Paint.vue'
import Drawing from './views/phases/Drawing.vue'
import Lobby from './views/phases/Lobby.vue'
import Results from './views/phases/Results.vue'
import Voting from './views/phases/Voting.vue'

const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST ?? '127.0.0.1:1999'

// ── Routing ──────────────────────────────────────────────────────────────────

const roomCode = new URLSearchParams(location.search).get('room')
const isPaintRoute = location.pathname.replace(/\/+$/, '').endsWith('/paint')
const route = isPaintRoute ? 'paint' : roomCode ? 'room' : 'entry'

// ── Identity ─────────────────────────────────────────────────────────────────

function getOrCreateClientId(): string {
  let id = localStorage.getItem('pixmaler:clientId')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('pixmaler:clientId', id)
  }
  return id
}

// Stored display name, or null if the player hasn't chosen one yet. Unlike the
// old getOrCreate, this does NOT mint a name — the room route shows a name gate
// when it's null, both to let first-timers choose and so bots that merely load
// the URL never connect (no human action → no socket → no ghost player).
function storedName(): string | null {
  return localStorage.getItem('pixmaler:name')?.trim() || null
}

// ── Reactive room state ──────────────────────────────────────────────────────

// `shallowRef` because we never mutate inner fields — we always replace the
// whole object on a new server message. Saves Vue from deep-watching big
// arrays like the player list / target grid.
type StateMsg = Extract<ServerMsg, { type: 'state' }>
type GalleryMsg = Extract<ServerMsg, { type: 'gallery' }>
type ResultsMsg = Extract<ServerMsg, { type: 'results' }>
type VoteStateMsg = Extract<ServerMsg, { type: 'vote-state' }>

const state = shallowRef<StateMsg | null>(null)
const gallery = shallowRef<GalleryMsg | null>(null)
const results = shallowRef<ResultsMsg | null>(null)
// This voter's own picks, echoed by the server on (re)join during VOTING so the
// vote UI rehydrates after a reconnect. Null until/unless we receive it.
const voteState = shallowRef<VoteStateMsg | null>(null)
const connectionStatus = ref<'connecting' | 'connected' | 'reconnecting'>('connecting')

// ── Connect (only when on the room route) ────────────────────────────────────

// The socket is created lazily by `connect()` (after the name gate), so it's a
// ref that starts null. Provided to descendants; non-null by the time any phase
// view mounts (those only render once server state arrives).
const socketRef = shallowRef<PartySocket | null>(null)

// Name gate: shown on the room route until the player has a stored name. The
// random word-pair is offered as a placeholder — submitting empty accepts it
// (the random names went down well in playtesting).
const showNameGate = ref(false)
const nameInput = ref('')
const randomName = wordPair()

if (route === 'room' && roomCode) {
  provide(clientIdKey, getOrCreateClientId())
  provide(socketKey, socketRef)

  const existing = storedName()
  if (existing) {
    // Returning player / refresh — skip the gate, reconnect seamlessly.
    connect(existing)
  }
  else {
    showNameGate.value = true
  }
}

function submitName() {
  const chosen = nameInput.value.trim() || randomName
  localStorage.setItem('pixmaler:name', chosen)
  showNameGate.value = false
  connect(chosen)
}

function connect(name: string) {
  const clientId = getOrCreateClientId()

  // `party` matches the kebab-cased Durable Object binding name
  // (PixmalerServer → "pixmaler-server"); routePartykitRequest routes on it.
  const socket = new PartySocket({ host: PARTYKIT_HOST, party: 'pixmaler-server', room: roomCode! })
  socketRef.value = socket

  socket.addEventListener('open', () => {
    connectionStatus.value = 'connected'
    const msg: ClientMsg = { type: 'join', clientId, name }
    socket.send(JSON.stringify(msg))
  })

  socket.addEventListener('close', () => {
    // partysocket auto-reconnects, so a close is "reconnecting", not dead — the
    // next `open` flips it back to connected (and re-sends `join`, reclaiming
    // the slot by clientId). Surface it so players see a blip rather than a
    // silently-frozen UI.
    connectionStatus.value = 'reconnecting'
    console.warn('[pixmaler] socket closed — reconnecting')
  })

  socket.addEventListener('message', (ev) => {
    let msg: ServerMsg
    try { msg = JSON.parse(ev.data as string) as ServerMsg }
    catch { console.error('[pixmaler] bad message', ev.data); return }

    switch (msg.type) {
      case 'state': state.value = msg; break
      case 'phase':
        // `phase` doesn't carry config/players — patch the cached state.
        if (state.value) {
          state.value = { ...state.value, phase: msg.phase, deadline: msg.deadline }
        }
        break
      case 'gallery': gallery.value = msg; break
      case 'vote-state': voteState.value = msg; break
      case 'results': results.value = msg; break
      case 'done-status':
        if (state.value) {
          state.value = {
            ...state.value,
            doneCount: msg.doneCount,
            totalDrawing: msg.totalDrawing,
          }
        }
        break
      case 'error':
        console.warn('[pixmaler] server error:', msg.message)
        alert(msg.message)
        break
    }
  })
}

if (route === 'room' && roomCode) {
  onMounted(() => {
    document.title = `Pixmaler — ${roomCode}`
  })
}
</script>

<template>
  <Entry v-if="route === 'entry'" />
  <Paint v-else-if="route === 'paint'" />

  <template v-else-if="route === 'room'">
    <!-- Name gate: shown before connecting when the player has no stored name.
         No socket is opened until they submit, so bots that just load the URL
         never become ghost players. Empty submit accepts the random name. -->
    <div v-if="showNameGate" class="page page--narrow namegate">
      <p class="label label--eyebrow">
        joining room
      </p>
      <p class="namegate__room">
        {{ roomCode }}
      </p>
      <form class="namegate__form" @submit.prevent="submitName">
        <label class="field">
          <span class="label">Your name</span>
          <input
            v-model="nameInput"
            class="input"
            type="text"
            maxlength="24"
            :placeholder="randomName"
            autofocus
          >
        </label>
        <button class="btn btn--primary" type="submit">
          {{ nameInput.trim() ? "Join →" : `Join as ${randomName} →` }}
        </button>
      </form>
    </div>

    <div v-else-if="!state" class="page">
      <p>{{ connectionStatus === "reconnecting" ? "Reconnecting…" : `Connecting to ${roomCode}…` }}</p>
    </div>

    <template v-else>
      <!-- Connection banner: once we've loaded state, a drop shows here rather
           than freezing silently. partysocket auto-reconnects (reclaims the slot
           by clientId), so this is usually a brief blip. Plain markup — styled in
           the design pass (05). -->
      <div v-if="connectionStatus === 'reconnecting'" class="conn-banner" role="status">
        Reconnecting…
      </div>

      <Lobby v-if="state.phase === 'LOBBY'" :state="state" />
      <Drawing v-else-if="state.phase === 'DRAWING' && state.config" :state="state" />
      <Voting
        v-else-if="state.phase === 'VOTING'"
        :gallery="gallery"
        :gm-client-id="state.gmClientId"
        :voted-count="state.votedCount"
        :total-voters="state.totalVoters"
        :vote-state="voteState"
      />
      <Results v-else-if="state.phase === 'RESULTS'" :results="results" :gm-client-id="state.gmClientId" />
    </template>
  </template>
</template>

<style scoped lang="scss">
@use './styles/tokens' as *;

.namegate {
  display: flex;
  flex-direction: column;
  gap: $gap-3;

  &__room {
    font-family: $font-display;
    font-weight: 700;
    font-size: 2rem;
    color: $accent;
    margin: 0 0 $gap-4;
    word-break: break-word;
  }

  &__form {
    display: flex;
    flex-direction: column;
    gap: $gap-4;
  }
}

// Connection status banner — fixed at the top while reconnecting. Minimal
// styling; the design pass (05) owns the final look.
.conn-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 200;
  padding: $gap-2 $gap-3;
  text-align: center;
  font-family: $font-display;
  font-weight: 600;
  font-size: 0.875rem;
  color: $accent-fg;
  background: $accent;
}
</style>
