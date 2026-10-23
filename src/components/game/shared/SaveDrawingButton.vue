<script setup lang="ts">
// Saves a grid as a PNG: renders it, hands it to the share sheet or a download (lib/export), then
// swaps the icon to a tick for 2 s. Wraps Button, so size, `icon` and `collapse` fall through.
// A default slot becomes the visible label; without one it's icon-only and `label` names it.

import type { ExportGrid } from '@/lib'
import { Check, Download } from '@lucide/vue'
import { onBeforeUnmount, ref } from 'vue'
import Button from '@/components/elements/Button.vue'
import { announce, deliverFile, gridToPng } from '@/lib'

const props = defineProps<{
  drawing: ExportGrid
  filename: string
  // Accessible name and tooltip.
  label: string
  // Spoken once the file is handed over; never claims where it landed.
  announcement: string
}>()

const saved = ref(false)
const busy = ref(false)
let savedTimer: ReturnType<typeof setTimeout> | null = null

async function save() {
  if (busy.value)
    return
  busy.value = true
  try {
    const blob = await gridToPng(props.drawing)
    if (await deliverFile(blob, props.filename, 'save') === 'cancelled')
      return
    saved.value = true
    announce(props.announcement)
    if (savedTimer)
      clearTimeout(savedTimer)
    savedTimer = setTimeout(() => { saved.value = false }, 2000)
  }
  catch {
    // Encoding failed; nothing was handed over, so no tick.
  }
  finally {
    busy.value = false
  }
}

onBeforeUnmount(() => {
  if (savedTimer)
    clearTimeout(savedTimer)
})
</script>

<template>
  <Button
    :title="saved ? 'Saved' : label"
    :aria-label="saved ? `${label}: saved` : label"
    :aria-busy="busy || undefined"
    @click="save"
  >
    <template #icon>
      <component :is="saved ? Check : Download" :size="16" aria-hidden="true" />
    </template>
    <template v-if="$slots.default" #default>
      <slot />
    </template>
  </Button>
</template>
