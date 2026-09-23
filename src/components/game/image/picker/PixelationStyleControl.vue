<script setup lang="ts">
// Pixelation-style control - a segmented group that picks the quantiser by outcome (Bold /
// Balanced / Faithful), never by algorithm name, over a Disclosure explaining each in plain words.
// The GM chooses off the live target preview; the blurb is also the accessible name.

import type { PixelationStyle } from '@/lib'
import { useId } from 'vue'
import Disclosure from '@/components/elements/Disclosure.vue'
import { PIXELATION_STYLES } from '@/lib'

defineProps<{ modelValue: PixelationStyle }>()
const emit = defineEmits<{ 'update:modelValue': [value: PixelationStyle] }>()

const labelId = useId()
</script>

<template>
  <div class="picker__style">
    <div class="picker__setting picker__setting--inline">
      <span :id="labelId" class="picker__setting-label">Pixelation style</span>
      <div class="segmented segmented--wide" role="group" :aria-labelledby="labelId">
        <button
          v-for="opt in PIXELATION_STYLES"
          :key="opt.id"
          class="segmented__item"
          :class="{ 'segmented__item--active': modelValue === opt.id }"
          type="button"
          :aria-label="`${opt.label}: ${opt.blurb}`"
          :aria-pressed="modelValue === opt.id"
          @click="emit('update:modelValue', opt.id)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <Disclosure label="what does 'pixelation styles' do?" aria-label="What the pixelation styles do">
      <div class="picker__style-help">
        <p class="picker__style-note">
          Suggestion to switch between styles to see how your image renders,
          sometimes these algorithms work great with an image and not so much with another.
        </p>
        <ul>
          <li v-for="opt in PIXELATION_STYLES" :key="opt.id">
            <strong>{{ opt.label }}: </strong> {{ opt.blurb }}
          </li>
        </ul>
        <p class="picker__style-note">
          Extra colours will be added to fill the palette if a style doesn't reach the number you chose.
        </p>
      </div>
    </Disclosure>
  </div>
</template>
