<script setup lang="ts">
// The drawing-tool switcher: a segmented group beside or above the size slider. Icon-only, so
// each item carries its own `aria-label`. Stops `pointerdown` so a click never starts a panel drag.

import type { Component } from 'vue'
import type { CanvasTool } from '@/lib'
import { Brush, PaintBucket, Pencil, SprayCan } from '@lucide/vue'
import { markRaw } from 'vue'
import { CANVAS_TOOLS, TOOL_LABELS } from '@/lib'

defineProps<{ modelValue: CanvasTool }>()
const emit = defineEmits<{ 'update:modelValue': [tool: CanvasTool] }>()

const ICONS: Record<CanvasTool, Component> = { pencil: markRaw(Pencil), brush: markRaw(Brush), fill: markRaw(PaintBucket), spray: markRaw(SprayCan) }
const TOOLS = CANVAS_TOOLS.map(id => ({ id, label: TOOL_LABELS[id], icon: ICONS[id] }))
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
