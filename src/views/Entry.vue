<script setup lang="ts">
// Entry screen — pre-room landing. Create / join / open the paint sandbox.

import { Play } from '@lucide/vue'
import { ref } from 'vue'
import Button from '@/components/elements/Button.vue'
import Logo from '@/components/elements/Logo.vue'
import NameField from '@/components/elements/NameField.vue'
import Tagline from '@/components/elements/Tagline.vue'
import SettingsMenu from '@/components/layout/SettingsMenu.vue'
import { appHref, getName, roomHref, sanitiseName, setName, wordPair } from '@/lib'

const name = ref(getName() ?? '')
const code = ref('')

const sandboxHref = appHref('paint')

// Belt-and-braces: both buttons are `:disabled` until their fields are filled. A create
// carries `&create=1` so the room route opens the room; a join omits it and 404s if the
// code isn't a live room (#66).
function enterRoom(room: string, create = false) {
  const trimmed = sanitiseName(name.value)
  if (!trimmed || !room)
    return
  setName(trimmed)
  location.href = roomHref(room, { create })
}
</script>

<template>
  <div class="entry">
    <SettingsMenu class="settings-menu--corner" />

    <div class="entry__stage">
      <header class="entry__hero">
        <Logo size="lg" />
        <Tagline class="entry__sub" />

        <details class="entry__privacy">
          <summary>your privacy and what is stored</summary>
          <div class="entry__privacy-body">
            <p>
              Pixmaler keeps a nickname you choose, a randomly generated id, your settings,
              and (in Free mode) your picture and drawing. All stored in your own browser.
            </p>
            <ul>
              <li>
                Your nickname, random id and avatar are sent to the game server and held in memory only
                while a room is live; they're wiped when it goes idle or the session is closed by the GM.
              </li>
              <li>
                Settings include your dark/light theme preference, text size, your palette preferences and
                whether you have canvas shortcuts enabled.
              </li>
              <li>
                In Free mode, the pixelated picture you chose and your drawing are stored in this browser,
                so your work is waiting when you return; it never leaves your device.
              </li>
              <li>Nothing is stored in a database, no cookies, no analytics and no third parties.</li>
            </ul>
            <p>
              A nickname is all the game needs. You can clear everything from the settings menu,
              top right, at any time.
            </p>
          </div>
        </details>
      </header>

      <div class="entry__panel">
        <div class="entry__form">
          <NameField v-model="name" label="Your name" />

          <Button
            variant="primary"
            size="large"
            :disabled="!name.trim()"
            @click="enterRoom(wordPair(), true)"
          >
            <template #icon>
              <Play :size="20" aria-hidden="true" />
            </template>
            Create room (GM)
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
              @click="enterRoom(code.trim().toLowerCase())"
            >
              Join room
            </Button>
          </div>

          <div class="entry__divider">
            <span class="entry__rule" />
            <span class="entry__divider-text">or practice without a timer</span>
            <span class="entry__rule" />
          </div>

          <Button variant="secondary" class="entry__sandbox" :href="sandboxHref">
            Free mode
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
