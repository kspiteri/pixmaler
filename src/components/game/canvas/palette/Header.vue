<script setup lang="ts">
// The tools-panel header strip. Desktop: a drag handle (grip shown when draggable) carrying
// the dock/float toggle and the S / M / L size control; the drag itself is owned by the parent
// (useDraggable on the panel), so the handle only forwards pointerdown. Mobile: a static
// header with the same size control and no drag.

import { GripVertical, Pin, PinOff } from '@lucide/vue'
import Button from '@/components/elements/Button.vue'
import { paletteDocked, setPaletteDocked } from '@/lib'
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
  <div
    v-if="!isMobile"
    class="tools-panel__handle"
    :title="canDrag ? 'Drag to move' : undefined"
    @pointerdown="emit('handleDown', $event)"
  >
    <span v-if="canDrag" class="tools-panel__grip"><GripVertical :size="16" /></span>
    <span class="tools-panel__label">palette</span>
    <!-- Dock / float toggle. pointerdown stopped so it doesn't start a drag. -->
    <Button
      variant="subtle"
      icon
      size="x-small"
      class="tools-panel__dock"
      :title="paletteDocked ? 'Float palette' : 'Dock palette to the side'"
      :aria-label="paletteDocked ? 'Float palette' : 'Dock palette'"
      @pointerdown.stop
      @click="setPaletteDocked(!paletteDocked)"
    >
      <template #icon>
        <PinOff v-if="paletteDocked" :size="14" />
        <Pin v-else :size="14" />
      </template>
    </Button>
    <SizeControl />
  </div>

  <!-- Mobile has no drag handle, so the size control gets a static header strip. -->
  <div v-else class="tools-panel__mobile-head">
    <span class="tools-panel__label">palette</span>
    <SizeControl />
  </div>
</template>
