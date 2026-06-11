<script setup lang="ts">
// DRAWING phase — countdown + done tally + canvas pair + Done button.

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
const submitted = ref(false);
const doneLabel = ref("Done");

let autoTimer: ReturnType<typeof setTimeout> | null = null;
let rafId: number | null = null;

function submit(reason: "manual" | "deadline") {
  if (submitted.value) return;
  const player = pairRef.value?.player();
  if (!player) return;
  submitted.value = true;

  const grid = player.getGrid();
  socket.send(JSON.stringify({ type: "draw:submit", grid } satisfies ClientMsg));
  if (reason === "manual") {
    socket.send(JSON.stringify({ type: "draw:done" } satisfies ClientMsg));
  }
  player.lock();
  doneLabel.value = reason === "manual" ? "Submitted ✓" : "Time's up — submitted";
}

function cancelAuto() {
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}

onMounted(() => {
  const dl = deadline.value;
  if (dl) {
    const tick = () => {
      const left = Math.max(0, Math.ceil((dl - Date.now()) / 1000));
      timerText.value = `Time left: ${left}s`;
      if (left > 0 && !submitted.value) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    const remaining = Math.max(0, dl - Date.now());
    autoTimer = setTimeout(() => submit("deadline"), remaining);
  } else {
    timerText.value = "Drawing…";
  }

  // Best-effort: also cancel on socket close so we don't try to send after
  // disconnect. The phase-change unmount path is handled by onBeforeUnmount.
  socket.addEventListener("close", cancelAuto, { once: true });
});

// Cmd/Ctrl+Z → undo while drawing. Disabled once the canvas locks.
const onKeyDown = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "z") {
    const player = pairRef.value?.player();
    if (!player || player.isLocked()) return;
    e.preventDefault();
    player.undo();
  }
};

onMounted(() => window.addEventListener("keydown", onKeyDown));
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeyDown);
  cancelAuto();
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
    />

    <button
      class="drawing__done-btn"
      type="button"
      :disabled="submitted"
      @click="submit('manual')"
    >
      {{ doneLabel }}
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
