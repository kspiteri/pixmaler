<script setup lang="ts">
// Gallery section: Slider in its continuous and stepped forms, each with a live readout.

import { computed, ref } from 'vue'
import Slider from '@/components/elements/Slider.vue'

const level = ref(40)
const detailStops = [
  { value: 0, label: 'coarse' },
  { value: 1, label: 'medium' },
  { value: 2, label: 'fine' },
  { value: 3, label: 'ultra' },
]
const detail = ref(1)
const detailReadout = computed(() => detailStops.find(s => s.value === detail.value)?.label ?? '')
</script>

<template>
  <div>
    <section class="demo__section">
      <h4 class="demo__heading">
        continuous — {{ level }}
      </h4>
      <div class="demo__stack">
        <Slider v-model="level" :min="0" :max="100" label="Demo level" />
      </div>
    </section>

    <section class="demo__section">
      <h4 class="demo__heading">
        stepped — {{ detailReadout }}
      </h4>
      <div class="demo__stack">
        <Slider v-model="detail" :stops="detailStops" label="Detail" />
      </div>
    </section>
  </div>
</template>
