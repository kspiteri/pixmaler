<script setup lang="ts">
// Gallery section: the app-global modal queue (lib/dialog.ts, mounted in App.vue). Answering
// resolves the awaited promise; the last answer is shown.

import { ref } from 'vue'
import Button from '@/components/elements/Button.vue'
import { askAlert, askConfirm } from '@/lib'

const lastAnswer = ref<string | null>(null)

async function demoAlert() {
  await askAlert('Saved. An alert takes one action to dismiss.')
  lastAnswer.value = 'alert dismissed'
}
async function demoConfirm() {
  lastAnswer.value = (await askConfirm('End voting now? This closes the round.')) ? 'confirmed' : 'cancelled'
}
</script>

<template>
  <section class="demo__section">
    <p class="demo__note">
      The app-global modal (lib/dialog.ts). Answering resolves the awaited promise.
    </p>
    <div class="demo__row">
      <Button variant="secondary" @click="demoAlert">
        askAlert
      </Button>
      <Button variant="secondary" @click="demoConfirm">
        askConfirm
      </Button>
      <span class="demo__note">last: {{ lastAnswer ?? '—' }}</span>
    </div>
  </section>
</template>
