<script setup lang="ts">
// VOTING phase — anonymised gallery. Click a thumbnail to cast a vote;
// click another to change it. The server allows re-votes during VOTING.
//
// Tallies are intentionally hidden until RESULTS — broadcasting running
// counts would influence later voters and ruin the social tension.

import type { ClientMsg, ServerMsg, Submission } from '../../lib/types'
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import PhaseLayout from '../../components/PhaseLayout.vue'
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

// Per-client gallery order. The drawings are shuffled locally so no two players
// see the same arrangement (purely cosmetic — votes carry the submissionId, so
// order is irrelevant to the server). Frozen per round: we only reshuffle when
// the *set* of submissions changes, so a rejoin re-send doesn't scramble the
// cards mid-vote.
const ordered = ref<Submission[]>([])

function shuffle<T>(input: T[]): T[] {
  const arr = [...input]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function sameSet(a: Submission[], b: Submission[]): boolean {
  if (a.length !== b.length)
    return false
  const ids = new Set(a.map(s => s.submissionId))
  return b.every(s => ids.has(s.submissionId))
}

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
  const subs = props.gallery?.submissions ?? []
  // Reshuffle only on a genuinely new submission set (new round); a rejoin
  // re-send of the same set keeps the existing order so cards don't jump.
  if (!sameSet(ordered.value, subs)) {
    ordered.value = shuffle(subs)
    myVote.value = null
  }
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
  <PhaseLayout>
    <template #status>
      <button
        v-if="isGm && gallery"
        class="btn btn--plain voting__stop"
        type="button"
        @click="stopVoting"
      >
        Stop voting (GM)
      </button>
    </template>

    <div class="voting">
      <header class="voting__head">
        <p class="voting__eyebrow">
          which is the funniest recreation?
        </p>
        <p class="voting__hint">
          tap a drawing to vote · you can change your mind
        </p>
      </header>

      <div v-if="gallery" class="voting__grid">
        <!--
          Using <div role="button"> rather than <button> because the HTML spec
          only allows phrasing content inside <button>, and browsers render
          block descendants (our slot with aspect-ratio: 1/1) with collapsed
          sizing — the canvas ends up 0px tall. role="button" + tabindex + a
          keyboard handler give us the same a11y without the layout quirk.
        -->
        <div
          v-for="sub in ordered"
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
          <span v-if="sub.submissionId === myVote" class="voting__check">✓</span>
          <span v-if="sub.submissionId === clientId" class="voting__tag">Yours</span>
        </div>
      </div>

      <p v-else class="voting__waiting">
        Waiting for the gallery…
      </p>
    </div>
  </PhaseLayout>
</template>

<style scoped lang="scss">
// Static layout lives in styles/_voting.scss. Only the :deep rule reaching the
// imperatively-mounted PixelCanvas stays here — :deep needs the scoped context.
.voting :deep(.voting__canvas) {
  display: block;
  width: 100%;
  height: 100%;
  background: #fff;
}
</style>
