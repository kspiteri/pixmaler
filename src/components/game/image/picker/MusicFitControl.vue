<script setup lang="ts">
// Music-fit control — how a song shorter than the round fills the gap. A segmented group, shown
// only when the round is longer than the track. `finale` (the song ends on the deadline) is the
// default. Rides on gm:configure as `config.musicFit`.

import type { MusicFit } from '@/lib'
import { useId } from 'vue'

defineProps<{ modelValue: MusicFit }>()
const emit = defineEmits<{ 'update:modelValue': [value: MusicFit] }>()

const labelId = useId()
const OPTIONS: { value: MusicFit, label: string }[] = [
  { value: 'finale', label: 'Ends with the round' },
  { value: 'loop', label: 'Loops' },
  { value: 'once', label: 'Plays once' },
]
</script>

<template>
  <div class="picker__field">
    <div class="picker__field-head">
      <span :id="labelId" class="picker__field-label">If the song is shorter than the round</span>
    </div>
    <div class="segmented segmented--wide" role="group" :aria-labelledby="labelId">
      <button
        v-for="opt in OPTIONS"
        :key="opt.value"
        class="segmented__item"
        :class="{ 'segmented__item--active': modelValue === opt.value }"
        type="button"
        :aria-pressed="modelValue === opt.value"
        @click="emit('update:modelValue', opt.value)"
      >
        {{ opt.label }}
      </button>
    </div>
  </div>
</template>
