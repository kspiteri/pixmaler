<script setup lang="ts">
// The settings menu — one trigger in every header, replacing the old standalone theme
// toggle. It opens a small dropdown with the theme switch and the text-size stepper.
// The theme control inside is `ThemeToggle.vue`, which is now only ever rendered here.
//
// A disclosure, not a `role="menu"`: the panel holds controls (a toggle, a stepper),
// not a list of commands. It closes on an outside pointer or Escape; Escape returns
// focus to the trigger.

import { Settings } from '@lucide/vue'
import { onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { SCALE_STEPS, stepScale, textScale } from '../lib/textScale'
import ThemeToggle from './ThemeToggle.vue'

const min = SCALE_STEPS[0]
const max = SCALE_STEPS[SCALE_STEPS.length - 1]

const open = ref(false)
const root = useTemplateRef<HTMLElement>('root')
const trigger = useTemplateRef<HTMLButtonElement>('trigger')

function onDocPointer(e: PointerEvent) {
  if (root.value && !root.value.contains(e.target as Node))
    open.value = false
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) {
    open.value = false
    trigger.value?.focus()
  }
}

// Listeners live only while open, so a closed menu costs nothing and can't leak.
watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onDocPointer as EventListener)
    document.addEventListener('keydown', onKey as EventListener)
  }
  else {
    document.removeEventListener('pointerdown', onDocPointer as EventListener)
    document.removeEventListener('keydown', onKey as EventListener)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer as EventListener)
  document.removeEventListener('keydown', onKey as EventListener)
})
</script>

<template>
  <div ref="root" class="settings-menu">
    <button
      ref="trigger"
      class="settings-menu__trigger pressable"
      type="button"
      aria-haspopup="true"
      :aria-expanded="open"
      aria-label="Settings"
      title="Settings"
      @click="open = !open"
    >
      <Settings :size="18" aria-hidden="true" />
    </button>

    <div v-if="open" class="settings-menu__panel" role="group" aria-label="Settings">
      <div class="settings-menu__row">
        <span class="settings-menu__label">Theme</span>
        <ThemeToggle />
      </div>

      <div class="settings-menu__row">
        <span id="settings-menu-text" class="settings-menu__label">Text size</span>
        <div class="settings-menu__stepper" role="group" aria-labelledby="settings-menu-text">
          <button
            class="settings-menu__step pressable"
            type="button"
            :disabled="textScale <= min"
            aria-label="Smaller text"
            @click="stepScale(-1)"
          >
            A&minus;
          </button>
          <span class="settings-menu__scale" aria-live="polite">{{ textScale }}%</span>
          <button
            class="settings-menu__step pressable"
            type="button"
            :disabled="textScale >= max"
            aria-label="Larger text"
            @click="stepScale(1)"
          >
            A+
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
