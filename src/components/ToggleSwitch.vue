<script setup lang="ts">
// A generic two-state switch: a sliding pill flanked by an "off" and an "on" side, the
// active side brightened. Presentation only — it owns the pill, knob and press and knows
// nothing about what it toggles. Bind `v-model` and fill the `#off`/`#on` slots.

defineProps<{
  modelValue: boolean
  // The switch has no visible text label, so it needs its own accessible name.
  label: string
}>()

const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
</script>

<template>
  <div class="toggle-switch" :class="{ 'toggle-switch--on': modelValue }">
    <span class="toggle-switch__side toggle-switch__side--off"><slot name="off" /></span>
    <button
      class="toggle-switch__control pressable"
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :aria-label="label"
      @click="emit('update:modelValue', !modelValue)"
    >
      <span class="toggle-switch__knob" aria-hidden="true" />
    </button>
    <span class="toggle-switch__side toggle-switch__side--on"><slot name="on" /></span>
  </div>
</template>
