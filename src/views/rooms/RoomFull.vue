<script setup lang="ts">
// Terminal screen for a joiner the server refused because the room is at MAX_PLAYERS.
// Reached only from App.vue's `room-full` handler, checked before the other room branches.
// The room code comes off the URL, as `SessionClosed.vue` reads it.

import Logo from '@/components/elements/Logo.vue'
import { appHref, MAX_PLAYERS } from '@/lib'

const roomCode = new URLSearchParams(location.search).get('room') ?? ''
const baseUrl = appHref()
</script>

<template>
  <div class="page page--narrow room-full">
    <Logo />
    <p class="label label--eyebrow">
      room full
    </p>
    <p class="room-full__room">
      {{ roomCode }}
    </p>
    <p class="room-full__note">
      all {{ MAX_PLAYERS }} easels are taken. try another room, or start your own.
    </p>
    <a class="btn btn--primary" :href="baseUrl">
      Back to homepage
    </a>
  </div>
</template>
