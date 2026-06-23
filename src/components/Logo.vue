<script setup lang="ts">
// Pixmaler wordmark — PIX in lime, MALER in white. The large variant (Entry)
// is centred with the 4-square pixel mark; the small variant (phase header
// bars) is just the left-aligned wordmark, no mark.

import { computed } from 'vue'

const props = withDefaults(defineProps<{
  size?: 'sm' | 'lg'
}>(), { size: 'lg' })

// The pixel mark only shows on the large logo.
const showMark = computed(() => props.size === 'lg')
</script>

<template>
  <div class="wordmark" :class="`wordmark--${size}`">
    <span class="logo" :class="`logo--${size}`">
      <span class="logo__pix">PIX</span><span class="logo__maler">MALER</span>
    </span>
    <svg
      v-if="showMark"
      class="mark"
      width="32"
      height="32"
      viewBox="0 0 4 4"
    >
      <rect x="0" y="0" width="2" height="2" fill="#c8ff2d" />
      <rect x="2" y="0" width="2" height="2" fill="#7c5cff" />
      <rect x="0" y="2" width="2" height="2" fill="#ff5ca8" />
      <rect x="2" y="2" width="2" height="2" fill="#ff8c00" />
    </svg>
  </div>
</template>
