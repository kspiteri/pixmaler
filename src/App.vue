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

function getOrCreateName(): string {
  let name = localStorage.getItem('pixmaler:name')?.trim()
  if (!name) {
    // No name chosen yet (e.g. arrived via a shared room link) — assign a
    // friendly random word-pair and persist it so it sticks across reconnects.
    name = wordPair()
    localStorage.setItem('pixmaler:name', name)
  }
  return name
}

// ── Reactive room state ──────────────────────────────────────────────────────

// `shallowRef` because we never mutate inner fields — we always replace the
// whole object on a new server message. Saves Vue from deep-watching big
// arrays like the player list / target grid.
type StateMsg = Extract<ServerMsg, { type: 'state' }>
type GalleryMsg = Extract<ServerMsg, { type: 'gallery' }>
type ResultsMsg = Extract<ServerMsg, { type: 'results' }>

const state = shallowRef<StateMsg | null>(null)
const gallery = shallowRef<GalleryMsg | null>(null)
const results = shallowRef<ResultsMsg | null>(null)
const connectionStatus = ref<'connecting' | 'connected' | 'closed'>('connecting')

// ── Connect (only when on the room route) ────────────────────────────────────

if (route === 'room' && roomCode) {
  const clientId = getOrCreateClientId()
  const name = getOrCreateName()

  // `party` matches the kebab-cased Durable Object binding name
  // (PixmalerServer → "pixmaler-server"); routePartykitRequest routes on it.
  const socket = new PartySocket({ host: PARTYKIT_HOST, party: 'pixmaler-server', room: roomCode })

  // `socket` and `clientId` never change for the lifetime of the page, so
  // descendants inject them rather than receiving them through every prop list.
  provide(socketKey, socket)
  provide(clientIdKey, clientId)

  socket.addEventListener('open', () => {
    connectionStatus.value = 'connected'
    const msg: ClientMsg = { type: 'join', clientId, name }
    socket.send(JSON.stringify(msg))
  })

  socket.addEventListener('close', () => {
    connectionStatus.value = 'closed'
    console.warn('[pixmaler] socket closed')
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

  onMounted(() => {
    document.title = `Pixmaler — ${roomCode}`
  })
}
</script>

<template>
  <Entry v-if="route === 'entry'" />
  <Paint v-else-if="route === 'paint'" />

  <template v-else-if="route === 'room'">
    <div v-if="!state" class="page">
      <p>{{ connectionStatus === "closed" ? "Disconnected." : `Connecting to ${roomCode}…` }}</p>
    </div>

    <Lobby v-else-if="state.phase === 'LOBBY'" :state="state" />
    <Drawing v-else-if="state.phase === 'DRAWING' && state.config" :state="state" />
    <Voting
      v-else-if="state.phase === 'VOTING'"
      :gallery="gallery"
      :gm-client-id="state.gmClientId"
      :voted-count="state.votedCount"
      :total-voters="state.totalVoters"
    />
    <Results v-else-if="state.phase === 'RESULTS'" :results="results" :gm-client-id="state.gmClientId" />
  </template>
</template>
