<script setup lang="ts">
// Dev-only quantiser comparison (/quantise, #107) — runs each candidate over one shared image
// sample and shows the target, palette and metrics side by side, so a palette swap is judged on
// the real look, not MSE alone. Gated to import.meta.env.DEV in App.vue and linked from nowhere,
// so this page and the candidate quantisers tree-shake out of production.

import type { Rgb, TargetRatioId } from '@/lib'
import { computed, onMounted, ref, watch } from 'vue'
import Logo from '@/components/elements/Logo.vue'
import Slider from '@/components/elements/Slider.vue'
import PixelThumb from '@/components/game/shared/PixelThumb.vue'
import SettingsMenu from '@/components/layout/SettingsMenu.vue'
import { appHref, asset, DEFAULT_COLOR_COUNT, DEFAULT_SCALE, derivePalette, mergeNearDuplicates, quantiseToPalette, rgbToHex, sampleImage, TARGET_RATIO_IDS, TARGET_RATIOS } from '@/lib'
import { kmeansQuantiser, wuQuantiser } from '@/lib/canvas/quantisers'
import { distinctColoursUsed, paletteSpread, quantiseError } from '@/lib/canvas/quantisers/metrics'

const SAMPLES = [
  { name: 'monalisa', label: 'Mona Lisa' },
  { name: 'scream', label: 'The Scream' },
  { name: 'pearls', label: 'Pearl Earring' },
]
// Each returns its *raw* palette; the near-duplicate merge is applied uniformly below (behind
// the toggle) so the columns are compared on equal footing — the shipped pipeline runs median-cut
// + merge, so that pairing reproduces production while Wu/k-means show what a swap would give.
const QUANTISERS: { id: string, label: string, run: (p: Rgb[], n: number) => Rgb[] }[] = [
  { id: 'median', label: 'median-cut (current)', run: derivePalette },
  { id: 'wu', label: 'Wu (1992)', run: wuQuantiser },
  { id: 'kmeans', label: 'k-means (seeded)', run: kmeansQuantiser },
]

interface Column {
  id: string
  label: string
  gridW: number
  gridH: number
  palette: string[]
  grid: number[]
  ms: number
  used: number
  spread: number
  error: number
}

const homeHref = appHref()
const selected = ref('monalisa')
const ratio = ref<TargetRatioId>('landscape')
const count = ref(DEFAULT_COLOR_COUNT)
const busy = ref(false)
const status = ref('')
const columns = ref<Column[]>([])
// Near-duplicate merge, applied to every column so the comparison is even. On = the shipped
// pipeline step (median-cut + merge is production); off = each quantiser's raw palette.
const merge = ref(true)
const scale = ref(DEFAULT_SCALE)
// The resulting grid dimensions, so the detail slider shows what it costs.
const gridLabel = computed(() => (columns.value[0] ? `${columns.value[0].gridW}×${columns.value[0].gridH}` : ''))

let currentFile: File | null = null

async function pickSample(name: string) {
  selected.value = name
  const res = await fetch(asset(`assets/${name}.png`))
  currentFile = new File([await res.blob()], `${name}.png`, { type: 'image/png' })
  await recompute()
}

function onUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file)
    return
  selected.value = ''
  currentFile = file
  recompute()
}

async function recompute() {
  if (!currentFile)
    return
  busy.value = true
  status.value = ''
  try {
    const sample = await sampleImage(currentFile, scale.value, ratio.value)
    columns.value = QUANTISERS.map((q) => {
      // Median of three runs, so a stray GC pause doesn't decide the ranking.
      const times: number[] = []
      let derived: Rgb[] = []
      for (let r = 0; r < 3; r++) {
        const t0 = performance.now()
        derived = q.run(sample.pixels, count.value)
        times.push(performance.now() - t0)
      }
      times.sort((a, b) => a - b)
      if (merge.value)
        derived = mergeNearDuplicates(derived)
      const grid = quantiseToPalette(sample.rgba, sample.gridW, sample.gridH, derived)
      return {
        id: q.id,
        label: q.label,
        gridW: sample.gridW,
        gridH: sample.gridH,
        palette: derived.map(([r, g, b]) => rgbToHex(r, g, b)),
        grid,
        ms: times[1],
        used: distinctColoursUsed(grid),
        spread: paletteSpread(derived),
        error: quantiseError(sample.rgba, derived, grid),
      }
    })
  }
  catch (err) {
    status.value = `Could not process the image: ${err}`
  }
  finally {
    busy.value = false
  }
}

watch([scale, count, ratio, merge], recompute)
onMounted(() => pickSample('monalisa'))
</script>

<template>
  <div class="page quantise">
    <header class="quantise__header">
      <a class="quantise__home" :href="homeHref" aria-label="Back to entry">
        <Logo size="sm" />
      </a>
      <SettingsMenu />
    </header>

    <h1 class="quantise__title">
      Quantiser comparison
    </h1>
    <p class="quantise__intro">
      Dev-only. One image sample, every candidate side by side — the target, its palette, and the
      metrics. Faster + richer + still redrawable wins; MSE alone does not.
    </p>

    <div class="quantise__controls">
      <div class="quantise__row">
        <span class="quantise__label">sample</span>
        <button
          v-for="s in SAMPLES"
          :key="s.name"
          type="button"
          class="quantise__chip pressable"
          :class="{ 'is-selected': selected === s.name }"
          @click="pickSample(s.name)"
        >
          {{ s.label }}
        </button>
        <label class="quantise__chip pressable">
          Upload…
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden @change="onUpload">
        </label>
      </div>

      <div class="quantise__row">
        <span class="quantise__label">shape</span>
        <button
          v-for="id in TARGET_RATIO_IDS"
          :key="id"
          type="button"
          class="quantise__chip pressable"
          :class="{ 'is-selected': ratio === id }"
          @click="ratio = id"
        >
          {{ TARGET_RATIOS[id].label }}
        </button>
      </div>

      <div class="quantise__row">
        <span class="quantise__label">detail — {{ scale }}{{ gridLabel ? ` · ${gridLabel}` : '' }}</span>
        <Slider v-model="scale" :min="1" :max="50" label="Detail" class="quantise__slider" />
      </div>

      <div class="quantise__row">
        <span class="quantise__label">colours — {{ count }}</span>
        <Slider v-model="count" :min="2" :max="32" label="Colours" class="quantise__slider" />
      </div>

      <div class="quantise__row">
        <span class="quantise__label">merge</span>
        <button
          type="button"
          class="quantise__chip pressable"
          :class="{ 'is-selected': merge }"
          :aria-pressed="merge"
          @click="merge = !merge"
        >
          near-duplicates {{ merge ? 'on' : 'off' }}
        </button>
      </div>
    </div>

    <p v-if="status" class="quantise__error">
      {{ status }}
    </p>

    <div class="quantise__grid" :class="{ 'is-busy': busy }">
      <section v-for="col in columns" :key="col.id" class="quantise__col">
        <h2 class="quantise__col-title">
          {{ col.label }}
        </h2>
        <div class="quantise__art">
          <PixelThumb :grid-w="col.gridW" :grid-h="col.gridH" :palette="col.palette" :grid="col.grid" />
        </div>
        <div class="quantise__swatches">
          <span v-for="(hex, i) in col.palette" :key="i" class="quantise__swatch" :style="{ background: hex }" :title="hex" />
        </div>
        <dl class="quantise__metrics">
          <div><dt>time</dt><dd>{{ col.ms.toFixed(1) }} ms</dd></div>
          <div><dt>palette</dt><dd>{{ col.palette.length }}</dd></div>
          <div><dt>colours used</dt><dd>{{ col.used }}</dd></div>
          <div><dt>spread</dt><dd>{{ col.spread.toFixed(1) }}</dd></div>
          <div><dt>error (RMS)</dt><dd>{{ col.error.toFixed(1) }}</dd></div>
        </dl>
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use 'tokens' as *;

// Dev-only comparison chrome — scoped here (not a screens/ partial) so it tree-shakes out of
// production with the lazily-imported view.
.quantise {
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: $gap-5;
  }

  &__home {
    display: inline-flex;
    text-decoration: none;
  }

  &__title {
    margin: 0 0 $gap-2;
    font-family: $font-display;
    font-weight: 700;
    font-size: $fs-2xl;
  }

  &__intro {
    margin: 0 0 $gap-5;
    color: $fg-50;
    font-size: $fs-sm;
    line-height: 1.5;
    max-width: 44rem;
  }

  &__controls {
    display: flex;
    flex-direction: column;
    gap: $gap-3;
    margin-bottom: $gap-6;
  }

  &__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: $gap-2;
  }

  &__label {
    min-width: 7rem;
    color: $fg-35;
    font-size: $fs-xs;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  &__chip {
    border: 1px solid $border;
    border-radius: $radius;
    padding: $gap-1 $gap-3;
    background: $surface;
    color: $fg-60;
    font-size: $fs-sm;
    cursor: pointer;

    &.is-selected {
      border-color: $accent-ink;
      color: $accent-ink;
    }
  }

  &__slider {
    flex: 1;
    min-width: 12rem;
    max-width: 22rem;
  }

  &__error {
    margin: 0 0 $gap-4;
    color: $warn-ink;
    font-size: $fs-sm;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: $gap-5;
    transition: opacity 0.15s;

    &.is-busy {
      opacity: 0.5;
    }
  }

  &__col {
    display: flex;
    flex-direction: column;
    gap: $gap-2;
  }

  &__col-title {
    margin: 0;
    font-family: $font-body;
    font-weight: $fw-semibold;
    font-size: $fs-sm;
  }

  // The drawing sits on paper. PixelCanvas builds the <canvas> at 14px per cell (far wider than
  // a column), so pin it to the column width and let the height follow — the whole image scales
  // in, rather than overflowing and being clipped by the box.
  &__art {
    background: $paper;
    border-radius: $radius-sm;
    overflow: hidden;
    box-shadow: $shadow-1;

    :deep(canvas) {
      display: block;
      width: 100%;
      height: auto;
    }
  }

  &__swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }

  &__swatch {
    width: 1rem;
    height: 1rem;
    border-radius: 2px;
  }

  &__metrics {
    margin: 0;
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0 $gap-3;
    font-size: $fs-sm;

    div {
      display: contents;
    }

    dt {
      color: $fg-50;
    }

    dd {
      margin: 0;
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
  }
}
</style>
