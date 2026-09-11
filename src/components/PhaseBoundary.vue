<script setup lang="ts">
// Error boundary for the phase views. Without it, a throw inside `Drawing.vue` or
// `Voting.vue` blanks the screen mid-round while the round keeps running on the server.
// The socket lives in `App.vue` above this boundary, so a child throw never drops the
// seat and the server treats a reload as a reconnect (grids and votes restored by
// `clientId`) — hence reload is the only recovery: re-rendering in place would rethrow.
import { onErrorCaptured, ref } from 'vue'

const failed = ref(false)

onErrorCaptured((err, _instance, info) => {
  failed.value = true

  // Returning false suppresses Vue's own console logging, so log here or a mid-game crash
  // leaves no trace. `info` names the hook that threw.
  console.error(`[phase] error in ${info}`, err)
  return false
})

// `location` is not in Vue's template globals allowlist, so an inline call resolves
// undefined against the render context; go through a function instead.
function reload() {
  location.reload()
}
</script>

<template>
  <!-- Deliberately plain markup: a fallback that renders child components or reads the
       state that just threw can fail the same way. Only static copy. -->
  <div v-if="failed" class="page page--narrow phase-error">
    <p class="label label--eyebrow">
      this screen stopped working
    </p>
    <p class="phase-error__note">
      the round is still going and your place is saved. reload to pick it back up.
    </p>
    <button class="btn btn--primary" type="button" @click="reload">
      Reload
    </button>
  </div>
  <slot v-else />
</template>
