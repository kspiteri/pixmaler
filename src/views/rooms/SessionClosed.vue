<script setup lang="ts">
// Terminal screen for a room when the server has been wiped, either: by being idle,
// or by the GM's own "End session".
//
// The copy names no cause on purpose: `wipeState` is one funnel for both events and the
// message carries no reason, so anything cause-specific here would be wrong half the time.

import { RotateCcw } from '@lucide/vue'
import Button from '@/components/elements/Button.vue'
import RoomInterstitial from '@/components/layout/RoomInterstitial.vue'
import { appHref, roomHref } from '@/lib'

const baseUrl = appHref()

// Reopening a wiped room is now an explicit *create* (#66): a plain reload would land on the
// 404 screen, since the room no longer exists. The creator becomes GM, as before. `code`
// comes from the layout's slot, which reads it off the URL.
function reopen(code: string) {
  location.href = roomHref(code, { create: true })
}
</script>

<template>
  <RoomInterstitial v-slot="{ code }" eyebrow="room closed">
    <p class="room-screen__note">
      the session has been closed down
    </p>
    <Button variant="primary" @click="reopen(code)">
      <template #icon>
        <RotateCcw :size="18" aria-hidden="true" />
      </template>
      Reopen (first player will be GM)
    </Button>
    <Button variant="secondary" :href="baseUrl">
      Back to homepage
    </Button>
  </RoomInterstitial>
</template>
