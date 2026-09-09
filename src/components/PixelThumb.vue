<script setup lang="ts">
// Read-only pixel-art thumbnail: mounts an imperative PixelCanvas into its root and
// re-mounts when the grid changes. For any static target/drawing shown outside the editor.

import { onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { PixelCanvas } from '../lib/canvas/pixel'

const props = defineProps<{
  gridW: number
  gridH: number
  palette: string[]
  grid: number[]
}>()

const root = useTemplateRef<HTMLElement>('root')
let pc: PixelCanvas | null = null

function render() {
  if (!root.value)
    return
  pc = new PixelCanvas({
    gridW: props.gridW,
    gridH: props.gridH,
    palette: props.palette,
    targetGrid: props.grid,
    editable: false,
  })
  root.value.replaceChildren(pc.canvas)
}

onMounted(render)
watch(() => [props.gridW, props.gridH, props.palette, props.grid], render, { flush: 'post' })
onBeforeUnmount(() => { pc = null })
</script>

<template>
  <div ref="root" />
</template>
