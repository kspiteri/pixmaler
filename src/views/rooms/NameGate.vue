<script setup lang="ts">
// The name gate — shown on the room route until the player has a stored name, so nothing
// connects before a human acts. That's the point of it: bots that merely load a room URL
// never open a socket, so they never become ghost players.
//
// Its own file, next to `SessionClosed.vue`, because both are room-route screens where
// there is no game yet (or any more) — see the folder's siblings. Only the chosen name
// leaves here: storing it and opening the socket stay in `App.vue`, which owns identity
// and the connection. The room code comes off the URL as it does in `SessionClosed.vue`.
//
// The random word-pair is offered as the placeholder rather than pre-filled text, so an
// empty submit accepts it and typing replaces it — the random names went down well in
// playtesting, and this way taking one costs nothing.

import { ref } from 'vue'
import { wordPair } from '../../lib/words'

const emit = defineEmits<{
  // The name the player settled on, never empty — `App.vue` stores it and connects.
  submit: [name: string]
}>()

const roomCode = new URLSearchParams(location.search).get('room') ?? ''
const nameInput = ref('')
const randomName = wordPair()

function submitName() {
  emit('submit', nameInput.value.trim() || randomName)
}
</script>

<template>
  <div class="page page--narrow namegate">
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
        {{ nameInput.trim() ? "Join" : `Join as ${randomName}` }}
      </button>
    </form>
  </div>
</template>
