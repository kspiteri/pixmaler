<script setup lang="ts">
// Image picker — used by the GM controls (with `showPreview`/`showMobileWarn`/
// `showDrawSeconds`) and the /paint sandbox (without). Owns the file input,
// scale/colour controls, sample buttons, and runs the pipeline on change.

import { computed, onMounted, ref, useTemplateRef, watch } from "vue";
import {
  DEFAULT_COLOR_COUNT,
  DEFAULT_SCALE,
  isMobileWarning,
  type PipelineResult,
  processImage,
} from "../lib/pipeline";
import { PixelCanvas } from "../lib/canvas";

interface Props {
  showMobileWarn?: boolean;
  showDrawSeconds?: boolean;
  showPreview?: boolean;
  // Auto-load a sample on first render. Useful for the sandbox where an image
  // is required.
  autoLoadSample?: "monalisa" | "scream" | "pearls";
}
const props = defineProps<Props>();

const emit = defineEmits<{
  result: [result: PipelineResult];
  // Fires when input changes but before processing finishes — caller can use
  // this to disable a Start button etc.
  processing: [];
}>();

defineExpose({ getDrawSeconds: () => drawSecs.value });

const scale = ref(DEFAULT_SCALE);
const colorCount = ref(DEFAULT_COLOR_COUNT);
const drawSecs = ref(120);
const status = ref("");
const showWarn = ref(false);

const fileInput = useTemplateRef<HTMLInputElement>("fileInput");
const previewSlot = useTemplateRef<HTMLDivElement>("previewSlot");

let cachedFile: File | null = null;
let runId = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const samples = ["monalisa", "scream", "pearls"] as const;
const showWarnNode = computed(() => props.showMobileWarn && showWarn.value);

async function reprocess() {
  if (!cachedFile) return;
  const myRun = ++runId;
  status.value = "Processing…";
  if (props.showPreview && previewSlot.value) previewSlot.value.replaceChildren();
  showWarn.value = false;
  emit("processing");

  try {
    const result = await processImage(cachedFile, scale.value, colorCount.value);
    if (myRun !== runId) return; // stale

    status.value = "";
    if (props.showMobileWarn) {
      showWarn.value = isMobileWarning(Math.max(result.gridW, result.gridH));
    }

    if (props.showPreview && previewSlot.value) {
      const label = document.createElement("p");
      label.textContent = `Target image (${result.gridW}×${result.gridH}):`;
      const pc = new PixelCanvas({
        gridW: result.gridW,
        gridH: result.gridH,
        palette: result.palette,
        targetGrid: result.targetGrid,
        editable: false,
      });
      pc.canvas.style.maxWidth = "300px";
      pc.canvas.style.height = "auto";
      previewSlot.value.replaceChildren(label, pc.canvas);
    }

    emit("result", result);
  } catch (err) {
    if (myRun !== runId) return;
    status.value = `Error: ${err}`;
  }
}

function scheduleReprocess() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(reprocess, 150);
}

watch([scale, colorCount], scheduleReprocess);

function onFileChange() {
  const file = fileInput.value?.files?.[0];
  if (!file) return;
  cachedFile = file;
  reprocess();
}

async function loadSample(name: typeof samples[number]) {
  try {
    const url = `${import.meta.env.BASE_URL}assets/${name}.png`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const blob = await res.blob();
    cachedFile = new File([blob], `${name}.png`, { type: blob.type || "image/png" });
    if (fileInput.value) fileInput.value.value = "";
    reprocess();
  } catch (err) {
    status.value = `Could not load sample "${name}": ${err}`;
  }
}

onMounted(() => {
  if (props.autoLoadSample) loadSample(props.autoLoadSample);
});
</script>

<template>
  <div class="picker">
    <label>
      Scale:
      <input
        v-model.number="scale"
        class="picker__scale"
        type="range" min="1" max="50"
      />
      <span class="picker__scale-val">{{ scale }}</span>
    </label>
    <br />

    <label>
      Colours:
      <select v-model.number="colorCount" class="picker__count">
        <option :value="8">Very few</option>
        <option :value="16">Normal</option>
        <option :value="24">A bit more</option>
        <option :value="32">A lot more</option>
      </select>
    </label>

    <label v-if="showDrawSeconds">
      Draw seconds:
      <input
        v-model.number="drawSecs"
        class="picker__time"
        type="number" min="30" max="600"
      />
    </label>

    <br /><br />

    <label>
      Upload image:
      <input ref="fileInput" type="file" accept="image/*" @change="onFileChange" />
    </label>

    <div class="picker__samples">
      <span>Or try a sample:</span>
      <button
        v-for="name in samples"
        :key="name"
        type="button"
        @click="loadSample(name)"
      >
        {{ name }}
      </button>
    </div>

    <p v-if="showWarnNode" class="picker__warn">
      ⚠ Grid exceeds 64px on its longest side — mobile players may struggle.
    </p>

    <p class="picker__status">{{ status }}</p>

    <div v-if="showPreview" ref="previewSlot" class="picker__preview" />
  </div>
</template>

<style scoped lang="scss">
@use "../styles/tokens" as *;

.picker {
  margin-top: $gap-4;

  &__scale     { vertical-align: middle; width: 160px; }
  &__scale-val { margin-left: $gap-2; }
  &__count     { width: 50px; }
  &__time      { width: 60px; }

  &__samples {
    display: flex;
    gap: $gap-2;
    margin-top: $gap-2;
    align-items: center;
    flex-wrap: wrap;
  }

  &__warn   { color: $warn; }
  &__status { margin: 0; color: $muted; }

  &__preview {
    margin-top: $gap-4;
    :deep(canvas) { max-width: 300px; height: auto; }
  }
}
</style>
