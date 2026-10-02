<script setup lang="ts">
// Entry's "I have a code" step: the room-code field, formatted as typed, checked for shape and
// then against the server before `join` fires, with any miss shown under the field.

import { ArrowLeft, ArrowRight } from '@lucide/vue'
import { onMounted, ref, useTemplateRef } from 'vue'
import Button from '@/components/elements/Button.vue'
import { formatRoomInput, isRoomCode, roomExists } from '@/lib'

const props = defineProps<{
  // Entry has claimed the navigation for this join.
  busy: boolean
}>()

const emit = defineEmits<{
  back: []
  // `since` is when the press landed, so Entry can count the probe against the confirm morph.
  join: [room: string, since: number]
}>()

const code = defineModel<string>('code', { required: true })

const input = useTemplateRef<HTMLInputElement>('input')
const error = ref<string | null>(null)
const checking = ref(false)

onMounted(() => input.value?.focus())

// Lowercasing and space → hyphen keep the length, so the caret stays put; a pasted link
// changes it, and the caret then sits at the end anyway.
function onInput(e: Event) {
  const el = e.target as HTMLInputElement
  const caret = el.selectionStart
  const formatted = formatRoomInput(el.value)
  const keepCaret = formatted.length === el.value.length
  el.value = formatted
  code.value = formatted
  error.value = null
  if (keepCaret && caret !== null)
    el.setSelectionRange(caret, caret)
}

function fail(message: string) {
  error.value = message
  input.value?.focus()
}

// A malformed code can't be a live room, so it's refused before the probe. The probe fails
// open, so a network blip still joins and the room route's own check is the backstop.
async function submit() {
  if (checking.value || props.busy)
    return
  const room = code.value.replace(/-+$/, '')
  if (!isRoomCode(room)) {
    fail('That isn\'t a valid room code.')
    return
  }
  error.value = null
  checking.value = true
  const since = Date.now()
  const exists = await roomExists(room)
  checking.value = false
  if (!exists) {
    fail(`No room called ${room.replace('-', '\u2011')}. This could be an old url from a previous game.`)
    return
  }
  emit('join', room, since)
}

function back() {
  if (!checking.value && !props.busy)
    emit('back')
}
</script>

<template>
  <form class="entry__step" @submit.prevent="submit" @keydown.esc="back">
    <Button variant="subtle" size="small" class="entry__back" @click="back">
      <template #icon>
        <ArrowLeft :size="16" aria-hidden="true" />
      </template>
      Back
    </Button>

    <div class="field">
      <label class="label" for="entry-room-code">Room code</label>
      <input
        id="entry-room-code"
        ref="input"
        class="input entry__code"
        type="text"
        :value="code"
        placeholder="feral-crayon, or paste the link"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        enterkeyhint="go"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="error ? 'entry-code-error' : undefined"
        @input="onInput"
      >
      <p v-if="error" id="entry-code-error" class="entry__error" role="alert">
        {{ error }}
      </p>
    </div>

    <Button
      variant="primary"
      size="large"
      block
      type="submit"
      :disabled="!code"
      :aria-label="checking || busy ? 'Joining room' : undefined"
    >
      <span class="entry__morph" :class="{ 'entry__morph--active': checking || busy }">
        <span class="entry__morph-text">Join room</span>
        <ArrowRight class="entry__morph-icon" :size="20" aria-hidden="true" />
      </span>
    </Button>
  </form>
</template>
