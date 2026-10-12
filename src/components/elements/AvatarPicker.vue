<script setup lang="ts">
// Avatar shape picker: one button per shape, each previewing the player's own chip.

import type { AvatarShape } from '@/lib'
import { AVATAR_SHAPES, shapeLabel } from '@/lib'
import Avatar from './Avatar.vue'

defineProps<{
  initial: string
  seed: string
  colour?: string
}>()
const shape = defineModel<AvatarShape>({ required: true })
</script>

<template>
  <div class="avatar-picker" role="group" aria-label="Avatar shape">
    <button
      v-for="s in AVATAR_SHAPES"
      :key="s"
      class="avatar-picker__btn pressable no-shadow"
      type="button"
      :aria-pressed="s === shape"
      :aria-label="shapeLabel(s)"
      :title="shapeLabel(s)"
      @click="shape = s"
    >
      <Avatar :shape="s" :initial="initial" :seed="seed" :colour="colour" />
    </button>
  </div>
</template>
