<script setup lang="ts">
// Terminal screen for a joiner whose room does not exist and who did not ask to create it.
// Prevents users with old urls from opening up rooms unnecessarily.

import { Plus } from '@lucide/vue'
import Button from '@/components/elements/Button.vue'
import RoomInterstitial from '@/components/layout/RoomInterstitial.vue'
import { appHref, roomHref, wordPair } from '@/lib'

const baseUrl = appHref()

// The one route that opens a room: a fresh, well-formed code down the create path.
function createOwn() {
  location.href = roomHref(wordPair(), { create: true })
}
</script>

<template>
  <RoomInterstitial eyebrow="no such room">
    <p class="room-screen__note">
      this room doesn't exist, want to create one of your own?
    </p>
    <Button variant="primary" @click="createOwn">
      <template #icon>
        <Plus :size="18" aria-hidden="true" />
      </template>
      Create a room
    </Button>
    <Button variant="secondary" :href="baseUrl">
      Back to homepage
    </Button>
  </RoomInterstitial>
</template>
