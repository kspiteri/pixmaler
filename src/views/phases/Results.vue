<script setup lang="ts">
// RESULTS phase — ranked reveal with authors + vote counts. Joint winners
// share the top rank when their votes tie. The GM gets a "Play again"
// button that returns the room to LOBBY.

import { computed, inject, onBeforeUnmount, watch } from "vue";
import type { ClientMsg, ServerMsg } from "../../lib/types";
import { socketKey, clientIdKey } from "../../lib/keys";
import { PixelCanvas } from "../../lib/canvas";

type Results = Extract<ServerMsg, { type: "results" }>;

const props = defineProps<{
  results: Results | null;
  gmClientId: string;
}>();

const socket = inject(socketKey)!;
const clientId = inject(clientIdKey)!;

const isGm = computed(() => props.gmClientId === clientId);

// Walk the ranked list and assign each entry its 1-based rank, with ties
// sharing a rank ("1, 1, 3" — standard competition ranking).
const rankedWithPlace = computed(() => {
  if (!props.results) return [];
  const ranked = props.results.ranked;
  const out: { place: number; isWinner: boolean; entry: Results["ranked"][number] }[] = [];
  let lastVotes = -1;
  let lastPlace = 0;
  ranked.forEach((entry, i) => {
    const place = entry.votes === lastVotes ? lastPlace : i + 1;
    lastVotes = entry.votes;
    lastPlace = place;
    out.push({ place, isWinner: place === 1, entry });
  });
  return out;
});

// PixelCanvas instances mounted into the per-row slots. Re-built whenever
// the results object changes (Play again → new round).
let canvases: PixelCanvas[] = [];

const slotMap = new Map<string, HTMLElement>();
function setSlot(submissionId: string, el: unknown) {
  if (el instanceof HTMLElement) slotMap.set(submissionId, el);
  else slotMap.delete(submissionId);
}

function mountCanvases() {
  canvases = [];
  if (!props.results) return;
  for (const r of props.results.ranked) {
    const slot = slotMap.get(r.submissionId);
    if (!slot) continue;
    const pc = new PixelCanvas({
      gridW: props.results.gridW,
      gridH: props.results.gridH,
      palette: props.results.palette,
      targetGrid: r.grid,
      editable: false,
    });
    pc.canvas.classList.add("results__canvas");
    slot.replaceChildren(pc.canvas);
    canvases.push(pc);
  }
}

watch(() => props.results, mountCanvases, { immediate: true, flush: "post" });

onBeforeUnmount(() => { canvases = []; });

function playAgain() {
  const msg: ClientMsg = { type: "gm:playAgain" };
  socket.send(JSON.stringify(msg));
}
</script>

<template>
  <div class="page results">
    <h2>Results</h2>

    <p v-if="!results" class="muted">Waiting for results…</p>

    <div v-else class="results__list">
      <div
        v-for="row in rankedWithPlace"
        :key="row.entry.submissionId"
        class="results__row"
        :class="{
          'results__row--winner': row.isWinner,
          'results__row--mine':   row.entry.clientId === clientId,
        }"
      >
        <div class="results__place">
          {{ row.isWinner ? "🏆" : `#${row.place}` }}
        </div>
        <div :ref="el => setSlot(row.entry.submissionId, el)" class="results__slot" />
        <div class="results__meta">
          <p class="results__name">{{ row.entry.name }}</p>
          <p class="results__votes">
            {{ row.entry.votes }} vote{{ row.entry.votes === 1 ? "" : "s" }}
          </p>
        </div>
      </div>
    </div>

    <button
      v-if="results && isGm"
      class="results__again"
      type="button"
      @click="playAgain"
    >
      Play again
    </button>
    <p v-if="results && !isGm" class="muted results__hint">
      Waiting for the GM to start a new round.
    </p>
  </div>
</template>

<style scoped lang="scss">
@use "../../styles/tokens" as *;

.results {
  &__list {
    display: flex;
    flex-direction: column;
    gap: $gap-3;
    margin-top: $gap-4;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: $gap-4;
    padding: $gap-3;
    border: 1px solid $rule-soft;
    border-radius: 4px;
    background: $bg;

    &--winner {
      border-color: $accent;
      border-width: 2px;
    }

    &--mine {
      background: rgba(0, 0, 0, 0.03);
    }
  }

  &__place {
    flex: 0 0 56px;
    font-size: 1.5rem;
    font-weight: bold;
    text-align: center;
  }

  &__slot {
    flex: 0 0 160px;
    aspect-ratio: 1 / 1;
    // White background so untouched cells (palette[0] in submitted grids)
    // don't visually merge with dark palette colours.
    background: #fff;
  }

  :deep(.results__canvas) {
    display: block;
    width: 100%;
    height: 100%;
    border: 1px solid $rule;
    background: #fff;
  }

  &__meta {
    flex: 1 1 auto;
    min-width: 0;
  }

  &__name { margin: 0; font-weight: bold; }
  &__votes { margin: 0; color: $muted; }

  &__again {
    margin-top: $gap-5;
  }
  &__hint {
    margin-top: $gap-2;
    font-size: 0.75rem;
  }
}
</style>
