<script setup lang="ts">
// Terminal screen for a room when the server has been wiped, either: by being idle,
// or by the GM's own "End session".
//
// The copy names no cause on purpose: `wipeState` is one funnel for both events and the
// message carries no reason, so anything cause-specific here would be wrong half the time.

import RoomInterstitial from '@/components/layout/RoomInterstitial.vue'
import { appHref } from '@/lib'

const baseUrl = appHref()

// Reopening a wiped room is now an explicit *create* (#66): a plain reload would land on the
// 404 screen, since the room no longer exists. The creator becomes GM, as before. `code`
// comes from the layout's slot, which reads it off the URL.
function reopen(code: string) {
  location.href = `${location.pathname}?room=${code}&create=1`
}
</script>

<template>
  <RoomInterstitial v-slot="{ code }" eyebrow="room closed">
    <p class="room-screen__note">
      the session has been closed down
    </p>
    <button class="btn btn--primary" type="button" @click="reopen(code)">
      Reopen (first player will be GM)
    </button>
    <a class="btn btn--ghost" type="button" :href="baseUrl">
      Back to homepage
    </a>
  </RoomInterstitial>
</template>
