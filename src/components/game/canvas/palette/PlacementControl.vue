<script setup lang="ts">
// The float / side / bottom placement control — a segmented group on the desktop tools-panel
// handle, replacing the old Pin toggle (#59). Reads/writes the persisted `palettePlacement`.
// Icon-only, so each item carries its own `aria-label`. Stops `pointerdown` so a placement
// click never starts a panel drag.

import type { PalettePlacement } from '@/lib'
import { PanelBottom, PanelRight, PictureInPicture2 } from '@lucide/vue'
import { palettePlacement, setPalettePlacement } from '@/lib'

const PLACEMENTS: { id: PalettePlacement, label: string, icon: typeof PanelRight }[] = [
  { id: 'float', label: 'Float', icon: PictureInPicture2 },
  { id: 'side', label: 'Dock to side', icon: PanelRight },
  { id: 'bottom', label: 'Dock to bottom', icon: PanelBottom },
]
</script>

<template>
  <div class="segmented" role="group" aria-label="Palette placement" @pointerdown.stop>
    <button
      v-for="p in PLACEMENTS"
      :key="p.id"
      class="segmented__item"
      :class="{ 'segmented__item--active': palettePlacement === p.id }"
      type="button"
      :aria-label="p.label"
      :aria-pressed="palettePlacement === p.id"
      :title="p.label"
      @click="setPalettePlacement(p.id)"
    >
      <component :is="p.icon" :size="14" aria-hidden="true" />
    </button>
  </div>
</template>
