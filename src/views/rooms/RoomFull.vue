<script setup lang="ts">
// Terminal screen for a joiner the server refused because the room is at MAX_PLAYERS.
// Reached only from App.vue's `room-full` handler, checked before the other room branches.

import { House } from '@lucide/vue'
import Button from '@/components/elements/Button.vue'
import RoomInterstitial from '@/components/layout/RoomInterstitial.vue'
import { appHref, MAX_PLAYERS } from '@/lib'

const baseUrl = appHref()
</script>

<template>
  <RoomInterstitial eyebrow="room full">
    <p class="room-screen__note">
      all {{ MAX_PLAYERS }} easels are taken. try another room, or start your own.
    </p>
    <Button variant="primary" :href="baseUrl">
      <template #icon>
        <House :size="18" aria-hidden="true" />
      </template>
      Back to homepage
    </Button>
  </RoomInterstitial>
</template>
