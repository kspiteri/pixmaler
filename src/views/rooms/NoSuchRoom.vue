<script setup lang="ts">
// Terminal screen for a joiner whose room does not exist and who did not ask to create it.
// Prevents users with old urls from opening up rooms unnecessarily.

import RoomInterstitial from '@/components/layout/RoomInterstitial.vue'
import { appHref, wordPair } from '@/lib'

const baseUrl = appHref()

// The one route that opens a room: a fresh, well-formed code down the create path.
function createOwn() {
  location.href = `${location.pathname}?room=${wordPair()}&create=1`
}
</script>

<template>
  <RoomInterstitial eyebrow="no such room">
    <p class="room-screen__note">
      this room doesn't exist, want to create one of your own?
    </p>
    <button class="btn btn--primary" type="button" @click="createOwn">
      Create a room
    </button>
    <a class="btn btn--ghost" type="button" :href="baseUrl">
      Back to homepage
    </a>
  </RoomInterstitial>
</template>
