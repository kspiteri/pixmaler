<script setup lang="ts">
// Rotating cosmetic tagline: picks a fresh line every `interval` ms and animates the swap
// via the View Transitions API with a random transition (fade / slide / blur), falling
// back to an instant swap where unsupported or under prefers-reduced-motion. Used on the
// waiting screens (Entry, Lobby, Results) and the Paint sandbox, not on Drawing/Voting.

import { onBeforeUnmount, onMounted, ref } from 'vue'
import { prefersReducedMotion, randomTagline } from '@/lib'

const props = withDefaults(defineProps<{
  // Rotation period in ms.
  interval?: number
  // Optional first line shown before rotation begins. Omit to start on a random tagline.
  seed?: string
}>(), { interval: 7000 })

const current = ref(props.seed ?? randomTagline())

// Transition variants — each maps to a `[data-tagline-vt]` block in the unscoped style below.
const VARIANTS = ['fade', 'slide-up', 'slide-down', 'blur'] as const

let timer: ReturnType<typeof setInterval> | null = null

// Pick a different line than the current one.
function nextTagline(): string {
  let next = randomTagline()
  for (let i = 0; i < 5 && next === current.value; i++)
    next = randomTagline()
  return next
}

// Sets `[data-tagline-vt]` to a value, since the variant needs one, not just presence.
function rotate() {
  const next = nextTagline()
  if (prefersReducedMotion() || !document.startViewTransition) {
    current.value = next
    return
  }
  const root = document.documentElement
  root.dataset.taglineVt = VARIANTS[Math.floor(Math.random() * VARIANTS.length)]
  const transition = document.startViewTransition(() => { current.value = next })
  // A skipped transition rejects `ready` with AbortError; swallow it. `finished` resolves
  // even on a skip, so the attribute cleanup still runs.
  transition.ready.catch(() => {})
  transition.finished.finally(() => { delete root.dataset.taglineVt })
}

onMounted(() => {
  timer = setInterval(rotate, props.interval)
})

onBeforeUnmount(() => {
  if (timer)
    clearInterval(timer)
})
</script>

<template>
  <p class="tagline">
    {{ current }}
  </p>
</template>
