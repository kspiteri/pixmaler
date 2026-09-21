<script setup lang="ts">
// Detail dial — a stepped slider over the named cell-density tiers, with a live readout of the
// tier and the grid it produces (and a busy spinner while the pipeline reprocesses).

import { Loader2 } from '@lucide/vue'
import { computed } from 'vue'
import Slider from '@/components/elements/Slider.vue'
import { DETAIL_STOPS, detailLabel } from './stops'

const props = defineProps<{ modelValue: number, gridPreview: string, busy: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const label = computed(() => detailLabel(props.modelValue))
</script>

<template>
  <label class="picker__setting">
    <span class="picker__setting-label">Detail</span>
    <Slider :model-value="modelValue" :stops="DETAIL_STOPS" @update:model-value="emit('update:modelValue', $event)" />
    <span class="picker__scale-out">
      <span class="picker__scale-val">{{ label }}</span>
      <span v-if="gridPreview" class="picker__scale-grid">→ {{ gridPreview }}</span>
      <!-- Busy indicator in the eye-line of the dragged control; always rendered so it reserves
           its space and doesn't twitch the slider mid-drag. -->
      <Loader2 class="picker__spinner" :class="{ 'is-on': busy }" :size="14" aria-hidden="true" />
      <span v-if="busy" class="picker__sr">Processing…</span>
    </span>
  </label>
</template>
