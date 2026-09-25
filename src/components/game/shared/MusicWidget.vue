<script setup lang="ts">
// A compact music transport for the phase header, shown wherever a track is playing. It collapses
// horizontally to a single music button and expands to the full transport — play/pause, title,
// volume — so it fits any width without leaving the header. Play/pause is transport: it pauses
// and resumes the loaded track locally, independent of the Sound → Music toggle (the master
// enable). Reads and drives the audio module's reactive music state.

import { Music, Pause, Play, Volume2 } from '@lucide/vue'
import { computed, ref } from 'vue'
import Button from '@/components/elements/Button.vue'
import Slider from '@/components/elements/Slider.vue'
import { currentTrack, musicPaused, musicVolume, pauseMusic, resumeMusic, setMusicVolume, trackLabel } from '@/lib'

const expanded = ref(false)
const label = computed(() => (currentTrack.value ? trackLabel(currentTrack.value) : ''))

function toggle() {
  if (musicPaused.value)
    resumeMusic()
  else
    pauseMusic()
}
</script>

<template>
  <div v-if="currentTrack" class="music-widget" :class="{ 'music-widget--expanded': expanded, 'music-widget--playing': !musicPaused }">
    <Button
      icon
      variant="subtle"
      size="small"
      class="music-widget__handle"
      :aria-label="expanded ? 'Hide music controls' : 'Show music controls'"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <template #icon>
        <Music :size="18" aria-hidden="true" />
      </template>
    </Button>
    <div class="music-widget__body">
      <Button
        icon
        variant="secondary"
        size="x-small"
        :aria-label="musicPaused ? 'Resume music' : 'Pause music'"
        @click="toggle"
      >
        <template #icon>
          <Play v-if="musicPaused" :size="14" aria-hidden="true" />
          <Pause v-else :size="14" aria-hidden="true" />
        </template>
      </Button>
      <div class="music-widget__container">
        <span class="music-widget__title">{{ label }}</span>
        <div class="music-widget__vol">
          <Volume2 class="music-widget__vol-icon" :size="12" aria-hidden="true" />
          <Slider
            class="music-widget__vol-slider"
            :model-value="musicVolume"
            :min="0"
            :max="1"
            :step="0.05"
            label="Music volume"
            @update:model-value="setMusicVolume"
          />
        </div>
      </div>
    </div>
  </div>
</template>
