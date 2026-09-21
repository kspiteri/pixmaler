<script setup lang="ts">
// The one range slider. Continuous by default; pass `stops` for a stepped variant that snaps
// to named values and announces the label (not the raw number) to assistive tech. Renders only
// the input + its tick list — the caller owns the surrounding label and any value readout, so
// the same control serves the picker's Detail dial, the crop zoom and the brush size.

import { computed, useId } from 'vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  modelValue: number
  min?: number
  max?: number
  step?: number
  // Stepped variant: snap points + spoken labels. When set, min/max/step are ignored and the
  // thumb walks the stops by index, so unevenly-spaced values still snap to even positions.
  stops?: Stop[]
  // Accessible name, when no visible <label> wraps the control.
  label?: string
  disabled?: boolean
}>(), { min: 0, max: 100, step: 1 })

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

interface Stop { value: number, label: string }

const tickId = useId()
const stepped = computed(() => (props.stops?.length ?? 0) > 0)

// In stepped mode the input value is the stop index; clamp a stray model value to the first stop.
const index = computed(() =>
  stepped.value ? Math.max(0, props.stops!.findIndex(s => s.value === props.modelValue)) : props.modelValue,
)
const currentLabel = computed(() => (stepped.value ? props.stops![index.value]?.label : undefined))

function onInput(e: Event) {
  const raw = Number((e.target as HTMLInputElement).value)
  emit('update:modelValue', stepped.value ? props.stops![raw].value : raw)
}
</script>

<template>
  <input
    class="slider"
    v-bind="$attrs"
    type="range"
    :min="stepped ? 0 : min"
    :max="stepped ? stops!.length - 1 : max"
    :step="stepped ? 1 : step"
    :value="index"
    :disabled="disabled"
    :aria-label="label"
    :aria-valuetext="currentLabel"
    :list="stepped ? tickId : undefined"
    @input="onInput"
  >
  <datalist v-if="stepped" :id="tickId">
    <option v-for="(s, i) in stops" :key="s.value" :value="i" :label="s.label" />
  </datalist>
</template>
