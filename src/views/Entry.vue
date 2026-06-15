<script setup lang="ts">
// Entry screen — pre-room landing. Create / join / open the paint sandbox.

import { uniqueNamesGenerator } from 'unique-names-generator'
import { ref } from 'vue'
import { adjectives, nouns } from '../lib/words'

const name = ref(localStorage.getItem('pixmaler:name') ?? '')
const code = ref('')

// Strip any trailing "index.html" so BASE_URL ("/pixmaler/") prefixes /paint
// correctly in dev and prod alike.
const base = import.meta.env.BASE_URL.replace(/\/+$/, '')
const sandboxHref = `${base}/paint`

function generateRoomCode(): string {
  return uniqueNamesGenerator({
    dictionaries: [adjectives, nouns],
    separator: '-',
    length: 2,
    style: 'lowerCase',
  })
}

function createRoom() {
  const trimmed = name.value.trim()
  if (!trimmed) { alert('Enter your name first.'); return }
  localStorage.setItem('pixmaler:name', trimmed)
  location.href = `${location.pathname}?room=${generateRoomCode()}`
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
  <div class="page page--narrow entry">
    <h1>Pixmaler</h1>
    <p class="entry__sub">
      pixel + <em>maler</em> (Norwegian: painter)
    </p>

    <label class="entry__field">
      Your name
      <input
        v-model="name"
        class="entry__input"
        type="text"
        placeholder="e.g. Keith"
      >
    </label>

    <button class="entry__btn" type="button" @click="createRoom">
      Create room (GM)
    </button>

    <hr>

    <label class="entry__field">
      Room code
      <input
        v-model="code"
        class="entry__input"
        type="text"
        placeholder="e.g. feral-crayon"
      >
    </label>

    <button class="entry__btn" type="button" @click="joinRoom">
      Join room
    </button>

    <a class="entry__sandbox" :href="sandboxHref">Or open the Paint sandbox →</a>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/tokens' as *;

.entry {
  &__sub {
    color: $muted;
  }
  &__field {
    display: block;
    margin-top: $gap-4;
  }
  &__input {
    display: block;
    margin-top: $gap-1;
    font-family: $font-mono;
  }
  &__btn {
    margin-top: $gap-3;
  }
  &__sandbox {
    display: block;
    margin-top: $gap-5;
    color: $muted;
  }
}
</style>
