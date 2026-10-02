<script setup lang="ts">
// Entry's "I have a code" step: the room-code field, formatted as typed, checked for shape and
// then against the server before `join` fires, with any miss shown under the field.

import { ArrowLeft, ArrowRight, LoaderCircle } from '@lucide/vue'
import { nextTick, onMounted, ref, useTemplateRef } from 'vue'
import Button from '@/components/elements/Button.vue'
import { announce, formatRoomInput, isRoomCode, roomExists } from '@/lib'

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
// The existence probe is in flight; the field and Join are disabled until it settles.
const checking = ref(false)

onMounted(() => input.value?.focus())

// The caret maps through the formatter by formatting the text before it, so a character
// dropped mid-code doesn't throw the caret to the end.
function format(el: HTMLInputElement) {
  const caret = el.selectionStart ?? el.value.length
  const formatted = formatRoomInput(el.value)
  code.value = formatted
  error.value = null
  if (el.value === formatted)
    return
  const at = Math.min(formatRoomInput(el.value.slice(0, caret)).length, formatted.length)
  el.value = formatted
  el.setSelectionRange(at, at)
}

// Rewriting the value mid-composition garbles input on Android keyboards (they compose Latin
// text too) and CJK IMEs, so formatting waits for `compositionend`.
function onInput(e: Event) {
  if (!(e as InputEvent).isComposing)
    format(e.target as HTMLInputElement)
}

// An a11y invariant: the error is spoken exactly once. Focus moving to the field reads it via
// aria-describedby; when focus is already there, nothing moves, so it's announced instead.
async function fail(message: string) {
  const focused = document.activeElement === input.value
  error.value = message
  if (focused) {
    announce(message, 'assertive')
    return
  }
  // The field re-enables and links the message on the next render; a disabled field refuses focus.
  await nextTick()
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
        :disabled="checking || busy"
        placeholder="feral-crayon, or paste the link"
        autocomplete="off"
        autocapitalize="none"
        spellcheck="false"
        enterkeyhint="go"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="error ? 'entry-code-error' : undefined"
        @input="onInput"
        @compositionend="format($event.target as HTMLInputElement)"
      >
      <p v-if="error" id="entry-code-error" class="entry__error">
        {{ error }}
      </p>
    </div>

    <Button
      variant="primary"
      size="large"
      block
      type="submit"
      :disabled="!code || checking || busy"
      :aria-busy="checking || undefined"
      :aria-label="checking ? 'Checking room code' : busy ? 'Joining room' : undefined"
    >
      <span class="entry__morph" :class="{ 'entry__morph--active': checking || busy }">
        <span class="entry__morph-text">Join room</span>
        <LoaderCircle v-if="checking" class="entry__morph-icon entry__spinner" :size="20" aria-hidden="true" />
        <ArrowRight v-else class="entry__morph-icon" :size="20" aria-hidden="true" />
      </span>
    </Button>
  </form>
</template>
