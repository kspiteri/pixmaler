<script setup lang="ts">
// Terminal screen for a room the server has wiped — by the idle alarm, or by the GM's
// own "End session". Reached only from App.vue's `session-closed` handler, which checks
// it before every other room branch: they all describe a room that no longer exists.
//
// Its own file so this screen can be worked on without touching the dispatcher (#18), and
// in `rooms/` beside `NameGate.vue`: both are room-route screens with no game behind them.
// Nothing is passed in: the room code comes off the URL exactly as `Lobby.vue` reads it,
// and the way out is the app root, as in `Paint.vue` / `Taglines.vue`.
//
// The copy names no cause on purpose. `wipeState` is one funnel for the two events above
// and `session-closed` carries no reason, so anything cause-specific here is wrong half
// the time (#18): this used to say "after sitting idle" to a GM who had just chosen to
// end the room. Telling them apart needs a flag on the message, which is a protocol
// change and a Worker deploy; an ending that reads as an ending does not.

import Logo from '../../components/Logo.vue'

const roomCode = new URLSearchParams(location.search).get('room') ?? ''
const baseUrl = `${import.meta.env.BASE_URL.replace(/\/+$/, '')}/`

// A function rather than an inline handler, for the same reason `PhaseBoundary.vue`
// does it: `location.reload` passed by reference loses its receiver.
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
