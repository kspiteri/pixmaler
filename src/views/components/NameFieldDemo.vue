<script setup lang="ts">
// Gallery section: the display-name field with its avatar preview and shape picker, plus a
// live value readout.

import type { AvatarShape } from '@/lib'
import { ref } from 'vue'
import NameField from '@/components/elements/NameField.vue'
import { DEFAULT_AVATAR_SHAPE } from '@/lib'

const name = ref('')
const shape = ref<AvatarShape>(DEFAULT_AVATAR_SHAPE)
</script>

<template>
  <section class="demo__section">
    <div class="demo__stack">
      <NameField v-model="name" v-model:shape="shape" label="Your name" seed="demo-name-field" colour="var(--player-colour-4)" />
      <span class="demo__note">value: {{ name || '(empty)' }} · shape: {{ shape }}</span>
    </div>
  </section>
</template>
