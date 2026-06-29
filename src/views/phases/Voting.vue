<script setup lang="ts">
// VOTING phase — anonymised gallery. Click a thumbnail to cast a vote;
// click another to change it. The server allows re-votes during VOTING.
//
// Tallies are intentionally hidden until RESULTS — broadcasting running
// counts would influence later voters and ruin the social tension.

import type { ClientMsg, ServerMsg, Submission, VoteCategory } from '../../lib/types'
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import PhaseLayout from '../../components/PhaseLayout.vue'
import { PixelCanvas } from '../../lib/canvas'
import { clientIdKey, socketKey } from '../../lib/keys'
import { VOTE_CATEGORIES } from '../../lib/types'

type Gallery = Extract<ServerMsg, { type: 'gallery' }>
type VoteState = Extract<ServerMsg, { type: 'vote-state' }>

const props = defineProps<{
  gallery: Gallery | null
  gmClientId: string
  votedCount: number
  totalVoters: number
  // Echoed by the server on (re)join during VOTING — this voter's own picks, so
  // a reconnecting player sees their votes restored instead of a blank slate.
  voteState: VoteState | null
}>()

const socket = inject(socketKey)!.value!
const clientId = inject(clientIdKey)!

const isGm = computed(() => props.gmClientId === clientId)

// Every submission in a room shares the GM's single image dimensions, so one
// aspect ratio drives all the thumbnail slots. Falls back to 1 (square) until
// the gallery lands. Drives `--art-ratio` on the root; slots read it via
// `aspect-ratio` so non-square images aren't squished.
const artRatio = computed(() =>
  props.gallery ? `${props.gallery.gridW} / ${props.gallery.gridH}` : '1 / 1',
)

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

// Local-only — not echoed by the server during VOTING. One submissionId per
// category (null until cast). We trust our own optimistic update because the
// server only rejects self-votes / wrong-phase / unknown categories.
const myVotes = ref<Record<VoteCategory, string | null>>({ funniest: null, best: null })

function emptyVotes(): Record<VoteCategory, string | null> {
  return { funniest: null, best: null }
}

// Rehydrate my picks from the server's echo on (re)join. Only fills categories
// the server reported — never clobbers a fresh optimistic vote with stale null.
// `immediate` so a reconnect that lands before this view mounts still applies.
watch(() => props.voteState, (vs) => {
  if (!vs)
    return
  for (const c of VOTE_CATEGORIES) {
    const picked = vs.votes[c.id]
    if (picked)
      myVotes.value[c.id] = picked
  }
}, { immediate: true })

// Which of my category votes have landed on a given submission — drives the
// stickers shown on that card.
function votedCategoriesFor(submissionId: string) {
  return VOTE_CATEGORIES.filter(c => myVotes.value[c.id] === submissionId)
}

// True once every category has a vote — players know they're done.
const allCast = computed(() => VOTE_CATEGORIES.every(c => myVotes.value[c.id] !== null))

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
    myVotes.value = emptyVotes()
  }
  // Wait two ticks: the first lets Vue patch the DOM (including :ref
  // callbacks that populate slotMap), the second is belt-and-braces in
  // case the v-if="gallery" gate causes a second patch pass.
  await nextTick()
  await nextTick()
  mountCanvases(slotMap)
}, { immediate: true })

onBeforeUnmount(disposeCanvases)

function castVote(category: VoteCategory, submissionId: string) {
  // Self-vote guard mirrors the server's; let the click do nothing rather
  // than triggering a server "Cannot vote for yourself" error.
  if (submissionId === clientId)
    return
  // No-op if this category already points here (avoids a redundant send).
  if (myVotes.value[category] === submissionId)
    return
  // A category vote can move between cards but isn't withdrawable — the server
  // has no "unvote" and auto-end counts each cast category once.
  myVotes.value = { ...myVotes.value, [category]: submissionId }
  const msg: ClientMsg = { type: 'vote:cast', category, submissionId }
  socket.send(JSON.stringify(msg))
}
</script>

<template>
  <PhaseLayout>
    <template #status>
      <span class="voting__tally">{{ votedCount }} of {{ totalVoters }} voted</span>
      <button
        v-if="isGm && gallery"
        class="btn btn--primary voting__stop"
        type="button"
        @click="stopVoting"
      >
        End voting →
      </button>
    </template>

    <div class="voting" :style="{ '--art-ratio': artRatio }">
      <header class="voting__head">
        <p class="voting__eyebrow">
          vote for the funniest and the best
        </p>
        <p class="voting__hint">
          <template v-if="allCast">
            all votes in — waiting for the others…
          </template>
          <template v-else>
            you've voted:
            <span
              v-for="c in VOTE_CATEGORIES"
              :key="c.id"
              class="voting__hint-cat"
              :class="{ 'voting__hint-cat--done': myVotes[c.id] }"
            >{{ c.emoji }}</span>
          </template>
        </p>
      </header>

      <div v-if="gallery" class="voting__grid">
        <div
          v-for="sub in ordered"
          :key="sub.submissionId"
          class="voting__card"
          :class="{ 'voting__card--mine': sub.submissionId === clientId }"
        >
          <div class="voting__art">
            <div :ref="el => setSlot(sub.submissionId, el)" class="voting__slot" />
            <!-- Your votes' stickers, top-anchored, side by side. -->
            <div v-if="votedCategoriesFor(sub.submissionId).length" class="voting__stickers">
              <span
                v-for="c in votedCategoriesFor(sub.submissionId)"
                :key="c.id"
                class="voting__sticker"
              >{{ c.emoji }}</span>
            </div>
            <span v-if="sub.submissionId === clientId" class="voting__tag">Yours</span>
          </div>

          <div v-if="sub.submissionId !== clientId" class="voting__cats">
            <button
              v-for="c in VOTE_CATEGORIES"
              :key="c.id"
              class="voting__cat"
              :class="{ 'voting__cat--active': myVotes[c.id] === sub.submissionId }"
              type="button"
              :aria-pressed="myVotes[c.id] === sub.submissionId"
              :title="`Vote ${c.label}`"
              @click="castVote(c.id, sub.submissionId)"
            >
              <span class="voting__cat-emoji">{{ c.emoji }}</span>
              {{ c.label }}
            </button>
          </div>
          <p v-else class="voting__cats voting__cats--mine">
            can't vote for your own
          </p>
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
  height: auto;
  background: #fff;
}
</style>
