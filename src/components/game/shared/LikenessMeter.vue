<script setup lang="ts">
// A drawing's likeness: the number, in the normal text colour, over a thin meter that fills and
// turns lime as it nears 100. The number carries the value, so the meter is hidden from
// assistive technology. Renders nothing when there is no likeness to show.
defineProps<{ likeness: number | null }>()
</script>

<template>
  <div v-if="likeness !== null" class="likeness-meter" :style="{ '--likeness': `${likeness}%` }">
    <p class="likeness-meter__value">
      <span class="likeness-meter__label">likeness</span> {{ likeness }}%
    </p>
    <div class="likeness-meter__track" aria-hidden="true">
      <span class="likeness-meter__fill" />
    </div>
  </div>
</template>
