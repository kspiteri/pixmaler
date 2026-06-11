<script setup lang="ts">
// Pixel canvas pair — target reference + editable canvas + swatch + brush + undo.
// Shared by the DRAWING phase and the /paint sandbox.
//
// `PixelCanvas` is an imperative class (canvas + ctx + mouse handlers + undo
// stack), so we instantiate it in onMounted and append its <canvas> into a
// template slot. Vue handles the layout; PixelCanvas handles its own pixels.

import { onBeforeUnmount, onMounted, useTemplateRef } from "vue";
import {
  buildBrushControls,
  buildSwatch,
  PixelCanvas,
  type SwatchHandle,
} from "../lib/canvas";

interface Props {
  gridW: number;
  gridH: number;
  palette: string[];
  targetGrid: number[];
  // "drawing" → wider editable canvas, no Clear button (committed strokes only).
  // "paint"   → narrower target reference, Clear button included (sandbox toy).
  variant: "drawing" | "paint";
}
const props = defineProps<Props>();

const targetSlot = useTemplateRef<HTMLDivElement>("targetSlot");
const drawSlot = useTemplateRef<HTMLDivElement>("drawSlot");
const swatchSlot = useTemplateRef<HTMLDivElement>("swatchSlot");
const brushSlot = useTemplateRef<HTMLDivElement>("brushSlot");

let target: PixelCanvas | null = null;
let player: PixelCanvas | null = null;
let swatch: SwatchHandle | null = null;

// Expose the editable canvas so parents (Drawing, Paint) can call lock(),
// getGrid(), undo(), isLocked() etc.
defineExpose({
  player: () => player,
  clear() {
    if (!player) return;
    player.pushUndoSnapshot();
    player.setGrid(new Array(props.gridW * props.gridH).fill(-1));
  },
});

onMounted(() => {
  // Build the swatch first so the canvases' onHover handlers can highlight it.
  // `player` is referenced in onSelect, but that fires on click, by which time
  // it's defined.
  swatch = buildSwatch(props.palette, i => player?.selectColor(i));

  target = new PixelCanvas({
    gridW: props.gridW,
    gridH: props.gridH,
    palette: props.palette,
    targetGrid: props.targetGrid,
    editable: false,
    onHover: cell => swatch!.highlight(
      cell ? props.targetGrid[cell.y * props.gridW + cell.x] : null,
    ),
  });
  target.canvas.classList.add("canvas-pair__target-canvas");
  // PixelCanvas defaults editable canvases to a soft `#ccc` border, applied
  // inline by the constructor. Force the darker `#444` here — inline beats
  // any class-based rule.
  target.canvas.style.border = "1px solid #444";
  targetSlot.value!.appendChild(target.canvas);

  player = new PixelCanvas({
    gridW: props.gridW,
    gridH: props.gridH,
    palette: props.palette,
    editable: true,
    onHover: cell => {
      target!.showMarker(cell);
      swatch!.highlight(cell ? props.targetGrid[cell.y * props.gridW + cell.x] : null);
    },
  });
  player.canvas.classList.add("canvas-pair__draw-canvas");
  player.canvas.style.border = "1px solid #444";
  drawSlot.value!.appendChild(player.canvas);

  swatchSlot.value!.appendChild(swatch.element);
  brushSlot.value!.appendChild(buildBrushControls(player));
});

onBeforeUnmount(() => {
  // Drop references so PixelCanvas's listeners fall away with the DOM nodes.
  target = null;
  player = null;
  swatch = null;
});

function undo() { player?.undo(); }
function clear() {
  if (!player) return;
  player.pushUndoSnapshot();
  player.setGrid(new Array(props.gridW * props.gridH).fill(-1));
}
</script>

<template>
  <div class="canvas-pair" :class="`canvas-pair--${variant}`">
    <div class="canvas-pair__row">
      <div class="canvas-pair__target">
        <p>{{ variant === "paint" ? "Reference" : "Target" }}</p>
        <div ref="targetSlot" />
      </div>
      <div class="canvas-pair__draw">
        <p>{{ variant === "paint" ? "Your canvas" : "Your drawing" }}</p>
        <div ref="drawSlot" />
      </div>
    </div>

    <div class="canvas-pair__tools">
      <div ref="swatchSlot" />
      <div ref="brushSlot" class="canvas-pair__brush" />
      <div class="canvas-pair__btns btn-row">
        <button type="button" @click="undo">Undo</button>
        <button v-if="variant === 'paint'" type="button" @click="clear">
          Clear
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "../styles/tokens" as *;

.canvas-pair {
  &__row {
    display: flex;
    gap: $gap-4;
    flex-wrap: wrap;
    align-items: flex-start;
  }
  &__target { flex: 0 0 240px; min-width: 0; }
  &__draw   { flex: 1 1 480px; min-width: 0; }

  // Smaller variant for the paint sandbox reference.
  &--paint &__target { flex: 0 0 200px; }
  &--paint &__draw   { flex: 1 1 360px; }

  // PixelCanvas's <canvas> is appended into the slot; size it via :deep so
  // the scoped CSS reaches it.
  :deep(.canvas-pair__target-canvas) {
    width: 100%;
    max-width: 240px;
    height: auto;
  }
  :deep(.canvas-pair__draw-canvas) {
    width: 100%;
    max-width: 900px;
    height: auto;
  }
  &--paint :deep(.canvas-pair__target-canvas) { max-width: 200px; }

  &__tools { margin-top: $gap-3; }
  &__brush { margin-top: $gap-2; }
  &__btns  { margin-top: $gap-2; }
}
</style>
