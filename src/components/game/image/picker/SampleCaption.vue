<script setup lang="ts">
// A sample artwork's label: title, then artist · year · origin and a link to its Commons page.
// Shared by the Image step's info line and the Adjust step's crop frame.

import type { SampleArtwork } from '@/lib'

defineProps<{ work: SampleArtwork }>()
</script>

<template>
  <div class="picker__sample-caption">
    <p class="picker__sample-title">
      {{ work.title }}
    </p>
    <p class="picker__sample-meta">
      {{ work.artist }} · {{ work.year }} · {{ work.origin }} ·
      <a :href="work.credit" target="_blank" rel="noopener">Source</a>
    </p>
  </div>
</template>
