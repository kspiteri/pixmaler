<script setup lang="ts">
// Shown when this room is already open in another tab of the same browser. Tabs share the
// localStorage clientId, so a second one would drive a second canvas of the same player — a
// per-room Web Lock in `useRoom` keeps only one tab live. Recoverable, not terminal: this tab
// takes over on its own the moment the other closes (the lock releases), so there's no button
// to press beyond an escape home.

import RoomInterstitial from '@/components/layout/RoomInterstitial.vue'
import { appHref } from '@/lib'

const baseUrl = appHref()
</script>

<template>
  <RoomInterstitial eyebrow="already open">
    <p class="room-screen__note">
      this identical room is open in another tab on the same browser.<br>close that one and this tab takes over.
    </p>
    <a class="btn btn--primary" :href="baseUrl">
      Back to homepage
    </a>
  </RoomInterstitial>
</template>
