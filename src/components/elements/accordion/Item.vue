<script setup lang="ts">
// One accordion section: a header button (title + optional #summary shown when collapsed) that
// toggles its body. Single-open is coordinated by the parent <Accordion> via inject.

import { ChevronDown } from '@lucide/vue'
import { computed, inject, useId } from 'vue'
import { accordionKey } from './key'

const props = defineProps<{ id: string, title: string, disabled?: boolean }>()

const ctx = inject(accordionKey)
const bodyId = useId()
const headId = useId()
const open = computed(() => ctx?.openId.value === props.id)
</script>

<template>
  <div class="accordion__item" :class="{ 'is-open': open, 'is-disabled': disabled }">
    <h3 class="accordion__heading">
      <button
        :id="headId"
        type="button"
        :disabled="disabled"
        class="accordion__trigger"
        :aria-expanded="open"
        :aria-controls="bodyId"
        @click="ctx?.toggle(id)"
      >
        <span class="accordion__title">{{ title }}</span>
        <span v-if="!open" class="accordion__summary"><slot name="summary" /></span>
        <ChevronDown v-if="!disabled" class="accordion__chevron" :size="18" aria-hidden="true" />
      </button>
    </h3>
    <div v-show="open" :id="bodyId" class="accordion__body" role="region" :aria-labelledby="headId">
      <slot />
    </div>
  </div>
</template>
