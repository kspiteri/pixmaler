<script setup lang="ts">
// Shared shell for the in-room phases: a status bar (logo + left/right slots) above the
// body, and an optional thin progress bar across the top via `progress`/`progressColour`.

import Logo from '@/components/elements/Logo.vue'
import SettingsMenu from './SettingsMenu.vue'

withDefaults(defineProps<{
  // Visually-hidden <h1> naming the phase, one per screen, for an assistive-tech outline.
  heading: string
  // 0–100 width of the top bar. Omit to hide the bar entirely.
  progress?: number | null
  progressColour?: string
  // When set, the logo becomes a link to this href (the /paint sandbox's way home).
  // In a room the logo is inert — you don't leave a game by clicking it.
  home?: string
}>(), { progress: null, progressColour: 'var(--timer-ok)', home: undefined })
</script>

<template>
  <div class="phase">
    <h1 class="sr-only">
      {{ heading }}
    </h1>
    <div
      v-if="progress !== null"
      class="phase__progress"
      aria-hidden="true"
    >
      <div
        class="phase__progress-fill"
        :style="{ width: `${progress}%`, background: progressColour }"
      />
    </div>

    <header class="phase__bar">
      <a v-if="home" class="phase__home" :href="home"><Logo size="sm" /></a>
      <Logo v-else size="sm" />
      <div class="phase__status">
        <slot name="status" />
        <SettingsMenu />
      </div>
    </header>

    <main class="phase__body">
      <slot />
    </main>
  </div>
</template>
