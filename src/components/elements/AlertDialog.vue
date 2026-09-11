<script setup lang="ts">
// The app's modal surface: `mode` renders acknowledgement (one action) or yes/no (two). Native
// <dialog> + showModal(), so focus trapping, restore, Esc and the top layer come from the
// platform. Don't call directly — go through lib/dialog.ts, which owns the single instance.

import { onMounted, useId, useTemplateRef } from 'vue'

const props = withDefaults(defineProps<{
  message: string
  mode?: 'alert' | 'confirm'
}>(), { mode: 'alert' })

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const dialogEl = useTemplateRef<HTMLDialogElement>('dialogEl')
const msgId = useId()

onMounted(() => dialogEl.value?.showModal())

// Esc fires native `cancel`, default-prevented so the element never closes itself: a
// <dialog> that closed behind its own v-if would leave an invisible, un-reopenable modal.
function onEscape() {
  if (props.mode === 'confirm')
    emit('cancel')
  else
    emit('confirm')
}
</script>

<template>
  <dialog
    ref="dialogEl"
    class="alert-dialog"
    role="alertdialog"
    :aria-describedby="msgId"
    @cancel.prevent="onEscape"
  >
    <p :id="msgId" class="alert-dialog__msg">
      {{ message }}
    </p>
    <div class="alert-dialog__actions">
      <button
        v-if="mode === 'confirm'"
        class="btn btn--plain"
        type="button"
        autofocus
        @click="emit('cancel')"
      >
        Cancel
      </button>
      <button
        class="btn btn--primary"
        type="button"
        :autofocus="mode === 'alert'"
        @click="emit('confirm')"
      >
        OK
      </button>
    </div>
  </dialog>
</template>
