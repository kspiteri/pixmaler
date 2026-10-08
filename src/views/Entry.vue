<script setup lang="ts">
// Entry screen — pre-room landing: a framed Mona Lisa beside a player's attempt at it, then
// start a game, join one by code, or open the paint sandbox. It asks no name; the room route's
// NameGate does when none is stored. Owns the one in-flight navigation, so only one action can
// confirm at a time; its parts live in `entry/`.

import { ArrowRight, Play } from '@lucide/vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Logo from '@/components/elements/Logo.vue'
import Tagline from '@/components/elements/Tagline.vue'
import { PixelThumb } from '@/components/game'
import SettingsMenu from '@/components/layout/SettingsMenu.vue'
import { appHref, HERO_ATTEMPT, HERO_ORIGINAL, roomHref, wordPair } from '@/lib'
import Door from './entry/Door.vue'
import JoinForm from './entry/JoinForm.vue'

type Action = 'create' | 'join' | 'free'

const code = ref('')
// Which action is mid-confirm, or null. Drives that control's label → icon morph.
const confirming = ref<Action | null>(null)

const sandboxHref = appHref('paint')
const artRatio = `${HERO_ORIGINAL.gridW} / ${HERO_ORIGINAL.gridH}`

// The confirm morph (label → icon) plays for this long before the full-page navigation unloads the page.
const CONFIRM_MS = 420

// Claims the navigation for `action` and leaves once the morph has had CONFIRM_MS since `since`.
function confirmNavigate(action: Action, href: string, since = Date.now()) {
  if (confirming.value)
    return
  confirming.value = action
  setTimeout(() => {
    location.href = href
  }, Math.max(0, CONFIRM_MS - (Date.now() - since)))
}

// Free mode is a real route (an <a>), so honour modified clicks (open in a new tab); a plain
// click gets the confirm morph before navigating.
function enterSandbox(e: MouseEvent) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)
    return
  e.preventDefault()
  confirmNavigate('free', sandboxHref)
}

// A back/forward-cache restore brings the page back with `confirming` still set, which freezes
// the buttons; clear it so they work again.
function onPageShow(e: PageTransitionEvent) {
  if (e.persisted)
    confirming.value = null
}
onMounted(() => window.addEventListener('pageshow', onPageShow))
onBeforeUnmount(() => window.removeEventListener('pageshow', onPageShow))
</script>

<template>
  <div class="entry">
    <SettingsMenu class="settings-menu--corner" />

    <div class="entry__stage">
      <header class="entry__brand">
        <Logo size="lg" />
        <Tagline class="entry__sub" />
      </header>

      <div
        class="entry__wall"
        role="img"
        aria-label="A pixelated Mona Lisa, labelled leonardo, four years, hung beside a player's clumsy redraw, labelled you, two minutes"
        :style="{ '--art-ratio': artRatio }"
      >
        <figure class="entry__piece entry__piece--original">
          <div class="art-frame">
            <PixelThumb class="art-surface" v-bind="HERO_ORIGINAL" />
          </div>
          <figcaption class="entry__placard">
            leonardo, four years
          </figcaption>
        </figure>
        <figure class="entry__piece entry__piece--attempt">
          <div class="art-frame">
            <PixelThumb class="art-surface" v-bind="HERO_ATTEMPT" />
          </div>
          <figcaption class="entry__placard">
            probably yours, two minutes
          </figcaption>
        </figure>
      </div>

      <div class="entry__actions">
        <!-- `create=1` lets the room route open a room that doesn't exist yet. -->
        <Door
          title="Start a new game"
          sub="you're the GM, friends join with your code"
          :busy="confirming === 'create'"
          :aria-label="confirming === 'create' ? 'Creating room' : undefined"
          @click="confirmNavigate('create', roomHref(wordPair(), { create: true }))"
        >
          <template #icon>
            <Play :size="22" aria-hidden="true" />
          </template>
        </Door>

        <JoinForm
          v-model:code="code"
          :busy="confirming === 'join'"
          @join="(room, since) => confirmNavigate('join', roomHref(room), since)"
        />

        <a
          class="entry__free"
          :class="{ 'entry__free--busy': confirming === 'free' }"
          :href="sandboxHref"
          :aria-label="confirming === 'free' ? 'Opening Free mode' : undefined"
          @click="enterSandbox"
        >
          Practise on your own in Free mode
          <ArrowRight class="entry__free-arrow" :size="16" aria-hidden="true" />
        </a>
      </div>
    </div>
  </div>
</template>
