<script setup lang="ts">
// Detail dial — a stepped slider over the named cell-density tiers, with a live readout of the
// tier and the grid it produces (and a busy spinner while the pipeline reprocesses).

import { Loader2 } from '@lucide/vue'
import { computed, useId } from 'vue'
import Slider from '@/components/elements/Slider.vue'
import { DETAIL_STOPS, detailLabel } from './stops'

const props = defineProps<{ modelValue: number, gridPreview: string, busy: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const inputId = useId()
const label = computed(() => detailLabel(props.modelValue))
</script>

<template>
  <div class="picker__field">
    <div class="picker__field-head">
      <label :for="inputId" class="picker__field-label">Detail</label>
      <span class="picker__field-value">
        {{ label }}<template v-if="gridPreview"> · {{ gridPreview }}</template>
        <!-- Always rendered so it reserves its space and doesn't twitch the readout mid-drag. -->
        <Loader2 class="picker__spinner" :class="{ 'is-on': busy }" :size="14" aria-hidden="true" />
        <span v-if="busy" class="picker__sr">Processing…</span>
      </span>
    </div>
    <Slider
      :id="inputId"
      class="picker__field-control"
      :model-value="modelValue"
      :stops="DETAIL_STOPS"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>
