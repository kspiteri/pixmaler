<script setup lang="ts">
// Dev-only component gallery (/components) — one section per high-variability component, each a
// demo under ./components, all open at once so primitives can be compared. "Both themes" renders
// every demo twice, in a dark and a light pane. Gated to import.meta.env.DEV in App.vue's router
// and linked from nowhere, so the whole tree tree-shakes out of production.

import { ref } from 'vue'
import Logo from '@/components/elements/Logo.vue'
import ToggleSwitch from '@/components/elements/ToggleSwitch.vue'
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
const split = ref(false)

const sections = [
  { id: 'button', title: 'Button', summary: 'variant × size · icon · block · tone · link', demo: ButtonDemo },
  { id: 'player-tag', title: 'PlayerTag', summary: '6 shapes · row / inline · truncate', demo: PlayerTagDemo },
  { id: 'slider', title: 'Slider', summary: 'continuous · stepped', demo: SliderDemo },
  { id: 'toggle', title: 'ToggleSwitch', summary: 'two-state · v-model', demo: ToggleSwitchDemo },
  { id: 'name-field', title: 'NameField', summary: 'input + dice randomise', demo: NameFieldDemo },
  { id: 'notice', title: 'AlertNotice', summary: 'info · warn · error · non-dismissable', demo: AlertNoticeDemo },
  { id: 'dialog', title: 'AlertDialog', summary: 'modal queue: alert · confirm', demo: AlertDialogDemo },
]
const themes = ['dark', 'light'] as const
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
      Dev-only gallery, linked from nowhere. Hover, press, toggles and the modal queue are all live,
      so drift shows up against the real page.
    </p>

    <div class="components__bar">
      <nav class="components__nav" aria-label="Components">
        <a v-for="s in sections" :key="s.id" :href="`#${s.id}`">{{ s.title }}</a>
      </nav>
      <div class="components__split">
        <span aria-hidden="true">Both themes</span>
        <ToggleSwitch v-model="split" label="Show both themes side by side" />
      </div>
    </div>

    <section v-for="s in sections" :id="s.id" :key="s.id" class="components__section">
      <h2 class="components__heading">
        {{ s.title }}
        <span class="components__summary">{{ s.summary }}</span>
      </h2>
      <div v-if="split" class="components__panes">
        <div v-for="t in themes" :key="t" class="components__pane" :data-theme="t">
          <component :is="s.demo" />
        </div>
      </div>
      <component :is="s.demo" v-else />
    </section>
  </div>
</template>

<style scoped lang="scss">
@use 'tokens' as *;
@use 'chrome' as *;

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
    font-weight: $fw-bold;
    font-size: $fs-2xl;
  }

  &__intro {
    margin: 0 0 $gap-5;
    color: $muted;
    font-size: $fs-sm;
    line-height: 1.5;
    max-width: 40rem;
  }

  // Sticky so any section is one click away while scrolled deep into another.
  &__bar {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: $gap-3;
    margin-bottom: $gap-5;
    padding: $gap-2 $gap-3;
    @include chrome($rung: $radius);
  }

  &__nav {
    display: flex;
    flex-wrap: wrap;
    gap: $gap-1 $gap-4;
    font-size: $fs-sm;

    a {
      color: $muted;
      text-decoration: none;

      &:hover {
        color: $fg;
      }
    }
  }

  &__split {
    display: flex;
    align-items: center;
    gap: $gap-2;
    color: $muted;
    font-size: $fs-sm;
  }

  &__section {
    margin-bottom: $gap-5;
    padding: $gap-4;
    scroll-margin-top: 4rem;
    @include chrome;
  }

  &__heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: $gap-1 $gap-3;
    margin: 0 0 $gap-4;
    font-family: $font-display;
    font-weight: $fw-semibold;
    font-size: $fs-lg;
  }

  &__summary {
    color: $muted;
    font-family: $font-body;
    font-weight: $fw-regular;
    font-size: $fs-xs;
  }

  &__panes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 28rem), 1fr));
    gap: $gap-3;
  }

  // `data-theme` re-points every token inside, so the pane only has to paint its own page.
  &__pane {
    padding: $gap-4;
    border: 1px solid $border;
    border-radius: $radius;
    background: $bg;
    color: $fg;
  }

  // ── Demo layout, rendered by the ./components/*Demo children ──
  :deep(.demo__section) {
    margin-bottom: $gap-5;
  }
  :deep(.demo__section:last-child) {
    margin-bottom: 0;
  }

  :deep(.demo__heading) {
    margin: 0 0 $gap-2;
    color: $fg-80;
    font-family: $font-body;
    font-weight: $fw-semibold;
    font-size: $fs-sm;
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
    max-width: 65ch;
    color: $muted;
    font-size: $fs-sm;
  }
}
</style>
