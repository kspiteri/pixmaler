<script setup lang="ts">
// Entry screen — pre-room landing. Create / join / open the paint sandbox.

import { ArrowRight, CircleCheck, Palette, Play } from '@lucide/vue'
import { ref } from 'vue'
import Button from '@/components/elements/Button.vue'
import Logo from '@/components/elements/Logo.vue'
import NameField from '@/components/elements/NameField.vue'
import Tagline from '@/components/elements/Tagline.vue'
import SettingsMenu from '@/components/layout/SettingsMenu.vue'
import { appHref, getName, roomHref, sanitiseName, setName, wordPair } from '@/lib'

type Action = 'create' | 'join' | 'free'

const name = ref(getName() ?? '')
const code = ref('')
// Which action is mid-confirm, or null. Drives the button's label → icon morph.
const confirming = ref<Action | null>(null)

const sandboxHref = appHref('paint')

// The confirm morph (label → icon) plays for this long before the full-page navigation unloads
// the page; on create it also covers the press ding. Independent of audio, so it holds when muted.
const CONFIRM_MS = 420

// Every entry action ends in a full-page navigation: confirm with the morph, then go.
function confirmNavigate(action: Action, href: string) {
  if (confirming.value)
    return
  confirming.value = action
  setTimeout(() => {
    location.href = href
  }, CONFIRM_MS)
}

// Both buttons are `:disabled` until their fields are filled. A create carries `&create=1` so the
// room route opens the room; a join omits it and 404s if the code isn't a live room (#66).
function enterRoom(room: string, create = false) {
  const trimmed = sanitiseName(name.value)
  if (!trimmed || !room)
    return
  setName(trimmed)
  confirmNavigate(create ? 'create' : 'join', roomHref(room, { create }))
}

// Free mode is a real route (an <a>), so honour modified clicks (open in a new tab); a plain
// click gets the confirm morph before navigating.
function enterSandbox(e: MouseEvent) {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)
    return
  e.preventDefault()
  confirmNavigate('free', sandboxHref)
}
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
          <NameField v-model="name" label="Your name" />

          <Button
            variant="primary"
            size="large"
            :disabled="!name.trim()"
            :aria-label="confirming === 'create' ? 'Creating room' : undefined"
            @click="enterRoom(wordPair(), true)"
          >
            <template v-if="confirming !== 'create'" #icon>
              <Play :size="20" aria-hidden="true" />
            </template>
            <span class="entry__morph" :class="{ 'entry__morph--active': confirming === 'create' }">
              <span class="entry__morph-text">Create room (GM)</span>
              <CircleCheck class="entry__morph-icon" :size="22" aria-hidden="true" />
            </span>
          </Button>

          <div class="entry__divider">
            <span class="entry__rule" />
            <span class="entry__divider-text">or join existing</span>
            <span class="entry__rule" />
          </div>

          <div class="entry__join">
            <div class="field entry__join-field">
              <label class="label" for="entry-room-code">Room code</label>
              <input
                id="entry-room-code"
                v-model="code"
                class="input"
                type="text"
                placeholder="e.g. feral-crayon"
              >
            </div>
            <Button
              variant="secondary"
              class="entry__join-btn"
              :disabled="!name.trim() || !code.trim()"
              :aria-label="confirming === 'join' ? 'Joining room' : undefined"
              @click="enterRoom(code.trim().toLowerCase())"
            >
              <span class="entry__morph" :class="{ 'entry__morph--active': confirming === 'join' }">
                <span class="entry__morph-text">Join room</span>
                <ArrowRight class="entry__morph-icon" :size="18" aria-hidden="true" />
              </span>
            </Button>
          </div>

          <div class="entry__divider">
            <span class="entry__rule" />
            <span class="entry__divider-text">or practice without a timer</span>
            <span class="entry__rule" />
          </div>

          <Button
            variant="secondary"
            class="entry__sandbox"
            :href="sandboxHref"
            :aria-label="confirming === 'free' ? 'Opening free mode' : undefined"
            @click="enterSandbox"
          >
            <span class="entry__morph" :class="{ 'entry__morph--active': confirming === 'free' }">
              <span class="entry__morph-text">Free mode</span>
              <Palette class="entry__morph-icon" :size="18" aria-hidden="true" />
            </span>
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
