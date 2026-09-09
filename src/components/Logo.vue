<script setup lang="ts">
// Pixmaler wordmark — PIX in lime, MALER in white. The large variant (Entry) is centred
// with the 4-square pixel mark; the small variant (phase headers) is the wordmark alone.
// The mark is the shared public/mark.svg (also the favicon).

import { computed } from 'vue'

const props = withDefaults(defineProps<{
  size?: 'sm' | 'lg'
}>(), { size: 'lg' })

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
