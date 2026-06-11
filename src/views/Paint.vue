<script setup lang="ts">
// Paint sandbox — solo canvas, no lobby/socket/timer. Picker on the left, the
// canvas pair (target + editable + tools) on the right. Pair re-mounts each
// time the picker emits a new result, so PixelCanvas instances tear down cleanly.

import { onBeforeUnmount, onMounted, ref } from "vue";
import type { PipelineResult } from "../lib/pipeline";
import ImagePicker from "../components/ImagePicker.vue";
import CanvasPair from "../components/CanvasPair.vue";

const result = ref<PipelineResult | null>(null);
const pairRef = ref<InstanceType<typeof CanvasPair> | null>(null);

const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
const backHref = `${base}/`;

function onResult(next: PipelineResult) {
  result.value = next;
}

// Cmd/Ctrl+Z → undo on the active canvas.
const onKeyDown = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "z") {
    e.preventDefault();
    pairRef.value?.player()?.undo();
  }
};

onMounted(() => window.addEventListener("keydown", onKeyDown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeyDown));
</script>

<template>
  <div class="page paint">
    <a class="paint__back" :href="backHref">← Back to lobby entry</a>
    <h1>Paint sandbox</h1>
    <p class="muted">Solo canvas — pick an image, then paint. No lobby, no timer.</p>

    <div class="paint__row">
      <div class="paint__left">
        <ImagePicker
          auto-load-sample="monalisa"
          @result="onResult"
        />
      </div>
      <div class="paint__right">
        <CanvasPair
          v-if="result"
          ref="pairRef"
          :key="`${result.gridW}x${result.gridH}-${result.palette.join(',')}`"
          :grid-w="result.gridW"
          :grid-h="result.gridH"
          :palette="result.palette"
          :target-grid="result.targetGrid"
          variant="paint"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "../styles/tokens" as *;

.paint {
  &__back {
    display: inline-block;
    margin-bottom: $gap-4;
    color: $muted;
  }
  &__row {
    display: flex;
    gap: $gap-5;
    flex-wrap: wrap;
    align-items: flex-start;
  }
  &__left  { flex: 0 0 320px; }
  &__right { flex: 1 1 480px; min-width: 0; }
}
</style>
