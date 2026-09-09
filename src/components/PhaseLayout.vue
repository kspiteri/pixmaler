<script setup lang="ts">
// Shared shell for the in-room phases. A status bar (logo + left/right slots)
// sits above the screen body. An optional thin progress bar can be rendered
// across the very top (DRAWING uses it for the countdown) by passing `progress`
// (0–100) and `progressColour`.

import Logo from './Logo.vue'
import SettingsMenu from './SettingsMenu.vue'

withDefaults(defineProps<{
  // Visually-hidden <h1> naming the phase — one per screen, so assistive tech has a
  // document outline to navigate by (#10). The name is otherwise only implicit in the bar.
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
