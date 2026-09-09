<script setup lang="ts">
// Shared shell for the in-room phases: a status bar (logo + left/right slots) above the
// body, and an optional thin progress bar across the top via `progress`/`progressColour`.

import Logo from './Logo.vue'
import SettingsMenu from './SettingsMenu.vue'

withDefaults(defineProps<{
  // Visually-hidden <h1> naming the phase, one per screen, for an assistive-tech outline.
  heading: string
  // 0–100 width of the top bar. Omit to hide the bar entirely.
  progress?: number | null
  progressColour?: string
}>(), { progress: null, progressColour: 'var(--timer-ok)' })
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
      <Logo size="sm" />
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
