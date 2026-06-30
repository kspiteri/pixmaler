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

<style scoped lang="scss">
@use '../styles/tokens' as *;

.tagline {
  // Margin intentionally unset — placement spacing is the host's job. Setting
  // it here (even to 0) would win on scoped specificity and block host overrides.
  color: $fg-40;
  font-family: $font-body; // TODO(05): switch to the alerts/notification face once added
  font-size: 0.875rem;
  // Names this element for the View Transitions API so only the tagline animates,
  // not the whole page. Unique because only one <Tagline> mounts per page.
  view-transition-name: tagline;
}
</style>

<!-- ::view-transition-* are document-level pseudo-elements — they can't live in a
     scoped block, so the keyframes go in a plain (unscoped) style. The `tagline`
     name matches `view-transition-name` above; the variant is chosen per rotation
     via [data-tagline-vt] on <html>. Reduced motion is handled in script (we skip
     startViewTransition) and zeroed here as belt-and-braces. -->
<style lang="scss">
::view-transition-old(tagline),
::view-transition-new(tagline) {
  animation-duration: 0.4s;
  animation-timing-function: ease;
}

// fade (default + explicit) — the API's built-in cross-fade is fine as-is.
@keyframes tagline-fade-out {
  to {
    opacity: 0;
  }
}
@keyframes tagline-fade-in {
  from {
    opacity: 0;
  }
}

// slide-up: old rises out, new rises in from below.
@keyframes tagline-up-out {
  to {
    opacity: 0;
    transform: translateY(-30%);
  }
}
@keyframes tagline-up-in {
  from {
    opacity: 0;
    transform: translateY(30%);
  }
}

// slide-down: mirror of slide-up.
@keyframes tagline-down-out {
  to {
    opacity: 0;
    transform: translateY(30%);
  }
}
@keyframes tagline-down-in {
  from {
    opacity: 0;
    transform: translateY(-30%);
  }
}

// blur: soften out / sharpen in.
@keyframes tagline-blur-out {
  to {
    opacity: 0;
    filter: blur(4px);
  }
}
@keyframes tagline-blur-in {
  from {
    opacity: 0;
    filter: blur(4px);
  }
}

[data-tagline-vt='slide-up'] {
  &::view-transition-old(tagline) {
    animation-name: tagline-up-out;
  }
  &::view-transition-new(tagline) {
    animation-name: tagline-up-in;
  }
}
[data-tagline-vt='slide-down'] {
  &::view-transition-old(tagline) {
    animation-name: tagline-down-out;
  }
  &::view-transition-new(tagline) {
    animation-name: tagline-down-in;
  }
}
[data-tagline-vt='blur'] {
  &::view-transition-old(tagline) {
    animation-name: tagline-blur-out;
  }
  &::view-transition-new(tagline) {
    animation-name: tagline-blur-in;
  }
}

@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(tagline),
  ::view-transition-new(tagline) {
    animation: none;
  }
}
</style>
