<script setup lang="ts">
// Exports a picture: renders it, hands it to the share sheet or a download (lib/export), then
// swaps the icon to a tick for 2 s, or a warning if the export failed. `save` is the plain
// drawing, `share` the share card. Wraps Button, so `icon` and `collapse` fall through; a default
// slot is the visible label. Busy is `aria-disabled`, not `disabled`: disabling a focused button
// drops keyboard focus to <body> in every engine, and `run()` already refuses repeat presses.

import type { DeliverIntent } from '@/lib'
import { Check, Download, Share2, TriangleAlert } from '@lucide/vue'
import { computed, onBeforeUnmount, ref } from 'vue'
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
  // The share sheet's title.
  shareTitle: string
  size?: 'large' | 'default' | 'small' | 'x-small'
  disabled?: boolean
}>()

// What just happened, shown for 2 s; null at rest.
const state = ref<{ kind: 'done', word: 'Saved' | 'Shared' } | { kind: 'failed' } | null>(null)
const busy = ref(false)
let stateTimer: ReturnType<typeof setTimeout> | null = null
// A share sheet can outlive the screen (Play again while it's open); no tick or announcement then.
let mounted = true

const iconSize = computed(() => props.size === 'x-small' ? 14 : 16)
const icon = computed(() => {
  if (state.value?.kind === 'done')
    return Check
  if (state.value?.kind === 'failed')
    return TriangleAlert
  return props.intent === 'share' ? Share2 : Download
})
const ariaLabel = computed(() => {
  if (state.value?.kind === 'done')
    return `${props.label}: ${state.value.word.toLowerCase()}`
  if (state.value?.kind === 'failed')
    return `${props.label}: couldn't ${props.intent}`
  return props.label
})

function show(next: NonNullable<typeof state.value>) {
  state.value = next
  if (stateTimer)
    clearTimeout(stateTimer)
  stateTimer = setTimeout(() => { state.value = null }, 2000)
}

async function run() {
  if (busy.value)
    return
  busy.value = true
  try {
    const outcome = await deliverFile(await props.render(), props.filename, props.intent, props.shareTitle)
    if (outcome === 'cancelled' || !mounted)
      return
    const word = outcome === 'shared' ? 'Shared' : 'Saved'
    show({ kind: 'done', word })
    // Never claims where the file landed: a download can't report that.
    announce(`${word} ${props.subject}`)
  }
  catch (err) {
    console.error(err)
    if (!mounted)
      return
    show({ kind: 'failed' })
    announce(`Couldn't ${props.intent} ${props.subject}`, 'assertive')
  }
  finally {
    busy.value = false
  }
}

onBeforeUnmount(() => {
  mounted = false
  if (stateTimer)
    clearTimeout(stateTimer)
})
</script>

<template>
  <Button
    :size="size"
    :title="label"
    :aria-label="ariaLabel"
    :aria-busy="busy || undefined"
    :aria-disabled="busy || undefined"
    :disabled="disabled"
    @click="run"
  >
    <template #icon>
      <component :is="icon" :size="iconSize" aria-hidden="true" />
    </template>
    <template v-if="$slots.default" #default>
      <slot />
    </template>
  </Button>
</template>
