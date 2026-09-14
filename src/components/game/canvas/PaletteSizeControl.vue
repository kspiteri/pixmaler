<script setup lang="ts">
// The S / M / L palette-size control — a segmented group used in both the desktop handle and
// the mobile header of the tools panel. Reads/writes the persisted `paletteSize`. Stops
// `pointerdown` so a size click never starts a panel drag (a no-op on mobile).

import type { PaletteSize } from '@/lib'
import { paletteSize, setPaletteSize } from '@/lib'

const SIZES: { id: PaletteSize, label: string }[] = [
  { id: 'sm', label: 'S' },
  { id: 'md', label: 'M' },
  { id: 'lg', label: 'L' },
]
</script>

<template>
  <div class="segmented" role="group" aria-label="Swatch size" @pointerdown.stop>
    <button
      v-for="s in SIZES"
      :key="s.id"
      class="segmented__item"
      :class="{ 'segmented__item--active': paletteSize === s.id }"
      type="button"
      :aria-pressed="paletteSize === s.id"
      @click="setPaletteSize(s.id)"
    >
      {{ s.label }}
    </button>
  </div>
</template>
