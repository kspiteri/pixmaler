<script setup lang="ts">
// Entry screen — pre-room landing. Create / join / open the paint sandbox.

import { ref } from 'vue'
import Logo from '../components/Logo.vue'
import NameField from '../components/NameField.vue'
import SettingsMenu from '../components/SettingsMenu.vue'
import Tagline from '../components/Tagline.vue'
import { appHref, getName, setName, wordPair } from '../lib'

const name = ref(getName() ?? '')
const code = ref('')

const sandboxHref = appHref('paint')

// Belt-and-braces: both buttons are `:disabled` until their fields are filled.
function enterRoom(room: string) {
  const trimmed = name.value.trim()
  if (!trimmed || !room)
    return
  setName(trimmed)
  location.href = `${location.pathname}?room=${room}`
}
</script>

<template>
  <div class="entry">
    <SettingsMenu class="settings-menu--corner" />
    <!-- Wordmark -->
    <header class="entry__brand">
      <Logo size="lg" />
      <Tagline class="entry__sub" />
    </header>

    <!-- Form -->
    <div class="entry__form">
      <NameField v-model="name" label="Your name" />

      <button
        class="btn btn--primary"
        type="button"
        :disabled="!name.trim()"
        @click="enterRoom(wordPair())"
      >
        Create room (GM)
      </button>

      <div class="entry__divider">
        <span class="entry__rule" />
        <span class="entry__divider-text">or join existing</span>
        <span class="entry__rule" />
      </div>

      <div class="entry__join">
        <label class="field entry__join-field">
          <span class="label">Room code</span>
          <input
            v-model="code"
            class="input"
            type="text"
            placeholder="e.g. feral-crayon"
          >
        </label>

        <button
          class="btn btn--ghost entry__join-btn"
          type="button"
          :disabled="!name.trim() || !code.trim()"
          @click="enterRoom(code.trim().toLowerCase())"
        >
          Join room
        </button>
      </div>

      <div class="entry__divider">
        <span class="entry__rule" />
        <span class="entry__divider-text">or practice without a timer</span>
        <span class="entry__rule" />
      </div>

      <a
        class="btn btn--ghost entry__sandbox"
        type="button"
        :href="sandboxHref"
      >
        Free Mode
      </a>
    </div>

    <details class="entry__privacy">
      <summary>your privacy and what is stored</summary>
      <div class="entry__privacy-body">
        <p>Pixmaler keeps a nickname you choose, a randomly generated id, and other settings. All stored in your own browser.</p>
        <ul>
          <li>
            Your nickname, random id and avatar are sent to the game server and held in memory only
            while a room is live; they're wiped when it goes idle or the session is closed by the GM.
          </li>
          <li>
            Settings include your dark/light theme preference, text size, your palette preferences and
            whether or not you have canvas shortcuts enabled.
          </li>
          <li>Nothing is stored in a database, no cookies, no analytics and no third parties.</li>
        </ul>
        <p>
          A nickname is all the game needs. You can clear everything from the settings menu,
          top right, at any time.
        </p>
      </div>
    </details>
  </div>
</template>
