<script setup lang="ts">
// VOTING phase — anonymised gallery. Click a thumbnail to cast a vote;
// click another to change it. The server allows re-votes during VOTING.
//
// Tallies are intentionally hidden until RESULTS — broadcasting running
// counts would influence later voters and ruin the social tension.

import type { ClientMsg, ServerMsg, Submission, VoteCategory } from '../../lib/types'
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PhaseLayout from '../../components/PhaseLayout.vue'
import { artRatio as artRatioFor } from '../../lib/aspect'
import { PixelCanvas } from '../../lib/canvas'
import { askConfirm } from '../../lib/dialog'
import { clientIdKey, socketKey } from '../../lib/keys'
import { VOTE_CATEGORIES } from '../../lib/types'

const props = defineProps<{
  gallery: Gallery | null
  gmClientId: string
  votedCount: number
  totalVoters: number
  // Echoed by the server on (re)join during VOTING — this voter's own picks, so
  // a reconnecting player sees their votes restored instead of a blank slate.
  voteState: VoteState | null
  // The VOTING backstop's expiry (party/server.ts, DEFAULT_VOTING_MS). Generous and
  // normally unreachable, so it is surfaced only in the final stretch — a clock on
  // the whole phase would make voting feel raced, which it isn't meant to be.
  deadline: number | null
  // Joined mid-round: they see the gallery but don't judge it. The server already
  // refuses their `vote:cast` and leaves them out of the tally, so this only
  // decides what they see.
  spectating: boolean
}>()

// Resolve a `public/`-hosted asset path against Vite's `base` (e.g.
// `/pixmaler/`) so absolute URLs don't skip the base and 404.
function iconUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`
}

type Gallery = Extract<ServerMsg, { type: 'gallery' }>
type VoteState = Extract<ServerMsg, { type: 'vote-state' }>

const socket = inject(socketKey)!.value!
const clientId = inject(clientIdKey)!

const isGm = computed(() => props.gmClientId === clientId)

// Every submission in a room shares the GM's single image dimensions, so one
// aspect ratio drives all the thumbnail slots. Falls back to 1 (square) until
// the gallery lands. Drives `--art-ratio` on the root; slots read it via
// `aspect-ratio` so non-square images aren't squished.
const artRatio = computed(() =>
  props.gallery ? artRatioFor(props.gallery.gridW, props.gallery.gridH) : '1 / 1',
)

// Countdown for the backstop. A 1 s interval is plenty — this is a warning, not the
// drawing phase's frame-accurate clock, so no rAF. `null` until the final stretch,
// which is what keeps it out of the way for the whole normal phase.
const WARN_AT_SECONDS = 30
const secondsLeft = ref<number | null>(null)
let tick: ReturnType<typeof setInterval> | undefined

function readClock() {
  if (props.deadline === null) {
    secondsLeft.value = null
    return
  }
  const remaining = Math.max(0, Math.ceil((props.deadline - Date.now()) / 1000))
  secondsLeft.value = remaining <= WARN_AT_SECONDS ? remaining : null
}

onMounted(() => {
  readClock()
  tick = setInterval(readClock, 1000)
})
onBeforeUnmount(() => clearInterval(tick))
// The GM can extend nothing here, but the deadline still moves on a rejoin (the
// server re-sends it), so re-read rather than trusting the mount-time value.
watch(() => props.deadline, readClock)

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

// Everyone *present* has finished voting. Both sides of the fraction come from the
// same population (`votingProgress` on the server), so this can un-fire when a
// straggler reconnects — which is why the state lives in the status line rather
// than a dialog.
const allVoted = computed(() => props.totalVoters > 0 && props.votedCount >= props.totalVoters)

// The only way out of the phase, so a misclick ruins the round — but the warning is
// only *true* while someone can still be cut off. Once everyone has voted there is
// nobody left to not count, so asking would be confirming an impossible consequence.
async function stopVoting() {
  if (!allVoted.value && !await askConfirm('End voting now? Anyone who hasn\'t finished voting won\'t be counted.'))
    return
  const msg: ClientMsg = { type: 'gm:stopVoting' }
  socket.send(JSON.stringify(msg))
}

// Unconditionally confirmed, unlike stopVoting above: that suppresses its dialog
// once everyone has voted because the warning stops being true, whereas cancelling
// always destroys work everyone else did. Nothing makes that consequence untrue.
async function cancelRound() {
  if (!await askConfirm('Cancel this round? Everyone goes back to the lobby and the drawings are lost.'))
    return
  const msg: ClientMsg = { type: 'gm:cancelRound' }
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

// A wiped canvas is in the gallery so the reveal can acknowledge its author, but it
// is not a candidate — there is nothing on it to judge, and the server refuses a
// vote for one. Filtered out here rather than server-side so RESULTS still receives
// it: this is the only screen where an unvotable card would be dead weight.
function isBlank(sub: Submission): boolean {
  return sub.grid.every(cell => cell === -1)
}

// How many drew and then wiped it. Stated in the header so the count people voted
// on matches the count they see on the reveal — otherwise an extra entry appears
// from nowhere and reads as "was there a card I couldn't see?".
const wipedCount = computed(() => (props.gallery?.submissions ?? []).filter(isBlank).length)

watch(() => props.gallery, async () => {
  const subs = (props.gallery?.submissions ?? []).filter(s => !isBlank(s))
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
      <span class="voting__tally" :class="{ 'voting__tally--complete': allVoted }">
        {{ allVoted ? 'the votes are in…' : `${votedCount} of ${totalVoters} voted` }}
      </span>
      <!-- Only present in the final stretch, so it reads as a warning rather than a
           clock. `role="status"` because a deadline nobody can see coming is worse
           than no deadline — and this must not be sight-only. -->
      <span v-if="secondsLeft !== null" class="voting__clock" role="status">
        {{ secondsLeft }}s to vote
      </span>
      <button
        v-if="isGm && gallery"
        class="btn btn--primary voting__stop"
        type="button"
        @click="stopVoting"
      >
        End voting
      </button>
      <button
        v-if="isGm"
        class="btn btn--ghost voting__cancel"
        type="button"
        title="Abandon this round and return everyone to the lobby"
        @click="cancelRound"
      >
        Cancel round
      </button>
    </template>

    <div class="voting" :style="{ '--art-ratio': artRatio }">
      <header class="voting__head">
        <p class="voting__eyebrow">
          {{ spectating ? "you joined mid-round — watch this one" : "vote for the funniest and the best" }}
        </p>
        <p class="voting__hint">
          <template v-if="spectating">
            you're in for the next round.
          </template>
          <template v-else-if="allCast">
            your votes are in. waiting for the rest.
          </template>
          <template v-else>
            you've voted:
            <span
              v-for="c in VOTE_CATEGORIES"
              :key="c.id"
              class="voting__hint-cat"
              :class="{ 'voting__hint-cat--done': myVotes[c.id] }"
            ><img :src="iconUrl(c.icon)" :alt="c.label" class="voting__hint-icon"></span>
          </template>
        </p>
        <!-- Only when somebody wiped. Keeps the count people vote on equal to the
             count on the reveal, so a blank entry there doesn't read as a card they
             were never shown. Anonymous by design — the gallery is, and naming the
             worst performer before a single vote is cast would be a partial leak. -->
        <p v-if="wipedCount" class="voting__wiped">
          {{ ordered.length }} to judge — {{ wipedCount === 1 ? 'one player wiped theirs' : `${wipedCount} players wiped theirs` }}
        </p>
      </header>

      <!-- `ordered.length`, not just `gallery`: a truthy gallery message with zero
           submissions rendered a 0-height grid under the heading — a void, with no
           fallback, because the `v-else` below only covers "no gallery yet". The
           server now skips VOTING entirely when nobody drew, so this is unreachable
           by design; it stays guarded so the hole can't come back. -->
      <div v-if="gallery && ordered.length" class="voting__grid">
        <div
          v-for="sub in ordered"
          :key="sub.submissionId"
          class="voting__card"
          :class="{ 'voting__card--mine': sub.submissionId === clientId }"
        >
          <div class="voting__art art-frame">
            <div :ref="el => setSlot(sub.submissionId, el)" class="art-surface" />
            <!-- Your votes' stickers, top-anchored, side by side. -->
            <div v-if="votedCategoriesFor(sub.submissionId).length" class="voting__stickers">
              <span
                v-for="c in votedCategoriesFor(sub.submissionId)"
                :key="c.id"
                class="voting__sticker"
              ><img :src="iconUrl(c.icon)" :alt="c.label" class="voting__sticker-icon"></span>
            </div>
            <span v-if="sub.submissionId === clientId" class="voting__tag">Yours</span>
          </div>

          <div v-if="!spectating && sub.submissionId !== clientId" class="voting__cats">
            <button
              v-for="c in VOTE_CATEGORIES"
              :key="c.id"
              class="voting__cat pressable"
              :class="{ 'voting__cat--active': myVotes[c.id] === sub.submissionId }"
              type="button"
              :aria-pressed="myVotes[c.id] === sub.submissionId"
              :title="`Vote ${c.label}`"
              @click="castVote(c.id, sub.submissionId)"
            >
              <img :src="iconUrl(c.icon)" alt="" class="voting__cat-icon">
              {{ c.label }}
            </button>
          </div>
          <p v-else class="voting__cats voting__cats--mine">
            can't vote for your own
          </p>
        </div>
      </div>

      <p v-else-if="gallery" class="voting__waiting">
        nobody drew anything…
      </p>
      <p v-else class="voting__waiting">
        hanging the exhibition…
      </p>
    </div>
  </PhaseLayout>
</template>
