<script setup lang="ts">
// The seat chip: seat colour, silhouette and the player's generated face, with the initial
// standing in until the face generator loads. Always `aria-hidden` — every consumer names
// the player beside it or labels the control it sits in.

import type { AvatarShape } from '@/lib'
import { computed } from 'vue'
import { faceMask, loadFaces } from '@/lib'

const props = withDefaults(defineProps<{
  shape: AvatarShape
  initial: string
  seed: string
  // Unset (no seat yet) falls back to $avatar-blank.
  colour?: string
  lean?: number
  small?: boolean
}>(), { small: false })

void loadFaces()
const mask = computed(() => faceMask(props.seed))
</script>

<template>
  <span
    class="avatar"
    :class="[`avatar--${shape}`, { 'avatar--sm': small }]"
    :style="{ '--seat-colour': colour, '--seat-lean': lean }"
    aria-hidden="true"
  >
    <span v-if="mask" class="avatar__face" :style="{ maskImage: mask }" />
    <template v-else>{{ initial }}</template>
  </span>
</template>
