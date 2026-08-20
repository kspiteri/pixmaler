<script setup lang="ts">
// Entry screen — pre-room landing. Create / join / open the paint sandbox.

import { ref } from 'vue'
import Logo from '../components/Logo.vue'
import Tagline from '../components/Tagline.vue'
import { wordPair } from '../lib/words'

const name = ref(localStorage.getItem('pixmaler:name') ?? '')
const code = ref('')

// Strip any trailing "index.html" so BASE_URL ("/pixmaler/") prefixes /paint
// correctly in dev and prod alike.
const base = import.meta.env.BASE_URL.replace(/\/+$/, '')
const sandboxHref = `${base}/paint`

// The guard is belt-and-braces: both buttons are already `:disabled` until
// their fields are filled, so it can't actually fire.
function enterRoom(room: string) {
  const trimmed = name.value.trim()
  if (!trimmed || !room)
    return
  localStorage.setItem('pixmaler:name', trimmed)
  location.href = `${location.pathname}?room=${room}`
}
</script>

<template>
  <div class="entry">
    <!-- Wordmark -->
    <header class="entry__brand">
      <Logo size="lg" />
      <Tagline class="entry__sub" />
    </header>

    <!-- Form -->
    <div class="entry__form">
      <label class="field">
        <span class="label">Your name</span>
        <input
          v-model="name"
          class="input"
          maxlength="24"
          type="text"
        >
      </label>

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

      <label class="field">
        <span class="label">Room code</span>
        <input
          v-model="code"
          class="input"
          type="text"
          placeholder="e.g. feral-crayon"
        >
      </label>

      <button
        class="btn btn--ghost"
        type="button"
        :disabled="!name.trim() || !code.trim()"
        @click="enterRoom(code.trim().toLowerCase())"
      >
        Join room
      </button>

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
  </div>
</template>
