<script setup lang="ts">
// Entry screen — pre-room landing: start a game, join one by code, or open the paint sandbox.
// It asks no name; the room route's NameGate does when none is stored. Owns the one in-flight
// navigation, so only one action can confirm at a time; its parts live in `entry/`.

import { ChevronRight, KeyRound, Palette, Play } from '@lucide/vue'
import { nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import Button from '@/components/elements/Button.vue'
import Logo from '@/components/elements/Logo.vue'
import Tagline from '@/components/elements/Tagline.vue'
import SettingsMenu from '@/components/layout/SettingsMenu.vue'
import { appHref, roomHref, wordPair } from '@/lib'
import Door from './entry/Door.vue'
import JoinForm from './entry/JoinForm.vue'

type Action = 'create' | 'join' | 'free'

const codeDoor = useTemplateRef<InstanceType<typeof Door>>('codeDoor')

const joining = ref(false)
// Lives here, not in JoinForm, so a typed code survives Back.
const code = ref('')
// Which action is mid-confirm, or null. Drives that control's label → icon morph.
const confirming = ref<Action | null>(null)

const sandboxHref = appHref('paint')

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

async function closeJoin() {
  joining.value = false
  await nextTick()
  codeDoor.value?.focus()
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
      <header class="entry__hero">
        <Logo size="lg" />
        <Tagline class="entry__sub" />
      </header>

      <div class="entry__panel">
        <div class="entry__form">
          <div v-if="!joining" class="entry__step">
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

            <Door
              ref="codeDoor"
              title="I have a code"
              sub="join a game someone else started"
              @click="joining = true"
            >
              <template #icon>
                <KeyRound :size="22" aria-hidden="true" />
              </template>
              <template #trailing>
                <ChevronRight :size="20" aria-hidden="true" />
              </template>
            </Door>
          </div>

          <JoinForm
            v-else
            v-model:code="code"
            :busy="confirming === 'join'"
            @back="closeJoin"
            @join="(room, since) => confirmNavigate('join', roomHref(room), since)"
          />

          <div class="entry__divider">
            <span class="entry__rule" />
            <span class="entry__divider-text">or practice without a timer</span>
            <span class="entry__rule" />
          </div>

          <Button
            variant="subtle"
            size="small"
            class="entry__free"
            :href="sandboxHref"
            :aria-label="confirming === 'free' ? 'Opening free mode' : undefined"
            @click="enterSandbox"
          >
            <span class="entry__morph" :class="{ 'entry__morph--active': confirming === 'free' }">
              <span class="entry__morph-text">Free mode</span>
              <Palette class="entry__morph-icon" :size="16" aria-hidden="true" />
            </span>
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
