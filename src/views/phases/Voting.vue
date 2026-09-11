<script setup lang="ts">
// VOTING phase — anonymised gallery. Click a thumbnail to cast a vote; click another
// to change it. Tallies stay hidden until RESULTS — running counts would sway voters.

import type { ClientMsg, ServerMsg, Submission, VoteCategory } from '@/lib'
import { CircleSlash } from '@lucide/vue'
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PhaseLayout from '@/components/layout/PhaseLayout.vue'
import { artRatio as artRatioFor, asset, clientIdKey, socketKey, useCountdownAnnounce, useGmActions, useReadonlyCanvases, VOTE_CATEGORIES } from '@/lib'

const props = defineProps<{
  gallery: Gallery | null
  gmClientId: string
  votedCount: number
  totalVoters: number
  // Echoed by the server on (re)join during VOTING — this voter's own picks restored.
  voteState: VoteState | null
  // The VOTING backstop's expiry (party/server.ts). Generous and normally unreachable,
  // so surfaced only in the final stretch.
  deadline: number | null
  // Joined mid-round: sees the gallery but doesn't judge it. The server refuses their
  // `vote:cast`, so this only decides what they see.
  spectating: boolean
}>()

type Gallery = Extract<ServerMsg, { type: 'gallery' }>
type VoteState = Extract<ServerMsg, { type: 'vote-state' }>

const socket = inject(socketKey)!.value!
const clientId = inject(clientIdKey)!
const { stopVoting, cancelRound } = useGmActions(socket)

const isGm = computed(() => props.gmClientId === clientId)

// Every submission shares the GM's image dimensions, so one aspect ratio drives all
// thumbnail slots (via `--art-ratio`). Falls back to 1 (square) until the gallery lands.
const artRatio = computed(() =>
  props.gallery ? artRatioFor(props.gallery.gridW, props.gallery.gridH) : '1 / 1',
)

// Countdown for the backstop. A 1 s interval is plenty — a warning, not a frame-accurate
// clock. `null` until the final stretch, keeping it out of the way for the normal phase.
const WARN_AT_SECONDS = 30
const secondsLeft = ref<number | null>(null)
// Announced into the hidden live region at 30/10 then the last five seconds — never per
// second.
const countdownAnnounce = useCountdownAnnounce(secondsLeft, [30, 10, 5, 4, 3, 2, 1])
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
// Deadline still moves on a rejoin (server re-sends), so re-read on change.
watch(() => props.deadline, readClock)

// Per-client gallery order, shuffled locally so no two players see the same arrangement
// (cosmetic — votes carry the submissionId). Reshuffled only when the submission set changes.
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

// Everyone present has finished voting. Both sides come from the same population, so this
// can un-fire when a straggler reconnects — hence a status line, not a dialog.
const allVoted = computed(() => props.totalVoters > 0 && props.votedCount >= props.totalVoters)

// Local-only — not echoed during VOTING. One submissionId per category (null until cast);
// we trust the optimistic update since the server only rejects invalid votes.
const myVotes = ref<Record<VoteCategory, string | null>>({ funniest: null, best: null })

function emptyVotes(): Record<VoteCategory, string | null> {
  return { funniest: null, best: null }
}

// Rehydrate my picks from the server's echo on (re)join, filling only reported categories.
// `immediate` so a reconnect before mount still applies.
watch(() => props.voteState, (vs) => {
  if (!vs)
    return
  for (const c of VOTE_CATEGORIES) {
    const picked = vs.votes[c.id]
    if (picked)
      myVotes.value[c.id] = picked
  }
}, { immediate: true })

// Which of my category votes landed on a given submission — drives its stickers.
function votedCategoriesFor(submissionId: string) {
  return VOTE_CATEGORIES.filter(c => myVotes.value[c.id] === submissionId)
}

// True once every category has a vote.
const allCast = computed(() => VOTE_CATEGORIES.every(c => myVotes.value[c.id] !== null))

// Mount each rendered submission's drawing into its gallery slot.
const { setSlot } = useReadonlyCanvases(
  () => props.gallery,
  () => {
    const g = props.gallery
    if (!g)
      return []
    return ordered.value.map(sub => ({
      groups: ['gallery'],
      key: sub.submissionId,
      gridW: g.gridW,
      gridH: g.gridH,
      palette: g.palette,
      grid: sub.grid,
    }))
  },
)

// A wiped canvas rides along so the reveal can acknowledge its author, but it's not a
// candidate. Filtered here, not server-side, so RESULTS still receives it.
function isBlank(sub: Submission): boolean {
  return sub.grid.every(cell => cell === -1)
}

// How many drew then wiped it. Stated in the header so the count voted on matches the
// count shown on the reveal.
const wipedCount = computed(() => (props.gallery?.submissions ?? []).filter(isBlank).length)

watch(() => props.gallery, () => {
  const subs = (props.gallery?.submissions ?? []).filter(s => !isBlank(s))
  // Reshuffle only on a genuinely new submission set; a rejoin keeps the order.
  if (!sameSet(ordered.value, subs)) {
    ordered.value = shuffle(subs)
    myVotes.value = emptyVotes()
  }
}, { immediate: true })

function castVote(category: VoteCategory, submissionId: string) {
  // Self-vote guard mirrors the server's; let the click do nothing.
  if (submissionId === clientId)
    return
  // No-op if this category already points here.
  if (myVotes.value[category] === submissionId)
    return
  // A category vote can move between cards but isn't withdrawable — the server has no unvote.
  myVotes.value = { ...myVotes.value, [category]: submissionId }
  const msg: ClientMsg = { type: 'vote:cast', category, submissionId }
  socket.send(JSON.stringify(msg))
}
</script>

<template>
  <PhaseLayout heading="Voting">
    <template #status>
      <span class="voting__tally" :class="{ 'voting__tally--complete': allVoted }" role="status">
        {{ allVoted ? 'the votes are in…' : `${votedCount} of ${totalVoters} voted` }}
      </span>
      <!-- Only present in the final stretch, so it reads as a warning rather than a clock.
           The visible number stays silent; the hidden live region reads it aloud instead. -->
      <span v-if="secondsLeft !== null" class="voting__clock">
        {{ secondsLeft }}s to vote
      </span>
      <span class="sr-only" role="status">{{ countdownAnnounce }}</span>
      <button
        v-if="isGm && gallery"
        class="btn btn--primary voting__stop"
        type="button"
        @click="stopVoting(allVoted)"
      >
        End voting
      </button>
      <button
        v-if="isGm"
        class="btn btn--ghost btn--icon-mobile voting__cancel"
        type="button"
        title="Abandon this round and return everyone to the lobby"
        aria-label="Cancel round"
        @click="cancelRound"
      >
        <CircleSlash class="btn__icon" :size="16" aria-hidden="true" />
        <span class="btn__label">Cancel round</span>
      </button>
    </template>

    <div class="voting" :style="{ '--art-ratio': artRatio }">
      <header class="voting__head">
        <p class="voting__eyebrow">
          {{ spectating ? "you joined mid-round, watch this one" : "vote for the funniest and the best" }}
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
            ><img :src="asset(c.icon)" :alt="c.label" class="voting__hint-icon"></span>
          </template>
        </p>
        <!-- Only when somebody wiped. Keeps the count voted on equal to the count on the
             reveal. Anonymous by design — naming the worst performer would be a partial leak. -->
        <p v-if="wipedCount" class="voting__wiped">
          {{ ordered.length }} to judge. {{ wipedCount === 1 ? 'one player wiped theirs' : `${wipedCount} players wiped theirs` }}
        </p>
      </header>

      <!-- `ordered.length`, not just `gallery`: a truthy gallery with zero submissions
           rendered a 0-height void. Unreachable now, kept guarded so the hole can't return. -->
      <div v-if="gallery && ordered.length" class="voting__grid">
        <div
          v-for="sub in ordered"
          :key="sub.submissionId"
          class="voting__card"
          :class="{ 'voting__card--mine': sub.submissionId === clientId }"
        >
          <div class="voting__art art-frame">
            <div :ref="el => setSlot('gallery', sub.submissionId, el)" class="art-surface" />
            <!-- Your votes' stickers, top-anchored, side by side. -->
            <div v-if="votedCategoriesFor(sub.submissionId).length" class="voting__stickers">
              <span
                v-for="c in votedCategoriesFor(sub.submissionId)"
                :key="c.id"
                class="voting__sticker"
              ><img :src="asset(c.icon)" :alt="c.label" class="voting__sticker-icon"></span>
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
              <img :src="asset(c.icon)" alt="" class="voting__cat-icon">
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
