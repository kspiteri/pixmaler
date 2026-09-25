<script setup lang="ts">
// Music control — the GM picks a background track (or none) for the round. A styled native
// <select> (kept native for keyboard/mobile/a11y) over the shared manifest; "None" is the
// opt-in default. The choice rides on gm:configure as `config.musicTrack`.

import type { MusicTrackId } from '@/lib'
import { ChevronDown } from '@lucide/vue'
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
    <div class="picker__select">
      <select class="picker__select-input" :value="modelValue ?? ''" aria-label="Background music" @change="onChange">
        <option value="">
          None
        </option>
        <option v-for="t in MUSIC_TRACKS" :key="t.id" :value="t.id">
          {{ t.label }}
        </option>
      </select>
      <ChevronDown class="picker__select-chevron" :size="16" aria-hidden="true" />
    </div>
  </label>
</template>
