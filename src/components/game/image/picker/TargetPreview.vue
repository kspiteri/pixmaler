<script setup lang="ts">
// Target preview — the persistent view of what players will redraw: the live pixel canvas, its
// dimensions, the mobile-grid warning, and the derived palette. Owns its `PixelCanvas` mount
// (rebuilt whenever a new result lands) rather than the parent appending one imperatively.

import type { PipelineResult } from '@/lib'
import { TriangleAlert } from '@lucide/vue'
import { useTemplateRef, watch } from 'vue'
import { PixelCanvas } from '@/lib'

const props = defineProps<{ result: PipelineResult | null, busy: boolean, warn: boolean }>()

const slot = useTemplateRef<HTMLDivElement>('slot')

watch(
  () => props.result,
  (r) => {
    if (!r || !slot.value)
      return
    const pc = new PixelCanvas({
      gridW: r.gridW,
      gridH: r.gridH,
      palette: r.palette,
      targetGrid: r.targetGrid,
      editable: false,
    })
    pc.canvas.style.maxWidth = '160px'
    pc.canvas.style.height = 'auto'
    slot.value.replaceChildren(pc.canvas)
  },
  { flush: 'post' },
)
</script>

<template>
  <div class="picker__preview-area">
    <p class="picker__preview-label">
      {{ result ? `Target ${result.gridW}×${result.gridH}` : 'pick an image to preview' }}
    </p>
    <div ref="slot" class="picker__preview" :class="{ 'is-busy': busy }" />

    <!-- Polite, not role="alert": this re-fires on every reprocess, and an assertive live region
         would interrupt each pass. -->
    <p v-if="warn" class="picker__warn" role="status">
      <TriangleAlert :size="16" />
      <span>Grid exceeds 64px on its longest side; mobile players may struggle.</span>
    </p>

    <template v-if="result?.palette.length">
      <span class="picker__palette-label">palette</span>
      <ul class="picker__palette" aria-label="Derived palette">
        <li
          v-for="(hex, i) in result.palette"
          :key="`${hex}-${i}`"
          class="picker__swatch"
          :style="{ background: hex }"
          :title="hex"
        />
      </ul>
    </template>
  </div>
</template>
