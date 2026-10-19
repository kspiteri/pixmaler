<script setup lang="ts">
// Source picker — Browse upload plus the bundled samples, grouped by category in a scrolling
// grid, with an info line for the hovered or selected work. Emits the raw File / chosen sample
// id; the orchestrator validates and runs the pipeline. Clears the file input after every
// change so re-selecting the same file fires again (after a rejected pick, say).

import { computed, ref, useId, useTemplateRef } from 'vue'
import { SAMPLE_CATEGORIES, sampleById, SAMPLES_BY_CATEGORY, sampleThumbUrl } from '@/lib'
import SampleCaption from './SampleCaption.vue'

const props = defineProps<{ selected: string | null }>()
const emit = defineEmits<{ file: [file: File], sample: [id: string] }>()

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const groupId = useId()
const hovered = ref<string | null>(null)
const shown = computed(() => {
  const id = hovered.value ?? props.selected
  return id ? sampleById(id) : undefined
})

function onFileChange() {
  const file = fileInput.value?.files?.[0]
  if (file)
    emit('file', file)
  if (fileInput.value)
    fileInput.value.value = ''
}
function unpreview(id: string) {
  if (hovered.value === id)
    hovered.value = null
}
</script>

<template>
  <div class="picker__source">
    <div class="picker__upload-row">
      <span class="picker__field-label">Upload image</span>
      <label class="picker__browse pressable">
        Browse…
        <!-- Raster formats only: `image/*` offers SVGs the pipeline can't decode. HEIC/HEIF stay
             listed so an iPhone photo is selectable, since Safari decodes those. -->
        <input
          ref="fileInput"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,image/bmp,image/avif,image/heic,image/heif"
          hidden
          @change="onFileChange"
        >
      </label>
    </div>

    <div class="picker__samples">
      <span class="picker__field-label">Or try a sample:</span>
      <div class="picker__sample-scroll">
        <section
          v-for="c in SAMPLE_CATEGORIES"
          :key="c.id"
          class="picker__sample-group"
          :aria-labelledby="`${groupId}-${c.id}`"
        >
          <h3 :id="`${groupId}-${c.id}`" class="picker__sample-group-title">
            {{ c.label }}
          </h3>
          <ul class="picker__sample-list">
            <li v-for="s in SAMPLES_BY_CATEGORY[c.id]" :key="s.id">
              <button
                class="picker__sample pressable"
                :class="{ 'is-selected': selected === s.id }"
                type="button"
                :aria-pressed="selected === s.id"
                @click="emit('sample', s.id)"
                @pointerenter="hovered = s.id"
                @pointerleave="unpreview(s.id)"
                @focus="hovered = s.id"
                @blur="unpreview(s.id)"
              >
                <img
                  class="picker__sample-thumb"
                  :src="sampleThumbUrl(s.id)"
                  :alt="s.title"
                  :width="s.dims.w"
                  :height="s.dims.h"
                  loading="lazy"
                  decoding="async"
                >
              </button>
            </li>
          </ul>
        </section>
      </div>
      <div class="picker__sample-info">
        <SampleCaption v-if="shown" :work="shown" />
        <p v-else class="picker__sample-meta">
          Public-domain works from Wikimedia Commons.
        </p>
      </div>
    </div>
  </div>
</template>
