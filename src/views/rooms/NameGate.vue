<script setup lang="ts">
// Shown only when the room exists, but the joiner has no stored name/session. Quick and easy bot prevention method.
// The word-pair is the placeholder, not pre-filled, so an empty submission accepts it, and typing replaces it.

import { ref } from 'vue'
import NameField from '@/components/elements/NameField.vue'
import RoomInterstitial from '@/components/layout/RoomInterstitial.vue'
import { wordPair } from '@/lib'

const emit = defineEmits<{
  // The name the player settled on, never empty — `App.vue` stores it and connects.
  submit: [name: string]
}>()

const nameInput = ref('')
const randomName = wordPair()

function submitName() {
  emit('submit', nameInput.value.trim() || randomName)
}
</script>

<template>
  <RoomInterstitial eyebrow="joining room">
    <form class="room-screen__form" @submit.prevent="submitName">
      <NameField v-model="nameInput" label="Your name" autofocus />
      <button class="btn btn--primary" type="submit">
        {{ nameInput.trim() ? "Join" : `Join as ${randomName}` }}
      </button>
    </form>
  </RoomInterstitial>
</template>
