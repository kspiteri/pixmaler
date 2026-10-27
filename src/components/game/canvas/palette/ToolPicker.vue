<script setup lang="ts">
// Pencil / Brush / Fill / Spray: a segmented group above the size slider. Icon-only, so each
// item carries its own `aria-label`. Stops `pointerdown` so a click never starts a panel drag.

import type { CanvasTool } from '@/lib'
import { Brush, PaintBucket, Pencil, SprayCan } from '@lucide/vue'

defineProps<{ modelValue: CanvasTool }>()
const emit = defineEmits<{ 'update:modelValue': [tool: CanvasTool] }>()

const TOOLS: { id: CanvasTool, label: string, icon: typeof Pencil }[] = [
  { id: 'pencil', label: 'Pencil', icon: Pencil },
  { id: 'brush', label: 'Brush', icon: Brush },
  { id: 'fill', label: 'Fill', icon: PaintBucket },
  { id: 'spray', label: 'Spray', icon: SprayCan },
]
</script>

<template>
  <div class="segmented tools-panel__tools" role="group" aria-label="Drawing tool" @pointerdown.stop>
    <button
      v-for="t in TOOLS"
      :key="t.id"
      class="segmented__item"
      :class="{ 'segmented__item--active': modelValue === t.id }"
      type="button"
      :aria-label="t.label"
      :aria-pressed="modelValue === t.id"
      :title="t.label"
      @click="emit('update:modelValue', t.id)"
    >
      <component :is="t.icon" :size="16" aria-hidden="true" />
    </button>
  </div>
</template>
