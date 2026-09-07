<script setup lang="ts">
// The dark/light switch — a thin binding around the generic `ToggleSwitch`. Sun on the
// off (light) side, moon on the on (dark) side; `aria-checked` reports the current theme.
// The View-Transition cross-fade lives in `toggleTheme`, so it survives the extraction.

import { Moon, Sun } from '@lucide/vue'
import { theme, toggleTheme } from '../lib/theme'
import ToggleSwitch from './ToggleSwitch.vue'
</script>

<template>
  <ToggleSwitch
    :model-value="theme === 'dark'"
    label="Dark theme"
    @update:model-value="toggleTheme"
  >
    <template #off>
      <Sun :size="16" aria-hidden="true" />
    </template>
    <template #on>
      <Moon :size="16" aria-hidden="true" />
    </template>
  </ToggleSwitch>
</template>
