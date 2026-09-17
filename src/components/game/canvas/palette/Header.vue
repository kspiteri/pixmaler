<script setup lang="ts">
// The tools-panel header strip. Desktop: a drag handle (grip shown when the panel floats)
// carrying the size and placement (float / side / bottom) controls. The drag is owned by the parent
// (useDraggable on the panel), so the handle only forwards pointerdown. Mobile: a static
// header with the wordmark + size and no placement control (#59).

import { GripVertical } from '@lucide/vue'
import PlacementControl from './PlacementControl.vue'
import SizeControl from './SizeControl.vue'

defineProps<{
  isMobile: boolean
  // Floating on a fine pointer — the parent's rule; drives the grip and the drag affordance.
  canDrag: boolean
}>()

const emit = defineEmits<{
  // Pointerdown on the drag handle; the parent starts the drag (it owns useDraggable).
  handleDown: [e: PointerEvent]
}>()
</script>

<template>
  <div v-if="isMobile" class="tools-panel__mobile-head">
    <span class="tools-panel__label">palette</span>
    <SizeControl />
  </div>

  <div
    v-else
    class="tools-panel__handle"
    :class="{ 'tools-panel__handle--static': !canDrag }"
    :title="canDrag ? 'Drag to move' : undefined"
    @pointerdown="emit('handleDown', $event)"
  >
    <span v-if="canDrag" class="tools-panel__grip"><GripVertical :size="16" /></span>
    <SizeControl />
    <PlacementControl />
  </div>
</template>
