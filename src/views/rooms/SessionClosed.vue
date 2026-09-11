<script setup lang="ts">
// Terminal screen for a room the server has wiped — by the idle alarm, or by the GM's own
// "End session". Reached only from App.vue's `session-closed` handler, which checks it
// before every other room branch. The room code comes off the URL as `Lobby.vue` reads it.
//
// The copy names no cause on purpose: `wipeState` is one funnel for both events and the
// message carries no reason, so anything cause-specific here would be wrong half the time.

import Logo from '@/components/elements/Logo.vue'
import { appHref } from '@/lib'

const roomCode = new URLSearchParams(location.search).get('room') ?? ''
const baseUrl = appHref()

// A function rather than an inline handler, for the same reason `PhaseBoundary.vue` does it:
// `location.reload` passed by reference loses its receiver.
function reloadPage() {
  window.location.reload()
}
</script>

<template>
  <div class="page page--narrow session-closed">
    <Logo />
    <p class="label label--eyebrow">
      gallery closed
    </p>
    <p class="session-closed__room">
      {{ roomCode }}
    </p>
    <p class="session-closed__note">
      the exhibition came down and the room code is free again.
    </p>
    <button class="btn btn--primary" type="button" @click="reloadPage">
      Reopen (first player will be GM)
    </button>
    <a class="btn btn--ghost" type="button" :href="baseUrl">
      Back to homepage
    </a>
  </div>
</template>
