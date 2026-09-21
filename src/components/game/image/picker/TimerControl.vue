<script setup lang="ts">
// Timer control — a stepped slider over preset durations, with a `custom` stop that unlocks a
// free-text seconds input. The floor is stated in the label and applied on commit (HTML `min`
// doesn't stop a typed value, and an under-floor config is refused server-side).

import { computed, ref } from 'vue'
import Slider from '@/components/elements/Slider.vue'
import { clampDrawSeconds, DRAW_SECONDS_MAX, DRAW_SECONDS_MIN } from '@/lib'
import { CUSTOM_SECS, DURATION_STOPS, durationLabel } from './stops'

const props = defineProps<{ modelValue: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

// Sticky: once the GM picks the custom stop it stays selected even if they type a preset value.
const custom = ref(false)
const sliderModel = computed(() => (custom.value ? CUSTOM_SECS : props.modelValue))

function onSlider(value: number) {
  if (value === CUSTOM_SECS) {
    custom.value = true
  }
  else {
    custom.value = false
    emit('update:modelValue', value)
  }
}
function onCustom(e: Event) {
  const n = Number((e.target as HTMLInputElement).value)
  emit('update:modelValue', Number.isFinite(n) ? clampDrawSeconds(n) : DRAW_SECONDS_MIN)
}
</script>

<template>
  <label class="picker__setting">
    <span class="picker__setting-label">Draw seconds (min: {{ DRAW_SECONDS_MIN }}s)</span>
    <Slider :model-value="sliderModel" :stops="DURATION_STOPS" label="Draw seconds" @update:model-value="onSlider" />
    <span class="picker__scale-out">
      <span v-if="!custom" class="picker__scale-val">{{ durationLabel(sliderModel) }}</span>
      <input
        class="picker__time"
        type="number"
        :value="modelValue"
        :min="DRAW_SECONDS_MIN"
        :max="DRAW_SECONDS_MAX"
        :disabled="!custom"
        aria-label="Custom draw seconds"
        @change="onCustom"
      >
    </span>
  </label>
</template>
