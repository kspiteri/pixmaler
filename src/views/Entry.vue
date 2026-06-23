<script setup lang="ts">
// Entry screen — pre-room landing. Create / join / open the paint sandbox.

import { ref } from 'vue'
import { wordPair } from '../lib/words'

const name = ref(localStorage.getItem('pixmaler:name') ?? '')
const code = ref('')

// Strip any trailing "index.html" so BASE_URL ("/pixmaler/") prefixes /paint
// correctly in dev and prod alike.
const base = import.meta.env.BASE_URL.replace(/\/+$/, '')
const sandboxHref = `${base}/paint`

function createRoom() {
  const trimmed = name.value.trim()
  if (!trimmed) { alert('Enter your name first.'); return }
  localStorage.setItem('pixmaler:name', trimmed)
  location.href = `${location.pathname}?room=${wordPair()}`
}

function joinRoom() {
  const trimmed = name.value.trim()
  const room = code.value.trim().toLowerCase()
  if (!trimmed) { alert('Enter your name first.'); return }
  if (!room) { alert('Enter a room code.'); return }
  localStorage.setItem('pixmaler:name', trimmed)
  location.href = `${location.pathname}?room=${room}`
}
</script>

<template>
  <div class="entry">
    <!-- Subtle pixel-grid background texture -->
    <div class="entry__grid" aria-hidden="true" />

    <!-- Wordmark -->
    <header class="entry__brand">
      <div class="wordmark">
        <h1 class="logo">
          <span class="logo__pix">PIX</span><span class="logo__maler">MALER</span>
        </h1>
        <svg class="mark" width="32" height="32" viewBox="0 0 4 4">
          <rect x="0" y="0" width="2" height="2" fill="#c8ff2d" />
          <rect x="2" y="0" width="2" height="2" fill="#7c5cff" />
          <rect x="0" y="2" width="2" height="2" fill="#ff5ca8" />
          <rect x="2" y="2" width="2" height="2" fill="#ff8c00" />
        </svg>
      </div>
    </header>

    <!-- Form -->
    <div class="entry__form">
      <label class="field">
        <span class="label">Your name</span>
        <input
          v-model="name"
          class="input"
          type="text"
          placeholder="e.g. Keith"
        >
      </label>

      <button
        class="btn btn--primary"
        type="button"
        :disabled="!name.trim()"
        @click="createRoom"
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
        @click="joinRoom"
      >
        Join room
      </button>

      <a class="entry__sandbox" :href="sandboxHref">Or open the Paint sandbox →</a>
    </div>
  </div>
</template>
