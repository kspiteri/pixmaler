<script setup lang="ts">
// A player, shown: their seat chip and their name, together. Four sites render
// this pairing — the lobby roster, the "waiting for X" line, and both halves of
// the results screen — and each was repeating the chip's five lines of class,
// custom property and `aria-hidden` plumbing.
//
// **The pairing is the point, not just the saved lines.** The chip is
// `aria-hidden` at every site *because* a name is always beside it; that
// invariant used to be re-asserted in four separate comments and is now held in
// one place, by construction. A chip on its own would need a different component
// with a real accessible name — don't add a `showName` flag here to fake it.
//
// `size` is the **chip's** size, not the name's: `row` for the 28px roster chip
// that anchors a list item, `inline` for the 20px one that sits in a sentence.
// The name deliberately inherits its font-size and weight from the host, because
// those legitimately differ per site (1.25rem on the winner, 0.875rem in the
// roster and gallery, 1rem in the waiting line). What this component *does* own
// is the family: names are the most human content on screen, so they all use the
// display face now rather than three of four falling back to body.

import type { Seat } from '../lib/seats'

withDefaults(defineProps<{
  seat: Seat
  name: string
  // Chip size. `row` anchors a list row; `inline` sits inside running text.
  size?: 'row' | 'inline'
  // Clip the name to one line with an ellipsis — the results gallery, where the
  // card is a fixed grid cell and a long name would otherwise wrap it taller
  // than its neighbours.
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
