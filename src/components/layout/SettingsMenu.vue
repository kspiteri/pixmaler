<script setup lang="ts">
// The settings menu — one gear trigger in every header, opening a dropdown: the theme switch,
// then single-open Accessibility (text size, touch mode, shortcuts) and Sound (music, effects,
// countdown) sections. A disclosure, not a `role="menu"`: it closes on an outside pointer or
// Escape; Escape returns focus to the trigger.

import { Bell, BellOff, Hand, Keyboard, KeyboardOff, Mouse, Music, Settings, Timer, TimerOff, VolumeX } from '@lucide/vue'
import { onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import Accordion from '@/components/elements/accordion/Accordion.vue'
import AccordionItem from '@/components/elements/accordion/Item.vue'
import Button from '@/components/elements/Button.vue'
import ThemeToggle from '@/components/elements/ThemeToggle.vue'
import ToggleSwitch from '@/components/elements/ToggleSwitch.vue'
import { askConfirm, clearAllData, isTouch, music, SCALE_STEPS, sfx, shortcutsEnabled, stepScale, textScale, ticktock, toggleMusic, toggleSfx, toggleShortcuts, toggleTicktock, toggleTouch } from '@/lib'

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
  if (!await askConfirm(message))
    return
  clearAllData()
  location.href = import.meta.env.BASE_URL
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

      <Accordion>
        <AccordionItem id="accessibility" title="Accessibility">
          <template #summary>
            <span class="settings-menu__summary">
              <span class="settings-menu__summary-text">{{ textScale }}%</span>
              <Hand v-if="isTouch" :size="14" aria-hidden="true" />
              <Mouse v-else :size="14" aria-hidden="true" />
              <template v-if="!isTouch">
                <Keyboard v-if="shortcutsEnabled" :size="14" aria-hidden="true" />
                <KeyboardOff v-else :size="14" aria-hidden="true" />
              </template>
            </span>
          </template>
          <div class="settings-menu__row">
            <span id="settings-menu-text" class="settings-menu__label">Text</span>
            <div class="settings-menu__stepper" role="group" aria-labelledby="settings-menu-text">
              <Button
                variant="subtle"
                icon
                size="small"
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
                size="small"
                :disabled="textScale >= max"
                aria-label="Larger text"
                @click="stepScale(1)"
              >
                A+
              </Button>
            </div>
          </div>

          <div class="settings-menu__row">
            <span class="settings-menu__label">Touch mode</span>
            <ToggleSwitch
              :model-value="isTouch"
              label="Touch mode"
              @update:model-value="toggleTouch"
            >
              <template #off>
                <Mouse :size="16" aria-hidden="true" />
              </template>
              <template #on>
                <Hand :size="16" aria-hidden="true" />
              </template>
            </ToggleSwitch>
          </div>

          <div v-if="!isTouch" class="settings-menu__row">
            <span class="settings-menu__label">Shortcuts</span>
            <ToggleSwitch
              :model-value="shortcutsEnabled"
              label="Keyboard shortcuts"
              @update:model-value="toggleShortcuts"
            >
              <template #off>
                <KeyboardOff :size="16" aria-hidden="true" />
              </template>
              <template #on>
                <Keyboard :size="16" aria-hidden="true" />
              </template>
            </ToggleSwitch>
          </div>
        </AccordionItem>

        <AccordionItem id="sound" title="Sound">
          <template #summary>
            <span class="settings-menu__summary">
              <Music v-if="music" :size="14" aria-hidden="true" />
              <VolumeX v-else :size="14" aria-hidden="true" />
              <Bell v-if="sfx" :size="14" aria-hidden="true" />
              <BellOff v-else :size="14" aria-hidden="true" />
              <Timer v-if="ticktock" :size="14" aria-hidden="true" />
              <TimerOff v-else :size="14" aria-hidden="true" />
            </span>
          </template>
          <div class="settings-menu__row">
            <span class="settings-menu__label">Music</span>
            <ToggleSwitch
              :model-value="music"
              label="Music"
              @update:model-value="toggleMusic"
            >
              <template #off>
                <VolumeX :size="16" aria-hidden="true" />
              </template>
              <template #on>
                <Music :size="16" aria-hidden="true" />
              </template>
            </ToggleSwitch>
          </div>

          <div class="settings-menu__row">
            <span class="settings-menu__label">Effects</span>
            <ToggleSwitch
              :model-value="sfx"
              label="Sound effects"
              @update:model-value="toggleSfx"
            >
              <template #off>
                <BellOff :size="16" aria-hidden="true" />
              </template>
              <template #on>
                <Bell :size="16" aria-hidden="true" />
              </template>
            </ToggleSwitch>
          </div>

          <div class="settings-menu__row">
            <span class="settings-menu__label">Countdown</span>
            <ToggleSwitch
              :model-value="ticktock"
              label="Countdown ticks"
              @update:model-value="toggleTicktock"
            >
              <template #off>
                <TimerOff :size="16" aria-hidden="true" />
              </template>
              <template #on>
                <Timer :size="16" aria-hidden="true" />
              </template>
            </ToggleSwitch>
          </div>
        </AccordionItem>
      </Accordion>

      <hr class="settings-menu__sep">
      <Button variant="subtle" size="small" block @click="clearData">
        Clear my data
      </Button>
      <p v-if="version" class="settings-menu__version">
        pixmaler v{{ version }}
      </p>
    </div>
  </div>
</template>
