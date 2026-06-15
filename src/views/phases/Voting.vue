<script setup lang="ts">
// VOTING phase — anonymised gallery. Click a thumbnail to cast a vote;
// click another to change it. The server allows re-votes during VOTING.
//
// Tallies are intentionally hidden until RESULTS — broadcasting running
// counts would influence later voters and ruin the social tension.

import type { ClientMsg, ServerMsg } from '../../lib/types'
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { PixelCanvas } from '../../lib/canvas'
import { clientIdKey, socketKey } from '../../lib/keys'

type Gallery = Extract<ServerMsg, { type: 'gallery' }>

const props = defineProps<{
  gallery: Gallery | null
  gmClientId: string
}>()

const socket = inject(socketKey)!
const clientId = inject(clientIdKey)!

const isGm = computed(() => props.gmClientId === clientId)

function stopVoting() {
  const msg: ClientMsg = { type: 'gm:stopVoting' }
  socket.send(JSON.stringify(msg))
}

// Local-only — not echoed by the server during VOTING. The submissionId
// stored is set after the server accepts the vote (we trust our own
// optimistic update because the server only rejects self-votes/wrong-phase).
const myVote = ref<string | null>(null)

// Track PixelCanvas instances so we can dispose them when the gallery changes
// or this view unmounts. Each instance owns mouse handlers; orphaning them
// without cleanup leaks listeners on the canvas elements.
let canvases: PixelCanvas[] = []

function disposeCanvases() {
  // PixelCanvas listeners are attached to the canvas element it owns; once
  // the element is removed from the DOM the listeners can't fire anyway.
  // Dropping references is enough.
  canvases = []
}

// Mount each submission's canvas into its slot. Re-runs whenever the gallery
// reference changes (new round = different submissions).
function mountCanvases(slots: Map<string, HTMLElement>) {
  if (!props.gallery)
    return
  disposeCanvases()
  for (const sub of props.gallery.submissions) {
    const slot = slots.get(sub.submissionId)
    if (!slot)
      continue
    const pc = new PixelCanvas({
      gridW: props.gallery.gridW,
      gridH: props.gallery.gridH,
      palette: props.gallery.palette,
      targetGrid: sub.grid,
      editable: false,
    })
    pc.canvas.classList.add('voting__canvas')
    slot.replaceChildren(pc.canvas)
    canvases.push(pc)
  }
}

// Slots keyed by submissionId — bound via the :ref function-form below so
// Vue calls back with each <div> as it mounts.
const slotMap = new Map<string, HTMLElement>()
function setSlot(submissionId: string, el: unknown) {
  if (el instanceof HTMLElement)
    slotMap.set(submissionId, el)
  else slotMap.delete(submissionId)
}

watch(() => props.gallery, async () => {
  myVote.value = null
  // Wait two ticks: the first lets Vue patch the DOM (including :ref
  // callbacks that populate slotMap), the second is belt-and-braces in
  // case the v-if="gallery" gate causes a second patch pass.
  await nextTick()
  await nextTick()
  mountCanvases(slotMap)
}, { immediate: true })

onBeforeUnmount(disposeCanvases)

function castVote(submissionId: string) {
  // Self-vote guard mirrors the server's; let the click do nothing rather
  // than triggering a server "Cannot vote for yourself" error.
  if (submissionId === clientId)
    return
  myVote.value = submissionId
  const msg: ClientMsg = { type: 'vote:cast', submissionId }
  socket.send(JSON.stringify(msg))
}
</script>

<template>
  <div class="page voting">
    <h2>Vote for the funniest</h2>
    <p class="muted">
      Click a drawing to vote. You can change your mind until everyone's voted.
    </p>

    <div v-if="gallery" class="voting__grid">
      <!--
        Using <div role="button"> rather than <button> because the HTML spec
        only allows phrasing content inside <button>, and browsers render
        block descendants (our slot with aspect-ratio: 1/1) with collapsed
        sizing — the canvas ends up 0px tall. role="button" + tabindex + a
        keyboard handler give us the same a11y without the layout quirk.
      -->
      <div
        v-for="sub in gallery.submissions"
        :key="sub.submissionId"
        class="voting__card"
        :class="{
          'voting__card--mine': sub.submissionId === clientId,
          'voting__card--voted': sub.submissionId === myVote,
          'voting__card--disabled': sub.submissionId === clientId,
        }"
        :role="sub.submissionId === clientId ? undefined : 'button'"
        :tabindex="sub.submissionId === clientId ? -1 : 0"
        :aria-pressed="sub.submissionId === myVote"
        :title="sub.submissionId === clientId ? 'You can\'t vote for yourself' : 'Click to vote'"
        @click="castVote(sub.submissionId)"
        @keydown.enter.prevent="castVote(sub.submissionId)"
        @keydown.space.prevent="castVote(sub.submissionId)"
      >
        <div :ref="el => setSlot(sub.submissionId, el)" class="voting__slot" />
        <span v-if="sub.submissionId === clientId" class="voting__tag">Yours</span>
        <span v-else-if="sub.submissionId === myVote" class="voting__tag">Voted</span>
      </div>
    </div>

    <p v-else class="muted">
      Waiting for the gallery…
    </p>

    <button
      v-if="isGm && gallery"
      class="voting__stop"
      type="button"
      @click="stopVoting"
    >
      Stop voting (GM)
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '../../styles/tokens' as *;

.voting {
  &__grid {
    display: flex;
    flex-wrap: wrap;
    gap: $gap-5;
    margin-top: $gap-4;
  }

  &__card {
    flex: 0 0 200px;
    background: $bg;
    border: 2px solid $rule-soft;
    border-radius: 4px;
    padding: $gap-2;
    cursor: pointer;
    font-family: $font-mono;
    transition:
      border-color 80ms,
      transform 80ms;
    position: relative;

    &:focus-visible {
      outline: 2px solid $fg;
      outline-offset: 2px;
    }

    &:hover:not(.voting__card--disabled) {
      border-color: $fg;
      transform: translateY(-2px);
    }

    &--disabled {
      cursor: not-allowed;
      opacity: 0.65;
    }

    &--voted {
      border-color: $accent;
      box-shadow: 0 0 0 2px $accent;
    }

    &--mine {
      border-style: dashed;
    }
  }

  &__slot {
    // The PixelCanvas is appended here. The slot enforces a 1:1 aspect
    // square; the canvas inside fills it. A white background keeps untouched
    // cells (palette[0] in submitted grids — see PixelCanvas.getGrid) from
    // looking like they bleed into the rest of the card on dark palettes.
    width: 100%;
    aspect-ratio: 1 / 1;
    background: #fff;
  }

  :deep(.voting__canvas) {
    display: block;
    width: 100%;
    height: 100%;
    border: 1px solid $rule;
    background: #fff;
  }

  &__tag {
    display: block;
    margin-top: $gap-2;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: $muted;
  }

  &__card--voted &__tag {
    color: $fg;
    font-weight: bold;
  }

  &__stop {
    margin-top: $gap-5;
  }
}
</style>
