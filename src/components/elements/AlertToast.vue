<script setup lang="ts">
// The alert register's non-blocking surface, its third member (see `_alerts.scss`):
//   `.conn-banner`: live connection state; never dismissable.
//   `AlertToast`: a self-clearing nudge; dismissable, blocks nothing.
//   `AlertDialog`: blocks until answered.
// Placement is the host's job. `Drawing.vue` overlays it because `.phase--fixed` has no
// height to spare. Pass positioning through `class`, which lands on the root.

import { X } from '@lucide/vue'
import { ref } from 'vue'

withDefaults(defineProps<{
  // `status` announces politely and waits its turn; `alert` interrupts. Default polite.
  live?: 'status' | 'alert'
}>(), { live: 'status' })

const emit = defineEmits<{
  dismiss: []
}>()

const dismissed = ref(false)

function dismiss() {
  if (dismissed.value)
    return
  dismissed.value = true
  emit('dismiss')
}
</script>

<template>
  <!-- Clicking anywhere dismisses, not just the ✕ -->
  <div
    v-if="!dismissed"
    class="toast"
    :role="live"
    @click="dismiss"
  >
    <slot name="icon" />
    <span class="toast__msg"><slot /></span>
    <button
      class="toast__dismiss"
      type="button"
      aria-label="Dismiss"
      @click.stop="dismiss"
    >
      <X :size="14" aria-hidden="true" />
    </button>
  </div>
</template>
