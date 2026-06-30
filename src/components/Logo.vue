<script setup lang="ts">
// Pixmaler wordmark — PIX in lime, MALER in white. The large variant (Entry)
// is centred with the 4-square pixel mark; the small variant (phase header
// bars) is just the left-aligned wordmark, no mark.
//
// The mark is the shared public/mark.svg (also the favicon) — one source of
// truth for the 4-square logo.

import { computed } from 'vue'

const props = withDefaults(defineProps<{
  size?: 'sm' | 'lg'
}>(), { size: 'lg' })

// The pixel mark only shows on the large logo.
const showMark = computed(() => props.size === 'lg')

// public/ assets resolve under the Vite base ("/pixmaler/" in prod).
const markSrc = `${import.meta.env.BASE_URL}mark.svg`
</script>

<template>
  <div class="wordmark" :class="`wordmark--${size}`">
    <span class="logo" :class="`logo--${size}`">
      <span class="logo__pix">PIX</span><span class="logo__maler">MALER</span>
    </span>
    <img
      v-if="showMark"
      class="mark"
      :src="markSrc"
      width="32"
      height="32"
      alt=""
      aria-hidden="true"
    >
  </div>
</template>
