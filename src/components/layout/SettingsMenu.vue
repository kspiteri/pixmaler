<script setup lang="ts">
// The settings menu — one gear trigger in every header, opening a dropdown: the theme switch,
// then two flat groups, Accessibility (text size, touch mode, shortcuts) and Sound (music,
// effects, countdown ticks), and a footer of Privacy / Credits / Clear. A disclosure, not a
// `role="menu"`: it closes on an outside pointer or Escape; Escape returns focus to the trigger.

import { Settings } from '@lucide/vue'
import { onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import Button from '@/components/elements/Button.vue'
import ThemeToggle from '@/components/elements/ThemeToggle.vue'
import ToggleSwitch from '@/components/elements/ToggleSwitch.vue'
import { askConfirm, clearAllData, isTouch, music, openCredits, openPrivacy, SCALE_STEPS, sfx, shortcutsEnabled, stepScale, textScale, ticktock, toggleMusic, toggleSfx, toggleShortcuts, toggleTicktock, toggleTouch } from '@/lib'

const min = SCALE_STEPS[0]
const max = SCALE_STEPS[SCALE_STEPS.length - 1]

// Client build version from `<meta name="pixmaler:client">`; empty string if absent.
const version = document.querySelector('meta[name="pixmaler:client"]')?.getAttribute('content') ?? ''

const open = ref(false)
const root = useTemplateRef<HTMLElement>('root')
const trigger = useTemplateRef<InstanceType<typeof Button>>('trigger')

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

// Clear my data: wipe every pixmaler:* key and reload to Entry (the reload closes any
// socket). Copy is context-aware: only rooms have a game to leave.
async function clearData() {
  open.value = false
  const inRoom = new URLSearchParams(location.search).has('room')
  const message = inRoom
    ? 'Clear your saved name and preferences, and leave the current game?'
    : 'Clear your saved name and preferences?'
  if (!await askConfirm(message, { confirm: inRoom ? 'Clear and leave' : 'Clear my data' }))
    return
  clearAllData()
  location.href = import.meta.env.BASE_URL
}

// Close the menu before the modal opens, so it owns focus and Escape can't return to an inert trigger.
function showInfo(show: () => void) {
  open.value = false
  show()
}
</script>

<template>
  <div ref="root" class="settings-menu">
    <Button
      ref="trigger"
      variant="subtle"
      icon
      aria-haspopup="true"
      :aria-expanded="open"
      aria-label="Settings"
      title="Settings"
      @click="open = !open"
    >
      <template #icon>
        <Settings :size="18" aria-hidden="true" />
      </template>
    </Button>

    <div v-if="open" class="settings-menu__panel" role="group" aria-label="Settings">
      <div class="settings-menu__row">
        <span class="settings-menu__label">Theme</span>
        <ThemeToggle />
      </div>

      <section class="settings-menu__group" aria-labelledby="settings-menu-a11y">
        <h2 id="settings-menu-a11y" class="settings-menu__heading">
          Accessibility
        </h2>

        <div class="settings-menu__row">
          <span id="settings-menu-text" class="settings-menu__label">Text size</span>
          <div class="settings-menu__stepper" role="group" aria-labelledby="settings-menu-text">
            <Button
              variant="subtle"
              icon
              size="x-small"
              :disabled="textScale <= min"
              aria-label="Smaller text"
              @click="stepScale(-1)"
            >
              A&minus;
            </Button>
            <span class="settings-menu__scale" aria-live="polite">{{ textScale }}%</span>
            <Button
              variant="subtle"
              icon
              size="x-small"
              :disabled="textScale >= max"
              aria-label="Larger text"
              @click="stepScale(1)"
            >
              A+
            </Button>
          </div>
        </div>

        <div class="settings-menu__row">
          <span class="settings-menu__label">
            Touch mode
            <span id="settings-menu-touch-hint" class="settings-menu__hint">Larger controls, no dragging</span>
          </span>
          <ToggleSwitch
            :model-value="isTouch"
            label="Touch mode"
            describedby="settings-menu-touch-hint"
            @update:model-value="toggleTouch"
          />
        </div>

        <div v-if="!isTouch" class="settings-menu__row">
          <span class="settings-menu__label">Keyboard shortcuts</span>
          <ToggleSwitch
            :model-value="shortcutsEnabled"
            label="Keyboard shortcuts"
            @update:model-value="toggleShortcuts"
          />
        </div>
      </section>

      <section class="settings-menu__group" aria-labelledby="settings-menu-sound">
        <h2 id="settings-menu-sound" class="settings-menu__heading">
          Sound
        </h2>

        <div class="settings-menu__row">
          <span class="settings-menu__label">Music</span>
          <ToggleSwitch :model-value="music" label="Music" @update:model-value="toggleMusic" />
        </div>

        <div class="settings-menu__row">
          <span class="settings-menu__label">Sound effects</span>
          <ToggleSwitch :model-value="sfx" label="Sound effects" @update:model-value="toggleSfx" />
        </div>

        <div class="settings-menu__row">
          <span class="settings-menu__label">
            Countdown ticks
            <span id="settings-menu-tick-hint" class="settings-menu__hint">The ticking clock while you draw</span>
          </span>
          <ToggleSwitch
            :model-value="ticktock"
            label="Countdown ticks"
            describedby="settings-menu-tick-hint"
            @update:model-value="toggleTicktock"
          />
        </div>
      </section>

      <footer class="settings-menu__foot">
        <div class="settings-menu__links">
          <button type="button" class="settings-menu__link" @click="showInfo(openPrivacy)">
            Privacy
          </button>
          <button type="button" class="settings-menu__link" @click="showInfo(openCredits)">
            Credits
          </button>
          <button type="button" class="settings-menu__link settings-menu__link--danger" @click="clearData">
            Clear my data
          </button>
        </div>
        <p v-if="version" class="settings-menu__version">
          pixmaler v{{ version }}
        </p>
      </footer>
    </div>
  </div>
</template>
