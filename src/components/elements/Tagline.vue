<script setup lang="ts">
// One cosmetic tagline per mount: the `seed` line if given, otherwise a random one. It stays
// put for the life of the page, since rotating copy on a waiting screen reads as a glitch.
// Used on the waiting screens (Entry, Lobby, Results) and the Paint sandbox, not on Drawing/Voting.

import { randomTagline } from '@/lib'

const props = defineProps<{
  // A fixed line for this site. Omit for a random tagline.
  seed?: string
}>()

const line = props.seed ?? randomTagline()
</script>

<template>
  <p class="tagline">
    {{ line }}
  </p>
</template>
