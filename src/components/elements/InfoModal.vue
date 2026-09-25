<script setup lang="ts">
// The global info modal — the Credits attribution and the privacy notice, the app's two info
// surfaces. Opened from the settings menu (and Entry's privacy link); `activeInfo` in
// `lib/infoModal.ts` picks which content shows. App mounts this once via `v-if`, so `showModal`
// on mount is the whole gate. CC-BY needs a visible, findable credit (incompetech's FAQ); the
// privacy notice is a data-minimisation nudge (#44).

import { onMounted, useTemplateRef } from 'vue'
import { activeInfo, closeInfo, MUSIC_TRACKS } from '@/lib'
import Button from './Button.vue'

const dialogEl = useTemplateRef<HTMLDialogElement>('dialogEl')
const musicTitles = MUSIC_TRACKS.map(t => `"${t.label}"`).join(', ')

onMounted(() => dialogEl.value?.showModal())
</script>

<template>
  <dialog
    ref="dialogEl"
    class="info-modal"
    :aria-label="activeInfo === 'privacy' ? 'Your privacy' : 'Credits'"
    @cancel.prevent="closeInfo"
    @click.self="closeInfo"
  >
    <template v-if="activeInfo === 'privacy'">
      <h2 class="info-modal__title">
        Your privacy
      </h2>
      <div class="info-modal__section">
        <p>
          Pixmaler keeps a nickname you choose, a randomly generated id, your settings, and (in
          Free mode) your picture and drawing. All stored in your own browser.
        </p>
        <ul>
          <li>
            Your nickname, random id and avatar are sent to the game server and held in memory only
            while a room is live; they're wiped when it goes idle or the session is closed by the GM.
          </li>
          <li>
            Settings include your dark/light theme preference, text size, your palette preferences
            and whether you have canvas shortcuts enabled.
          </li>
          <li>
            In Free mode, the pixelated picture you chose and your drawing are stored in this
            browser, so your work is waiting when you return; it never leaves your device.
          </li>
          <li>Nothing is stored in a database, no cookies, no analytics and no third parties.</li>
        </ul>
        <p>
          A nickname is all the game needs. You can clear everything from the settings menu, top
          right, at any time.
        </p>
      </div>
    </template>

    <template v-else>
      <h2 class="info-modal__title">
        Credits
      </h2>
      <section class="info-modal__section">
        <h3 class="info-modal__heading">
          Music
        </h3>
        <p>{{ musicTitles }}</p>
        <p>Kevin MacLeod (<a href="https://incompetech.com" target="_blank" rel="noopener">incompetech.com</a>)</p>
        <p>Licensed under Creative Commons: By Attribution 4.0</p>
        <p>
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">
            creativecommons.org/licenses/by/4.0/
          </a>
        </p>
      </section>
    </template>

    <Button autofocus variant="secondary" size="small" @click="closeInfo">
      Close
    </Button>
  </dialog>
</template>
