<script setup lang="ts">
// Timer control — a stepped slider over preset durations, with a `custom` stop that reveals a
// free-text seconds input. The floor is captioned under it and applied on commit (HTML `min`
// doesn't stop a typed value, and an under-floor config is refused server-side).

import { computed, ref, useId } from 'vue'
import Slider from '@/components/elements/Slider.vue'
import { clampDrawSeconds, DRAW_SECONDS_MAX, DRAW_SECONDS_MIN } from '@/lib'
import { CUSTOM_SECS, DURATION_STOPS, durationLabel } from './stops'

const props = defineProps<{ modelValue: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const sliderId = useId()
const hintId = useId()

// Sticky: once the GM picks the custom stop it stays selected even if they type a preset value.
const custom = ref(false)
const sliderModel = computed(() => (custom.value ? CUSTOM_SECS : props.modelValue))
const readout = computed(() => (custom.value ? `${props.modelValue}s` : durationLabel(sliderModel.value)))

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
  <div class="picker__field">
    <div class="picker__field-head">
      <label :for="sliderId" class="picker__field-label">Draw time</label>
      <span class="picker__field-value">{{ readout }}</span>
    </div>
    <Slider
      :id="sliderId"
      class="picker__field-control"
      :model-value="sliderModel"
      :stops="DURATION_STOPS"
      @update:model-value="onSlider"
    />
    <template v-if="custom">
      <label class="picker__custom-time">
        <input
          class="picker__time"
          type="number"
          :value="modelValue"
          :min="DRAW_SECONDS_MIN"
          :max="DRAW_SECONDS_MAX"
          aria-label="Custom draw seconds"
          :aria-describedby="hintId"
          @change="onCustom"
        >
        seconds
      </label>
      <p :id="hintId" class="picker__field-hint">
        Minimum {{ DRAW_SECONDS_MIN }} seconds.
      </p>
    </template>
  </div>
</template>
