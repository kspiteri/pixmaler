<script setup lang="ts">
// Keyboard-shortcuts help at the foot of the tools panel — a disclosure over a list. Hidden
// in Touch mode (no keyboard) and when shortcuts are disabled; owns its own open state. The
// `.tools-panel__shortcuts*` chrome lives in `_tools-panel.scss` (this renders inside the panel).

import type { Component } from 'vue'
import { ArrowBigUp, ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Keyboard, Mouse } from '@lucide/vue'
import { markRaw, ref } from 'vue'
import Button from '@/components/elements/Button.vue'
import { isTouch, shortcutsEnabled } from '@/lib'

const open = ref(false)

interface Shortcut {
  // The actual key, in words — the truth, the fallback when there's no icon, and what a
  // screen reader announces (the icons are silent to it).
  key: string
  // Optional icon visualisation; omit and the pill shows `key`. Icons must be markRaw'd.
  shortcut?: (string | Component)[]
  desc: string
  // Optional fuller spoken label; falls back to `key` — e.g. read "⌘/Ctrl+Z" as words.
  aria?: string
}

const SHORTCUTS: Shortcut[] = [
  { key: 'hold Shift', shortcut: ['hold', markRaw(ArrowBigUp)], desc: 'show colour map, tap to switch' },
  { key: 'arrow keys', shortcut: [markRaw(ArrowLeft), markRaw(ArrowRight)], desc: 'change colour' },
  { key: 'scroll wheel', shortcut: [markRaw(Mouse), 'scroll'], desc: 'change brush size' },
  { key: '⌘/Ctrl+Z', aria: 'Command or Control plus Z', desc: 'undo' },
]
</script>

<template>
  <div v-if="!isTouch && shortcutsEnabled" class="tools-panel__shortcuts">
    <Button
      variant="subtle"
      size="x-small"
      block
      aria-label="Keyboard shortcuts"
      :aria-expanded="open"
      @pointerdown.stop
      @click="open = !open"
    >
      <template #icon>
        <Keyboard :size="14" />
      </template>
      for the pros
      <template #trailing>
        <ChevronUp v-if="open" :size="14" />
        <ChevronDown v-else :size="14" />
      </template>
    </Button>
    <ul v-if="open">
      <li v-for="s in SHORTCUTS" :key="s.desc">
        <kbd role="img" :aria-label="s.aria ?? s.key">
          <template v-if="s.shortcut">
            <template v-for="(t, i) in s.shortcut" :key="i">
              <component :is="t" v-if="typeof t !== 'string'" :size="13" />
              <span v-else>{{ t }}</span>
            </template>
          </template>
          <template v-else>{{ s.key }}</template>
        </kbd>
        <span>{{ s.desc }}</span>
      </li>
    </ul>
  </div>
</template>
