<script setup lang="ts">
// Terminal screen for a room the server has wiped: either the GM ended the session, or it sat
// idle. The server sends which; an older Worker sends none, so that case keeps neutral copy.

import type { SessionClosedReason } from '@/lib'
import { RotateCcw } from '@lucide/vue'
import Button from '@/components/elements/Button.vue'
import RoomInterstitial from '@/components/layout/RoomInterstitial.vue'
import { appHref, roomHref } from '@/lib'

defineProps<{ reason: SessionClosedReason | null }>()

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
      <template v-if="reason === 'ended'">
        the GM ended the session, so the exhibition came down
      </template>
      <template v-else-if="reason === 'idle'">
        the room sat idle, so we packed up while nobody was looking
      </template>
      <template v-else>
        the session has been closed down
      </template>
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
