<script setup lang="ts">
// A single hung frame: a bevelled paper surface wrapping a read-only pixel drawing, with a
// slot for overlays (a "yours"/"original" tag, award badges). Dumb by design — its size comes
// from the context it sits in (a wall cell or the close-up modal), never from itself.

import PixelThumb from '../shared/PixelThumb.vue'

defineProps<{
  gridW: number
  gridH: number
  palette: string[]
  grid: number[]
}>()
</script>

<template>
  <div class="salon-frame art-frame">
    <PixelThumb class="salon-frame__art" :grid-w="gridW" :grid-h="gridH" :palette="palette" :grid="grid" />
    <slot />
  </div>
</template>
