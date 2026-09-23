<script setup lang="ts">
// Gallery section: AlertNotice in all four roles. Dismissable notices self-clear via v-if,
// so a key bump on the wrapper brings them back for repeated testing.

import { CircleAlert, Info, TriangleAlert } from '@lucide/vue'
import { ref } from 'vue'
import AlertNotice from '@/components/elements/AlertNotice.vue'
import Button from '@/components/elements/Button.vue'

const noticeKey = ref(0)
</script>

<template>
  <section :key="noticeKey" class="demo__section">
    <div class="demo__stack">
      <AlertNotice variant="info">
        <template #icon>
          <Info :size="15" aria-hidden="true" />
        </template>
        Info — waits its turn (role=status).
      </AlertNotice>
      <AlertNotice variant="warn">
        <template #icon>
          <TriangleAlert :size="15" aria-hidden="true" />
        </template>
        Warn — a nudge, dismissable.
      </AlertNotice>
      <AlertNotice variant="error">
        <template #icon>
          <CircleAlert :size="15" aria-hidden="true" />
        </template>
        Error — interrupts (role=alert).
      </AlertNotice>
      <AlertNotice variant="info" :dismissable="false">
        <template #icon>
          <Info :size="15" aria-hidden="true" />
        </template>
        Non-dismissable — reports host state, no dismiss control.
      </AlertNotice>
    </div>
    <p class="demo__note">
      Dismissable notices self-clear on click.
    </p>
    <Button variant="secondary" size="small" @click="noticeKey++">
      Reset notices
    </Button>
  </section>
</template>
