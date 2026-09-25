<script setup lang="ts">
// Music control — the GM picks a background track (or none) for the round. A plain labelled
// select over the shared music manifest; "None" is the opt-in default. The choice rides on
// gm:configure as `config.musicTrack`.

import type { MusicTrackId } from '@/lib'
import { MUSIC_TRACKS } from '@/lib'

defineProps<{ modelValue: MusicTrackId | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: MusicTrackId | null] }>()

function onChange(e: Event) {
  const v = (e.target as HTMLSelectElement).value
  emit('update:modelValue', v === '' ? null : (v as MusicTrackId))
}
</script>

<template>
  <label class="picker__setting">
    <span class="picker__setting-label">Music</span>
    <select class="input" :value="modelValue ?? ''" aria-label="Background music" @change="onChange">
      <option value="">
        None
      </option>
      <option v-for="t in MUSIC_TRACKS" :key="t.id" :value="t.id">
        {{ t.label }}
      </option>
    </select>
  </label>
</template>
