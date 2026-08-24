<script setup lang="ts">
// The alert register's non-blocking surface, and its third member — see
// `_alerts.scss` for why the three share a stylesheet.
//
// The register in one line each:
//   `.conn-banner`  live connection state. Never dismissable: it reports something
//                   the user cannot change, so hiding it would only lose information.
//   `AlertToast`    a self-clearing nudge. Dismissable, blocks nothing.
//   `AlertDialog`   blocks until answered.
//
// Placement is the host's job, not this component's — the host is what knows its own
// layout budget. `Drawing.vue` overlays it because `.phase--fixed` has no height to
// spare. Pass positioning through `class`, which lands on the root.

import { X } from '@lucide/vue'
import { ref } from 'vue'

withDefaults(defineProps<{
  // `status` announces politely and waits its turn; `alert` interrupts. Default
  // polite, because a toast that interrupts a screen reader is a dialog wearing the
  // wrong hat.
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
  <!-- Clicking anywhere dismisses, not just the ✕. On a phone a precise 14 px target
       is a worse deal than a full-width one, and the toast only exists while it has
       something to say — so the tap that removes it is never a tap the user wanted to
       spend elsewhere.

       The trade, recorded because it reverses an earlier decision: the root now takes
       pointer events, so over a canvas it can swallow the *start* of a stroke. That
       costs one tap, and that same tap clears the obstruction. `pointer-events: none`
       with an ✕-only hit area avoided the cost but made dismissal fiddly exactly where
       it matters most.

       The ✕ is a real <button> so the toast is reachable and dismissable by keyboard;
       the click handler on the root is pointer convenience layered on top. -->
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
