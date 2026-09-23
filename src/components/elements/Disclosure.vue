<script setup lang="ts">
// A labelled disclosure: a subtle Button that reveals slotted content, owning its open state and
// the aria-expanded/controls wiring. One mechanism for every tap-to-reveal toggle (the keyboard-
// shortcuts help, the pixelation-style help). Fall-through attrs (e.g. `@pointerdown.stop`) land on
// the trigger; `#icon` is an optional leading glyph, the default slot is the revealed body, which
// styles itself at each site.

import { ChevronDown, ChevronUp } from '@lucide/vue'
import { ref, useId } from 'vue'
import Button from './Button.vue'

defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{
  label: string
  // Accessible name for the trigger when the visible label needs elaborating; defaults to `label`.
  ariaLabel?: string
  // Full-width trigger, for a docked toggle that should fill its row.
  block?: boolean
}>(), { block: false })

const open = ref(false)
const bodyId = useId()
</script>

<template>
  <div class="disclosure">
    <Button
      v-bind="$attrs"
      variant="subtle"
      size="x-small"
      :block="block"
      class="disclosure__trigger"
      :aria-label="ariaLabel ?? label"
      :aria-expanded="open"
      :aria-controls="bodyId"
      @click="open = !open"
    >
      <template v-if="$slots.icon" #icon>
        <slot name="icon" />
      </template>
      {{ label }}
      <template #trailing>
        <ChevronUp v-if="open" :size="14" />
        <ChevronDown v-else :size="14" />
      </template>
    </Button>
    <div v-if="open" :id="bodyId" class="disclosure__body">
      <slot />
    </div>
  </div>
</template>
