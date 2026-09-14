<script setup lang="ts">
// Terminal screen for a joiner the server refused because the room is at MAX_PLAYERS.
// Reached only from App.vue's `room-full` handler, checked before the other room branches.

import RoomInterstitial from '@/components/layout/RoomInterstitial.vue'
import { appHref, MAX_PLAYERS } from '@/lib'

const baseUrl = appHref()
</script>

<template>
  <RoomInterstitial eyebrow="room full">
    <p class="room-screen__note">
      all {{ MAX_PLAYERS }} easels are taken. try another room, or start your own.
    </p>
    <a class="btn btn--primary" :href="baseUrl">
      Back to homepage
    </a>
  </RoomInterstitial>
</template>
