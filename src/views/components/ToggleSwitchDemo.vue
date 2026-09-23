<script setup lang="ts">
// Gallery section: the generic two-state ToggleSwitch, with a live state readout.

import { Moon, Sun } from '@lucide/vue'
import { ref } from 'vue'
import ToggleSwitch from '@/components/elements/ToggleSwitch.vue'

const toggled = ref(false)
</script>

<template>
  <section class="demo__section">
    <div class="demo__row">
      <ToggleSwitch v-model="toggled" label="Demo toggle">
        <template #off>
          <Sun :size="15" aria-hidden="true" />
        </template>
        <template #on>
          <Moon :size="15" aria-hidden="true" />
        </template>
      </ToggleSwitch>
      <span class="demo__note">state: {{ toggled ? 'on' : 'off' }}</span>
    </div>
  </section>
</template>
