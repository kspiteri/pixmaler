<script setup lang="ts">
// Colour-count control — a segmented group. The number is what the player cares about, so the
// control shows it; the friendly wording rides along as the accessible name.

import { useId } from 'vue'

defineProps<{ modelValue: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const labelId = useId()
const OPTIONS: { value: number, label: string }[] = [
  { value: 8, label: 'Very few colours' },
  { value: 16, label: 'A normal number of colours' },
  { value: 24, label: 'Slightly more colours' },
  { value: 32, label: 'Many more colours' },
]
</script>

<template>
  <div class="picker__setting picker__setting--inline">
    <span :id="labelId" class="picker__setting-label">Colours</span>
    <div class="segmented segmented--wide" role="group" :aria-labelledby="labelId">
      <button
        v-for="opt in OPTIONS"
        :key="opt.value"
        class="segmented__item"
        :class="{ 'segmented__item--active': modelValue === opt.value }"
        type="button"
        :aria-label="opt.label"
        :aria-pressed="modelValue === opt.value"
        @click="emit('update:modelValue', opt.value)"
      >
        {{ opt.value }}
      </button>
    </div>
  </div>
</template>
