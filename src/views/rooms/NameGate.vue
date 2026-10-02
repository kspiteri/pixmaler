<script setup lang="ts">
// Shown on the room route when no name is stored, whether joining or creating the room.
// The word-pair is the placeholder, not pre-filled, so an empty submission accepts it, and typing replaces it.

import { LogIn } from '@lucide/vue'
import { ref } from 'vue'
import Button from '@/components/elements/Button.vue'
import NameField from '@/components/elements/NameField.vue'
import RoomInterstitial from '@/components/layout/RoomInterstitial.vue'
import { sanitiseName, wordPair } from '@/lib'

defineProps<{
  creating?: boolean
}>()

const emit = defineEmits<{
  // The name the player settled on, never empty — `App.vue` stores it and connects.
  submit: [name: string]
}>()

const nameInput = ref('')
const randomName = wordPair()

function submitName() {
  emit('submit', sanitiseName(nameInput.value) || randomName)
}
</script>

<template>
  <RoomInterstitial :eyebrow="creating ? 'new room' : 'joining room'">
    <form class="room-screen__form" @submit.prevent="submitName">
      <NameField v-model="nameInput" label="Your name" autofocus />
      <Button variant="primary" type="submit">
        <template #icon>
          <LogIn :size="18" aria-hidden="true" />
        </template>
        <template v-if="creating">
          {{ nameInput.trim() ? "Create room" : `Create as ${randomName}` }}
        </template>
        <template v-else>
          {{ nameInput.trim() ? "Join" : `Join as ${randomName}` }}
        </template>
      </Button>
    </form>
  </RoomInterstitial>
</template>
