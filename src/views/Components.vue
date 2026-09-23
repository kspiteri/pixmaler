<script setup lang="ts">
// Dev-only component gallery (/components) — one accordion section per high-variability
// component, each a demo under ./components. Header carries the Logo (home) + SettingsMenu so
// the theme and text-size can be flipped while inspecting. Gated to import.meta.env.DEV in
// App.vue's router and linked from nowhere, so the whole tree tree-shakes out of production.

import { ref } from 'vue'
import Accordion from '@/components/elements/accordion/Accordion.vue'
import AccordionItem from '@/components/elements/accordion/Item.vue'
import Logo from '@/components/elements/Logo.vue'
import SettingsMenu from '@/components/layout/SettingsMenu.vue'
import { appHref } from '@/lib'
import AlertDialogDemo from './components/AlertDialogDemo.vue'
import AlertNoticeDemo from './components/AlertNoticeDemo.vue'
import ButtonDemo from './components/ButtonDemo.vue'
import NameFieldDemo from './components/NameFieldDemo.vue'
import PlayerTagDemo from './components/PlayerTagDemo.vue'
import SliderDemo from './components/SliderDemo.vue'
import ToggleSwitchDemo from './components/ToggleSwitchDemo.vue'

const homeHref = appHref()
const open = ref<string | null>('button')
</script>

<template>
  <div class="page components">
    <header class="components__header">
      <a class="components__home" :href="homeHref" aria-label="Back to entry">
        <Logo size="sm" />
      </a>
      <SettingsMenu />
    </header>

    <h1 class="components__title">
      Components
    </h1>
    <p class="components__intro">
      Dev-only gallery, linked from nowhere. One section per high-variability component — hover,
      press, toggles and the modal queue are all live, so drift shows up against the real page.
    </p>

    <Accordion v-model="open">
      <AccordionItem id="button" title="Button">
        <template #summary>
          variant × size · icon · block · tone · link
        </template>
        <ButtonDemo />
      </AccordionItem>

      <AccordionItem id="player-tag" title="PlayerTag">
        <template #summary>
          6 shapes · row / inline · truncate
        </template>
        <PlayerTagDemo />
      </AccordionItem>

      <AccordionItem id="slider" title="Slider">
        <template #summary>
          continuous · stepped
        </template>
        <SliderDemo />
      </AccordionItem>

      <AccordionItem id="toggle" title="ToggleSwitch">
        <template #summary>
          two-state · v-model
        </template>
        <ToggleSwitchDemo />
      </AccordionItem>

      <AccordionItem id="name-field" title="NameField">
        <template #summary>
          input + dice randomise
        </template>
        <NameFieldDemo />
      </AccordionItem>

      <AccordionItem id="notice" title="AlertNotice">
        <template #summary>
          info · warn · error · non-dismissable
        </template>
        <AlertNoticeDemo />
      </AccordionItem>

      <AccordionItem id="dialog" title="AlertDialog">
        <template #summary>
          modal queue — alert · confirm
        </template>
        <AlertDialogDemo />
      </AccordionItem>
    </Accordion>
  </div>
</template>

<style scoped lang="scss">
@use 'tokens' as *;

// Dev-only gallery chrome — scoped here (not a screens/ partial) so it tree-shakes out of
// production with the lazily-imported view. The demo sections mount as child components, so
// their shared layout classes are reached with :deep() (scoped styles don't cross that boundary).
.components {
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: $gap-5;
  }

  &__home {
    display: inline-flex;
    text-decoration: none;
  }

  &__title {
    margin: 0 0 $gap-2;
    font-family: $font-display;
    font-weight: 700;
    font-size: $fs-2xl;
  }

  &__intro {
    margin: 0 0 $gap-6;
    color: $fg-50;
    font-size: $fs-sm;
    line-height: 1.5;
    max-width: 40rem;
  }

  // ── Demo layout, rendered by the ./components/*Demo children ──
  :deep(.demo__section) {
    margin-bottom: $gap-6;
  }
  :deep(.demo__section:last-child) {
    margin-bottom: 0;
  }

  // Lowercase eyebrow, matching the app's section-label style.
  :deep(.demo__heading) {
    margin: 0 0 $gap-3;
    color: $fg-35;
    font-family: $font-body;
    font-weight: $fw-semibold;
    font-size: $fs-xs;
    text-transform: uppercase;
    letter-spacing: 0.15em;
  }

  // Wrapping row of controls; `align-items: center` so mixed sizes line up on their centres.
  :deep(.demo__row) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: $gap-3;
  }
  :deep(.demo__row + .demo__row) {
    margin-top: $gap-3;
  }

  // Stacked full-width controls, so `block` buttons take a column of their own.
  :deep(.demo__stack) {
    display: flex;
    flex-direction: column;
    gap: $gap-3;
    max-width: 22rem;
  }

  :deep(.demo__matrix) {
    display: flex;
    flex-direction: column;
    gap: $gap-3;
  }

  // A constrained cell, so PlayerTag's truncate ellipsis has an edge to clip against.
  :deep(.demo__narrow) {
    max-width: 12rem;
  }

  :deep(.demo__note) {
    margin: 0 0 $gap-3;
    color: $fg-50;
    font-size: $fs-sm;
  }
}
</style>
