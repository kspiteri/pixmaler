<script setup lang="ts">
// Error boundary for the phase views. Without it, a render or watcher throw inside
// `Drawing.vue` or `Voting.vue` takes the view down to a blank screen mid-round while
// the round keeps running on the server - the player cannot see the canvas, cannot
// submit, and cannot tell whether the room still knows about them.
//
// The socket lives in `App.vue`, *above* this boundary, so a child throw never touches
// it: the seat is still held and the server already treats a reload as a reconnect
// (grids and votes are restored by `clientId`). That is why reloading is the only
// recovery offered - clearing the flag to re-render in place would just throw again on
// whatever state caused it, and would look like the blank screen this replaces.
import { onErrorCaptured, ref } from 'vue'

const failed = ref(false)

onErrorCaptured((err, _instance, info) => {
  failed.value = true

  // Returning false stops the error propagating, which also suppresses Vue's own
  // console logging - so this has to log, or a crash mid-game leaves no trace for
  // whoever is trying to reproduce it. `info` names the hook that threw.
  console.error(`[phase] error in ${info}`, err)
  return false
})

// `location` is not in Vue's template globals allowlist, so calling it inline would
// resolve against the render context and be undefined - a throw inside the fallback,
// which is the one place that must not fail. So it goes through a function, exactly as
// the session-closed screen's reload already does.
function reload() {
  location.reload()
}
</script>

<template>
  <!-- Deliberately plain markup: a fallback that renders child components or reads the
       state that just threw can fail the same way, and a boundary that crashes is worse
       than none. No logo, no props, no computeds - only static copy. -->
  <div v-if="failed" class="page page--narrow phase-error">
    <p class="label label--eyebrow">
      this screen stopped working
    </p>
    <p class="phase-error__note">
      the round is still running and your place is kept. reload to pick it back up.
    </p>
    <button class="btn btn--primary" type="button" @click="reload">
      Reload
    </button>
  </div>
  <slot v-else />
</template>
