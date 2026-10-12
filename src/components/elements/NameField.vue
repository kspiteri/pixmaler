<script setup lang="ts">
// The display-name field, used everywhere a player names themselves (the name gate, the lobby
// rename). One reusable unit so the placeholder and the "randomise" dice — a
// data-minimisation nudge — are identical at every site. Binding `v-model:shape` adds a live
// avatar preview and the shape picker, in an accordion (`shapesOpen` starts it expanded).
// `inheritAttrs: false` + `v-bind="$attrs"` on the <input> routes native bits (autofocus,
// @blur, @keydown) to it.

import type { AvatarShape } from '@/lib'
import { Dices } from '@lucide/vue'
import { computed, ref, useId, useTemplateRef } from 'vue'
import { initialOf, NAME_MAX_LEN, shapeLabel, wordPair } from '@/lib'
import Accordion from './accordion/Accordion.vue'
import AccordionItem from './accordion/Item.vue'
import Avatar from './Avatar.vue'
import AvatarPicker from './AvatarPicker.vue'
import Button from './Button.vue'

defineOptions({ inheritAttrs: false })
const props = defineProps<{
  label: string
  seed?: string
  colour?: string
  shapesOpen?: boolean
}>()
const model = defineModel<string>({ required: true })
const shape = defineModel<AvatarShape>('shape')

const openId = ref(props.shapesOpen ? 'shape' : null)

const id = useId()
const input = useTemplateRef<HTMLInputElement>('input')
const initial = computed(() => initialOf(model.value))

function randomise() {
  model.value = wordPair()
  input.value?.focus()
}
</script>

<template>
  <div class="name-field">
    <label class="label" :for="id">{{ label }}</label>
    <div class="name-field__row">
      <Avatar
        v-if="shape"
        class="name-field__preview"
        :shape="shape"
        :initial="initial"
        :seed="seed ?? ''"
        :colour="colour"
      />
      <input
        :id="id"
        ref="input"
        v-model="model"
        class="input"
        type="text"
        :maxlength="NAME_MAX_LEN"
        placeholder="a nickname is enough"
        v-bind="$attrs"
      >
      <Button
        variant="tertiary"
        icon
        class="name-field__dice"
        aria-label="Suggest a random name"
        title="Random name"
        @click="randomise"
      >
        <template #icon>
          <Dices :size="18" aria-hidden="true" />
        </template>
      </Button>
    </div>
    <Accordion v-if="shape" v-model="openId" class="name-field__shapes">
      <AccordionItem id="shape" title="Avatar shape">
        <template #summary>
          {{ shapeLabel(shape) }}
        </template>
        <AvatarPicker
          v-model="shape"
          :initial="initial"
          :seed="seed ?? ''"
          :colour="colour"
        />
      </AccordionItem>
    </Accordion>
  </div>
</template>
