<script setup lang="ts">
// A compact music transport for the phase header, shown wherever a track is playing or failed
// to load. Play/pause is always visible; a chevron reveals the song title and volume, inline on
// desktop and as a popover under $bp-mobile. Play/pause is transport, independent of the
// Sound → Music toggle (the master enable).

import { ChevronLeft, Pause, Play, Volume2 } from '@lucide/vue'
import { computed, onBeforeUnmount, useId, useTemplateRef, watch } from 'vue'
import Button from '@/components/elements/Button.vue'
import Slider from '@/components/elements/Slider.vue'
import { currentTrack, isMobile, musicControlsOpen, musicError, musicPaused, musicVolume, pauseMusic, resumeMusic, setMusicVolume, trackLabel, useAppLayout } from '@/lib'

useAppLayout()

const root = useTemplateRef<HTMLElement>('root')
const expander = useTemplateRef<InstanceType<typeof Button>>('expander')
const panelId = useId()

const track = computed(() => currentTrack.value ?? musicError.value)
const label = computed(() => (track.value ? trackLabel(track.value) : ''))
const playLabel = computed(() => {
  if (musicError.value)
    return 'Couldn\'t load this song'
  return musicPaused.value ? 'Resume music' : 'Pause music'
})

function toggle() {
  if (musicPaused.value)
    resumeMusic()
  else
    pauseMusic()
}

function onDocPointer(e: PointerEvent) {
  if (root.value && !root.value.contains(e.target as Node))
    musicControlsOpen.value = false
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    musicControlsOpen.value = false
    expander.value?.focus()
  }
}

function unlisten() {
  document.removeEventListener('pointerdown', onDocPointer as EventListener)
  document.removeEventListener('keydown', onKey as EventListener)
}

// Only the mobile popover dismisses itself; the desktop panel is inline and stays put.
watch([musicControlsOpen, isMobile, track], ([open, mobile, t]) => {
  unlisten()
  if (open && mobile && t) {
    document.addEventListener('pointerdown', onDocPointer as EventListener)
    document.addEventListener('keydown', onKey as EventListener)
  }
}, { immediate: true })

onBeforeUnmount(unlisten)
</script>

<template>
  <div
    v-if="track"
    ref="root"
    class="music-widget"
    :class="{ 'music-widget--open': musicControlsOpen, 'music-widget--playing': currentTrack && !musicPaused }"
  >
    <Button
      icon
      variant="subtle"
      size="small"
      class="music-widget__play"
      :disabled="!!musicError"
      :aria-label="playLabel"
      :title="playLabel"
      @click="toggle"
    >
      <template #icon>
        <Play v-if="musicPaused || musicError" :size="18" aria-hidden="true" />
        <Pause v-else :size="18" aria-hidden="true" />
      </template>
    </Button>
    <Button
      ref="expander"
      icon
      variant="subtle"
      size="small"
      class="music-widget__more"
      aria-label="Song and volume"
      title="Song and volume"
      :aria-expanded="musicControlsOpen"
      :aria-controls="panelId"
      @click="musicControlsOpen = !musicControlsOpen"
    >
      <template #icon>
        <ChevronLeft class="music-widget__chevron" :size="18" aria-hidden="true" />
      </template>
    </Button>
    <Transition name="music-widget-reveal">
      <div v-show="musicControlsOpen" :id="panelId" class="music-widget__panel" role="group" aria-label="Song and volume">
        <span class="music-widget__title" :title="label">{{ label }}</span>
        <span v-if="musicError" class="music-widget__error">Couldn't load this song</span>
        <div v-else class="music-widget__vol">
          <Volume2 class="music-widget__vol-icon" :size="14" aria-hidden="true" />
          <Slider
            class="music-widget__vol-slider slider--neutral"
            :model-value="musicVolume"
            :min="0"
            :max="1"
            :step="0.05"
            label="Music volume"
            @update:model-value="setMusicVolume"
          />
        </div>
      </div>
    </Transition>
  </div>
</template>
