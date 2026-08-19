<script setup lang="ts">
// The app's modal surface: `mode` renders acknowledge (one action) or yes/no
// (two). Native <dialog> + showModal(), so focus trapping, focus restore, Esc
// and the top layer come from the platform. Don't call this directly — go
// through lib/dialog.ts, which owns the single instance mounted in App.vue.

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

// Esc fires the native `cancel` event, default-prevented so the element never
// closes itself: a <dialog> that closed behind its own v-if would leave an
// invisible, un-reopenable modal.
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
    <!-- Cancel takes the focus, diverging from native confirm(): both call
         sites are destructive, so Return and Esc should agree. -->
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
