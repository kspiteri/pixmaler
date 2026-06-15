<script setup lang="ts">
// DRAWING phase — countdown + done tally + canvas pair + Done social signal.
//
// Submit semantics (plan 04, item 2):
//   - Submission is automatic. Every stroke triggers a debounced
//     `draw:submit`; what's on the canvas at the deadline is what counts.
//   - The canvas is NEVER locked from this view — only the server's phase
//     transition to VOTING ends the round, at which point this whole view
//     unmounts.
//   - "Done" is a *social signal*, not a submit action. Clicking it fires
//     `draw:done` so the GM and the room see "Aida is done" via the
//     "X of Y done" tally. Submission already happens automatically, so
//     this button doesn't gate it.

import {
  computed,
  inject,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
} from "vue";
import type { ClientMsg, ServerMsg } from "../../lib/types";
import { socketKey } from "../../lib/keys";
import CanvasPair from "../../components/CanvasPair.vue";

type State = Extract<ServerMsg, { type: "state" }>;

const props = defineProps<{ state: State }>();

const socket = inject(socketKey)!;
// `state.config` is checked non-null in App.vue's v-if, so this assertion is safe.
const config = computed(() => props.state.config!);
const deadline = computed(() => props.state.deadline);
const doneText = computed(() =>
  `${props.state.doneCount} of ${props.state.totalDrawing} done`,
);

const pairRef = useTemplateRef<InstanceType<typeof CanvasPair>>("pair");
const timerText = ref("");
const flaggedDone = ref(false); // has the player clicked Done — purely social

let autoSubmitTimer: ReturnType<typeof setTimeout> | null = null;
let resubmitTimer: ReturnType<typeof setTimeout> | null = null;
let rafId: number | null = null;
// Latest grid from the @update event — the deadline auto-submit reads it.
let latestGrid: number[] | null = null;
// Last grid we actually sent over the wire. Used to skip no-op resubmits
// (e.g. paint → undo → paint identical, or hover-click on the same colour).
let lastSentGrid: number[] | null = null;

const RESUBMIT_DEBOUNCE_MS = 500;

function gridsEqual(a: number[], b: number[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function sendSubmit(grid: number[]) {
  if (lastSentGrid && gridsEqual(grid, lastSentGrid)) return;
  // Snapshot the array — `latestGrid` may keep mutating as more strokes
  // land. (`getGrid()` already returns a copy, so this is belt-and-braces.)
  lastSentGrid = [...grid];
  socket.send(JSON.stringify({ type: "draw:submit", grid } satisfies ClientMsg));
}

function onCanvasUpdate(grid: number[]) {
  latestGrid = grid;
  if (resubmitTimer) clearTimeout(resubmitTimer);
  resubmitTimer = setTimeout(() => {
    if (latestGrid) sendSubmit(latestGrid);
  }, RESUBMIT_DEBOUNCE_MS);
}

function flagDone() {
  if (flaggedDone.value) return;
  flaggedDone.value = true;
  // Pure social ping — no `draw:submit` here. Auto-submit handles the wire
  // state; this just tells the room "I think I'm finished".
  socket.send(JSON.stringify({ type: "draw:done" } satisfies ClientMsg));
}

function autoSubmitAtDeadline() {
  // Whatever's on the canvas at the deadline is what gets locked in. The
  // server transitions to VOTING immediately after, dropping any further
  // submits via its phase guard.
  const player = pairRef.value?.player();
  if (!player) return;
  const grid = latestGrid ?? player.getGrid();
  sendSubmit(grid);
}

function cancelTimers() {
  if (autoSubmitTimer) { clearTimeout(autoSubmitTimer); autoSubmitTimer = null; }
  if (resubmitTimer) { clearTimeout(resubmitTimer); resubmitTimer = null; }
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}

onMounted(() => {
  const dl = deadline.value;
  if (dl) {
    // Tick unconditionally until 0 — the countdown reflects wall-clock time,
    // independent of submit state.
    const tick = () => {
      const left = Math.max(0, Math.ceil((dl - Date.now()) / 1000));
      timerText.value = `Time left: ${left}s`;
      if (left > 0) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    const remaining = Math.max(0, dl - Date.now());
    autoSubmitTimer = setTimeout(autoSubmitAtDeadline, remaining);
  } else {
    timerText.value = "Drawing…";
  }

  // Cancel pending sends if the socket goes away. Phase change is handled by
  // onBeforeUnmount.
  socket.addEventListener("close", cancelTimers, { once: true });
});

// Cmd/Ctrl+Z → undo. Always available — the canvas never locks during DRAWING.
const onKeyDown = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "z") {
    const player = pairRef.value?.player();
    if (!player) return;
    e.preventDefault();
    player.undo();
  }
};

onMounted(() => window.addEventListener("keydown", onKeyDown));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeyDown);
  cancelTimers();
});
</script>

<template>
  <div class="drawing">
    <div class="drawing__status">
      <p class="drawing__timer">{{ timerText }}</p>
      <p class="drawing__done">{{ doneText }}</p>
    </div>

    <CanvasPair
      ref="pair"
      :grid-w="config.gridW"
      :grid-h="config.gridH"
      :palette="config.palette"
      :target-grid="config.targetGrid"
      variant="drawing"
      @update="onCanvasUpdate"
    />

    <button
      class="drawing__done-btn"
      type="button"
      :disabled="flaggedDone"
      @click="flagDone"
    >
      {{ flaggedDone ? "Flagged as done ✓" : "I'm done" }}
    </button>
  </div>
</template>

<style scoped lang="scss">
@use "../../styles/tokens" as *;

.drawing {
  padding: $gap-4;
  max-width: $page-max;
  margin: 0 auto;

  &__status {
    display: flex;
    gap: $gap-5;
    align-items: center;
    margin-bottom: $gap-2;
  }
  &__timer { font-weight: bold; margin: 0; }
  &__done  { margin: 0; color: $muted; }

  &__done-btn { margin-top: $gap-3; }
}
</style>
