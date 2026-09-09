<script setup lang="ts">
// The display-name field, used everywhere a player names themselves (Entry, the name gate,
// the lobby rename). One reusable unit so the placeholder and the "randomise" dice — a
// data-minimisation nudge — are identical at every site. `inheritAttrs: false` +
// `v-bind="$attrs"` on the <input> routes native bits (autofocus, @blur, @keydown) to it.

import { Dices } from '@lucide/vue'
import { useId, useTemplateRef } from 'vue'
import { wordPair } from '../lib/words'

defineOptions({ inheritAttrs: false })
defineProps<{ label: string }>()
const model = defineModel<string>({ required: true })

const id = useId()
const input = useTemplateRef<HTMLInputElement>('input')

function randomise() {
  model.value = wordPair()
  input.value?.focus()
}
</script>

<template>
  <div class="name-field">
    <label class="label" :for="id">{{ label }}</label>
    <div class="name-field__row">
      <input
        :id="id"
        ref="input"
        v-model="model"
        class="input"
        type="text"
        maxlength="24"
        placeholder="a nickname is enough"
        v-bind="$attrs"
      >
      <button
        type="button"
        class="name-field__dice pressable"
        aria-label="Suggest a random name"
        title="Random name"
        @click="randomise"
      >
        <Dices :size="18" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
