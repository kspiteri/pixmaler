<script setup lang="ts">
// The game's award/winner icons, inlined (not `<img>`) so the accent border can use
// `currentColor` and track the *app* theme — an `<img>` SVG only sees the OS colour scheme,
// never `data-theme`. Fills are fixed; only the funniest/best border is `currentColor`, which
// the host sets to `$accent-ink` (olive on light, lime on dark). Clip ids are per-instance
// (`useId`) so multiple icons on a page don't collide on a shared `id`.
import { useId } from 'vue'

defineProps<{ name: 'funniest' | 'best' | 'crown' }>()

const uid = useId()
</script>

<template>
  <svg viewBox="0 0 96 96" aria-hidden="true">
    <template v-if="name === 'funniest'">
      <clipPath :id="uid"><rect width="96" height="96" rx="18" /></clipPath>
      <g :clip-path="`url(#${uid})`">
        <rect width="48" height="48" fill="#B4DD28" />
        <rect x="48" width="48" height="48" fill="#6C4CE6" />
        <rect y="48" width="48" height="48" fill="#EE3D8B" />
        <rect x="48" y="48" width="48" height="48" fill="#F5891E" />
      </g>
      <path d="M17 47 C13 55 11 60 14 64 C16 67 21 67 23 63 C25 59 21 54 17 47 Z" fill="#4FA6E0" />
      <path d="M79 47 C83 55 85 60 82 64 C80 67 75 67 73 63 C71 59 75 54 79 47 Z" fill="#4FA6E0" />
      <g fill="none" stroke="#4A2E1C" stroke-width="5" stroke-linecap="round">
        <path d="M22 45 Q32 34 42 45" />
        <path d="M54 45 Q64 34 74 45" />
      </g>
      <path d="M27 55 Q48 50 69 55 Q66 80 48 80 Q30 80 27 55 Z" fill="#4A2E1C" />
      <path d="M31 57 Q48 54 65 57 Q63 66 48 66 Q33 66 31 57 Z" fill="#fff" />
      <rect x="3" y="3" width="90" height="90" rx="16" fill="none" stroke="currentColor" stroke-width="6" />
    </template>

    <template v-else-if="name === 'best'">
      <clipPath :id="uid">
        <path d="M48 6 L61.52 33.39 L91.75 37.79 L68.93 54.8 L73.86 83.6 L48 70 L22.14 83.6 L27.07 54.8 L6.15 34.4 L35.06 30.2 Z" />
      </clipPath>
      <g :clip-path="`url(#${uid})`">
        <rect width="48" height="48" fill="#B4DD28" />
        <rect x="48" width="48" height="48" fill="#6C4CE6" />
        <rect y="48" width="48" height="48" fill="#EE3D8B" />
        <rect x="48" y="48" width="48" height="48" fill="#F5891E" />
      </g>
      <path d="M48 6 L61.52 33.39 L91.75 37.79 L68.93 54.8 L73.86 83.6 L48 70 L22.14 83.6 L27.07 54.8 L6.15 34.4 L35.06 30.2 Z" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="round" />
    </template>

    <template v-else>
      <path d="M14 64 L16 34 L24 50 L32 26 L40 46 L48 22 L56 46 L64 26 L72 50 L80 34 L82 64 Z" fill="#FFC53D" stroke="#F5A312" stroke-width="2" stroke-linejoin="round" />
      <g fill="#F5A312">
        <circle cx="16" cy="34" r="4" /><circle cx="32" cy="26" r="4" /><circle cx="48" cy="22" r="4.5" /><circle cx="64" cy="26" r="4" /><circle cx="80" cy="34" r="4" />
      </g>
      <rect x="12" y="63" width="72" height="15" rx="5" fill="#FFC53D" stroke="#F5A312" stroke-width="2" />
      <line x1="14" y1="70.5" x2="82" y2="70.5" stroke="#F5A312" stroke-width="2" />
      <path d="M24 50 L28.5 55 L24 60 L19.5 55 Z" fill="#8BD450" />
      <rect x="31.5" y="50.5" width="9" height="9" rx="1.5" fill="#7B3FE4" />
      <path d="M48 50 L52.33 52.5 L52.33 57.5 L48 60 L43.67 57.5 L43.67 52.5 Z" fill="#EE3D8B" />
      <path d="M60 50 L64.5 59 L55.5 59 Z" fill="#8FB08A" />
      <path d="M72 50 L76.76 53.45 L74.94 59.05 L69.06 59.05 L67.24 53.45 Z" fill="#F5891E" />
    </template>
  </svg>
</template>

<style scoped>
svg {
  display: block;
}
</style>
