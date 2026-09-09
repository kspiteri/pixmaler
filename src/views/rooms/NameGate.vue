<script setup lang="ts">
// The name gate — shown on the room route until the player has a stored name, so nothing
// connects before a human acts: bots that merely load a room URL never open a socket, so
// they never become ghost players.
//
// Only the chosen name leaves here; storing it and opening the socket stay in `App.vue`.
// The random word-pair is offered as the placeholder rather than pre-filled, so an empty
// submit accepts it and typing replaces it.

import { ref } from 'vue'
import NameField from '../../components/NameField.vue'
import { wordPair } from '../../lib'

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
      <NameField v-model="nameInput" label="Your name" autofocus />
      <button class="btn btn--primary" type="submit">
        {{ nameInput.trim() ? "Join" : `Join as ${randomName}` }}
      </button>
    </form>
  </div>
</template>
