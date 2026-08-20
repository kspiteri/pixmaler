<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue'
import { theme, toggleTheme } from '../lib/theme'

// The icon shows the theme you'd *get*, not the one you're in.
const label = () => (theme.value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme')
</script>

<template>
  <button
    class="theme-toggle pressable"
    type="button"
    :aria-label="label()"
    :title="label()"
    @click="toggleTheme"
  >
    <Sun v-if="theme === 'dark'" :size="18" aria-hidden="true" />
    <Moon v-else :size="18" aria-hidden="true" />
  </button>
</template>
