<script setup lang="ts">
// Rotating cosmetic tagline. Self-contained: picks a fresh line every `interval`
// ms and animates the swap via the View Transitions API with a *random*
// transition each time (fade / slide / blur). Graceful instant swap where
// unsupported or when the user prefers reduced motion.
//
// Used on the waiting/lull screens — Entry, Lobby, Results — and the Paint
// sandbox (which seeds its "solo sandbox…" line first, then rotates the pool).
// NOT on Drawing/Voting: a moving line distracts from the task there.

import { onBeforeUnmount, onMounted, ref } from 'vue'
import { randomTagline } from '../lib/taglines'

const props = withDefaults(defineProps<{
  // Rotation period in ms.
  interval?: number
  // Optional first line shown before rotation begins (Paint passes its sandbox
  // blurb). Omit to start on a random tagline.
  seed?: string
}>(), { interval: 7000 })

const current = ref(props.seed ?? randomTagline())

// Transition variants — each maps to a `[data-tagline-vt]` block in the unscoped
// style below. Picked at random per rotation for variety.
const VARIANTS = ['fade', 'slide-up', 'slide-down', 'blur'] as const

let timer: ReturnType<typeof setInterval> | null = null

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Pick a different line than the current one (avoid immediate repeats).
function nextTagline(): string {
  let next = randomTagline()
  for (let i = 0; i < 5 && next === current.value; i++)
    next = randomTagline()
  return next
}

function rotate() {
  const next = nextTagline()
  // Animate the swap with a view transition where available + motion is allowed;
  // otherwise just replace the text. `startViewTransition` snapshots the DOM and
  // runs the ::view-transition-* keyframes for our `view-transition-name`; the
  // variant is selected by a data attribute on <html> that the CSS keys off.
  if (!prefersReducedMotion() && document.startViewTransition) {
    const variant = VARIANTS[Math.floor(Math.random() * VARIANTS.length)]
    document.documentElement.dataset.taglineVt = variant
    const transition = document.startViewTransition(() => {
      current.value = next
    })
    transition.finished.finally(() => {
      delete document.documentElement.dataset.taglineVt
    })
  }
  else {
    current.value = next
  }
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
