<script setup lang="ts">
// One of Entry's fork choices: a large secondary button with a title and a quiet line under it.
// `busy` swaps the leading icon and text for a tick while the page navigates away.

import { CircleCheck } from '@lucide/vue'
import { useTemplateRef } from 'vue'
import Button from '@/components/elements/Button.vue'

defineProps<{
  title: string
  sub: string
  busy?: boolean
}>()

const button = useTemplateRef<InstanceType<typeof Button>>('button')
defineExpose({ focus: () => button.value?.focus() })
</script>

<template>
  <Button ref="button" variant="secondary" size="large" block class="entry__door">
    <template v-if="!busy && $slots.icon" #icon>
      <slot name="icon" />
    </template>
    <span class="entry__morph" :class="{ 'entry__morph--active': busy }">
      <span class="entry__morph-text entry__door-text">
        <span>{{ title }}</span>
        <span class="entry__door-sub">{{ sub }}</span>
      </span>
      <CircleCheck class="entry__morph-icon" :size="22" aria-hidden="true" />
    </span>
    <template v-if="$slots.trailing" #trailing>
      <slot name="trailing" />
    </template>
  </Button>
</template>
