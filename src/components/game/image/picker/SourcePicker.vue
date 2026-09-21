<script setup lang="ts">
// Source picker — Browse upload + the bundled sample tiles. Emits the raw File / chosen sample
// name; the orchestrator validates and runs the pipeline. Clears the file input after every
// change so re-selecting the same file fires again (after a rejected pick, say).

import { useTemplateRef } from 'vue'
import { asset } from '@/lib'

defineProps<{ samples: { name: string, label: string }[], selected: string | null }>()
const emit = defineEmits<{ file: [file: File], sample: [name: string] }>()

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

function sampleUrl(name: string) {
  return asset(`assets/${name}.png`)
}
function onFileChange() {
  const file = fileInput.value?.files?.[0]
  if (file)
    emit('file', file)
  if (fileInput.value)
    fileInput.value.value = ''
}
</script>

<template>
  <div class="picker__source">
    <div class="picker__upload-row">
      <span class="picker__setting-label">Upload image</span>
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
      <span class="picker__samples-label">Or try a sample:</span>
      <ul class="picker__sample-list">
        <li v-for="s in samples" :key="s.name">
          <button
            class="picker__sample pressable"
            :class="{ 'is-selected': selected === s.name }"
            type="button"
            :aria-pressed="selected === s.name"
            @click="emit('sample', s.name)"
          >
            <img class="picker__sample-thumb" :src="sampleUrl(s.name)" :alt="s.label">
            <span class="picker__sample-name">{{ s.label }}</span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
