<script setup lang="ts">
// Gallery section: PlayerTag across all avatar shapes, sizes and the truncate variant. One
// seat per shape so colour, initial, shape and lean all show. Layout via the parent's :deep().

import PlayerTag from '@/components/elements/PlayerTag.vue'
import { AVATAR_SHAPES, seatFor } from '@/lib'

const tagNames = ['Mara', 'Bo', 'Cleo', 'Dag', 'Eve', 'Fox']
const shapeSeats = AVATAR_SHAPES.map((shape, i) => {
  const player = { name: tagNames[i] ?? shape, shape }
  return { ...player, seat: seatFor(i, player)! }
})
</script>

<template>
  <div>
    <section class="demo__section">
      <h4 class="demo__heading">
        shapes (row, 28px)
      </h4>
      <div class="demo__row">
        <PlayerTag v-for="s in shapeSeats" :key="s.shape" :seat="s.seat" :name="s.name" size="row" />
      </div>
    </section>

    <section class="demo__section">
      <h4 class="demo__heading">
        inline (20px, in running text)
      </h4>
      <p class="demo__note">
        waiting for <PlayerTag :seat="shapeSeats[0].seat" :name="shapeSeats[0].name" /> to finish…
      </p>
    </section>

    <section class="demo__section">
      <h4 class="demo__heading">
        truncate (fixed cell)
      </h4>
      <div class="demo__narrow">
        <PlayerTag :seat="shapeSeats[2].seat" name="A very long display name that overflows" truncate />
      </div>
    </section>
  </div>
</template>
