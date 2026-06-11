<script setup lang="ts">
// RESULTS phase — placeholder (Step 7).

import type { ServerMsg } from "../../lib/types";

defineProps<{
  results: Extract<ServerMsg, { type: "results" }> | null;
}>();
</script>

<template>
  <div class="page results">
    <h2>Results</h2>
    <p>Results screen — TODO (Step 7).</p>
    <ol v-if="results">
      <li v-for="r in results.ranked" :key="r.submissionId">
        {{ r.name }}: {{ r.votes }} vote{{ r.votes === 1 ? "" : "s" }}
      </li>
    </ol>
  </div>
</template>
