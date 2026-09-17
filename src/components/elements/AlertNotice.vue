<script setup lang="ts">
// The alert register's non-blocking surface (see `_alerts.scss`), in two roles:
//   dismissable — a self-clearing nudge that blocks nothing (blank-canvas warn, round cancelled).
//   non-dismissable — live state the host shows and hides (connection loss); a dismiss control
//   would only lose information, since the player can't change what it reports.
// `AlertDialog` is the blocking rung above this. Placement is the host's job — `Drawing.vue`
// overlays it because `.phase--fixed` has no height to spare; pass positioning through `class`,
// which lands on the root.

import { X } from '@lucide/vue'
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  // Severity sets the ink colour and the politeness together: only `error` interrupts, the
  // rest wait their turn. `success` is deliberately absent — no consumer and no colour token yet.
  variant?: 'info' | 'warn' | 'error'
  // Non-dismissable notices report host-controlled state, so they carry no dismiss control.
  dismissable?: boolean
}>(), { variant: 'warn', dismissable: true })

const emit = defineEmits<{
  dismiss: []
}>()

// Politeness follows severity — the a11y half of the variant, so no caller passes it by hand.
const live = computed(() => (props.variant === 'error' ? 'alert' : 'status'))

const dismissed = ref(false)

function dismiss() {
  if (!props.dismissable || dismissed.value)
    return
  dismissed.value = true
  emit('dismiss')
}
</script>

<template>
  <!-- Clicking anywhere dismisses, not just the ✕ — a no-op when non-dismissable. -->
  <div
    v-if="!dismissed"
    class="notice"
    :class="[`notice--${variant}`, { 'notice--static': !dismissable }]"
    :role="live"
    @click="dismiss"
  >
    <slot name="icon" />
    <span class="notice__msg"><slot /></span>
    <button
      v-if="dismissable"
      class="notice__dismiss"
      type="button"
      aria-label="Dismiss"
      @click.stop="dismiss"
    >
      <X :size="14" aria-hidden="true" />
    </button>
  </div>
</template>
