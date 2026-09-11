<script setup lang="ts">
// The dark/light switch — a thin binding around `ToggleSwitch`. Sun on the off (light)
// side, moon on the on (dark) side; `aria-checked` reports the current theme.

import { Moon, Sun } from '@lucide/vue'
import { theme, toggleTheme } from '@/lib'
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
