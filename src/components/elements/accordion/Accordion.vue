<script setup lang="ts">
// Single-open accordion: only one item is expanded at a time. Items self-register through
// provide/inject; give each <Item> a stable `id`. `v-model` exposes the open id so a host can
// drive it (e.g. auto-advance to the next step once an image is chosen).

import { provide, ref, watch } from 'vue'
import { accordionKey } from './key'

const props = defineProps<{ modelValue?: string | null }>()
const emit = defineEmits<{ 'update:modelValue': [id: string | null] }>()

const openId = ref<string | null>(props.modelValue ?? null)
watch(() => props.modelValue, (v) => {
  if (v !== undefined)
    openId.value = v
})
watch(openId, v => emit('update:modelValue', v))

provide(accordionKey, {
  openId,
  toggle: (id: string) => { openId.value = openId.value === id ? null : id },
})
</script>

<template>
  <div class="accordion">
    <slot />
  </div>
</template>
