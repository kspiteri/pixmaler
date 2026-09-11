<script setup lang="ts">
// A seat chip and a player's name, together. Four sites render this pairing (lobby roster,
// the "waiting for X" line, both halves of the results screen), all through this component.
// The chip is `aria-hidden` at every site because a name is always beside it — hold that
// by construction; don't add a `showName` flag to render a chip alone.
//
// `size` is the chip's size, not the name's: `row` for the 28px roster chip, `inline` for
// the 20px one in a sentence. The name inherits font-size and weight from the host (they
// differ per site); this component owns the family, so every name uses the display face.

import type { Seat } from '@/lib'

withDefaults(defineProps<{
  seat: Seat
  name: string
  // Chip size. `row` anchors a list row; `inline` sits inside running text.
  size?: 'row' | 'inline'
  // Clip the name to one line with an ellipsis — for the results gallery's fixed grid cells.
  truncate?: boolean
}>(), { size: 'inline', truncate: false })
</script>

<template>
  <span class="player-tag" :class="[`player-tag--${size}`, { 'player-tag--truncate': truncate }]">
    <span
      class="avatar"
      :class="[{ 'avatar--sm': size === 'inline' }, `avatar--${seat.shape}`]"
      :style="{ '--seat-colour': seat.colour, '--seat-lean': seat.lean }"
      aria-hidden="true"
    >{{ seat.initial }}</span>
    <span class="player-tag__name">{{ name }}<slot name="suffix" /></span>
  </span>
</template>
