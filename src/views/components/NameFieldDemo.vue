<script setup lang="ts">
// Gallery section: the display-name field, with a live value readout.

import { ref } from 'vue'
import NameField from '@/components/elements/NameField.vue'

const name = ref('')
</script>

<template>
  <section class="demo__section">
    <div class="demo__stack">
      <NameField v-model="name" label="Your name" />
      <span class="demo__note">value: {{ name || '(empty)' }}</span>
    </div>
  </section>
</template>
