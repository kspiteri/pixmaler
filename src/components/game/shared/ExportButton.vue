<script setup lang="ts">
// Exports a picture: renders it, hands it to the share sheet or a download (lib/export), then
// swaps the icon to a tick for 2 s. `save` is the plain drawing, `share` the share card.
// Wraps Button, so size, `icon` and `collapse` fall through; a default slot is the visible label.

import type { DeliverIntent } from '@/lib'
import { Check, Download, Share2 } from '@lucide/vue'
import { onBeforeUnmount, ref } from 'vue'
import Button from '@/components/elements/Button.vue'
import { announce, deliverFile } from '@/lib'

const props = defineProps<{
  intent: DeliverIntent
  render: () => Promise<Blob>
  filename: string
  // Accessible name and tooltip.
  label: string
  // What was exported, for the announcement: "Saved <subject>" / "Shared <subject>".
  subject: string
}>()

// The word for what just happened, shown while the tick is up; null at rest.
const done = ref<'Saved' | 'Shared' | null>(null)
const busy = ref(false)
let doneTimer: ReturnType<typeof setTimeout> | null = null
// A share sheet can outlive the screen (Play again while it's open); no tick or announcement then.
let mounted = true

async function run() {
  if (busy.value)
    return
  busy.value = true
  try {
    const outcome = await deliverFile(await props.render(), props.filename, props.intent)
    if (outcome === 'cancelled' || !mounted)
      return
    done.value = outcome === 'shared' ? 'Shared' : 'Saved'
    // Never claims where the file landed: a download can't report that.
    announce(`${done.value} ${props.subject}`)
    if (doneTimer)
      clearTimeout(doneTimer)
    doneTimer = setTimeout(() => { done.value = null }, 2000)
  }
  catch {
    // Rendering failed; nothing was handed over, so no tick.
  }
  finally {
    busy.value = false
  }
}

onBeforeUnmount(() => {
  mounted = false
  if (doneTimer)
    clearTimeout(doneTimer)
})
</script>

<template>
  <Button
    :title="done ?? label"
    :aria-label="done ? `${label}: ${done.toLowerCase()}` : label"
    :aria-busy="busy || undefined"
    @click="run"
  >
    <template #icon>
      <component :is="done ? Check : intent === 'share' ? Share2 : Download" :size="16" aria-hidden="true" />
    </template>
    <template v-if="$slots.default" #default>
      <slot />
    </template>
  </Button>
</template>
