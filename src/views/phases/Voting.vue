<script setup lang="ts">
// VOTING phase — placeholder (Step 6).

import type { ServerMsg } from "../../lib/types";

defineProps<{
  gallery: Extract<ServerMsg, { type: "gallery" }> | null;
}>();
</script>

<template>
  <div class="page voting">
    <h2>Voting</h2>
    <p>Voting screen — TODO (Step 6).</p>
    <p v-if="gallery">
      Got {{ gallery.submissions.length }} submissions on a
      {{ gallery.gridW }}×{{ gallery.gridH }} grid.
    </p>
  </div>
</template>
