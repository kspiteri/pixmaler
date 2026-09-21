<script setup lang="ts">
// Alpha-colour control — the background painted behind a transparent upload before sampling.
// Reuses the six classic ramp anchors so whatever the GM picks is a colour the swatch can also
// express (a player can paint the background back in). Only shown when the upload has alpha.

import { useId } from 'vue'
import { CLASSIC_BASE, rgbToHex } from '@/lib'

defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [hex: string] }>()

const labelId = useId()
const OPTIONS = CLASSIC_BASE.map(({ name, rgb }) => ({ name, hex: rgbToHex(...rgb) }))
</script>

<template>
  <div class="picker__setting picker__setting--inline">
    <span :id="labelId" class="picker__setting-label">Alpha colour</span>
    <div class="picker__bg-list" role="group" :aria-labelledby="labelId">
      <button
        v-for="opt in OPTIONS"
        :key="opt.name"
        class="picker__bg"
        :class="{ 'is-active': modelValue === opt.hex }"
        type="button"
        :style="{ background: opt.hex }"
        :aria-label="`${opt.name} background`"
        :aria-pressed="modelValue === opt.hex"
        @click="emit('update:modelValue', opt.hex)"
      />
    </div>
  </div>
</template>
