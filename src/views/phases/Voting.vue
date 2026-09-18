<script setup lang="ts">
// VOTING phase — orchestrates the salon gallery wall (SalonWall) and the close-up modal
// (VotingCloseup). Owns the ballot (optimistic per-category picks), the per-client shuffle, the
// backstop countdown, and the modal open index; the wall and modal are presentational. Awards
// are cast only from the close-up, so the wall stays a comparison surface. Anonymous: no
// names/avatars; tallies hidden until RESULTS.

import type { ClientMsg, ServerMsg, Submission, VoteCategory } from '@/lib'
import { Check, CircleSlash } from '@lucide/vue'
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import Button from '@/components/elements/Button.vue'
import { SalonWall, VotingCloseup } from '@/components/game'
import PhaseLayout from '@/components/layout/PhaseLayout.vue'
import { clientIdKey, socketKey, useCountdownAnnounce, useGmActions, useSalonWall, VOTE_CATEGORIES } from '@/lib'

const props = defineProps<{
  gallery: Gallery | null
  gmClientId: string
  votedCount: number
  totalVoters: number
  // Echoed by the server on (re)join during VOTING — this voter's own picks restored.
  voteState: VoteState | null
  // The VOTING backstop's expiry (party/server.ts) — surfaced only in the final stretch.
  deadline: number | null
  // Joined mid-round: sees the gallery but doesn't judge it. The server refuses their vote.
  spectating: boolean
  // The GM's target, hung as the non-votable "original". Null until it lands.
  targetGrid: number[] | null
}>()

type Gallery = Extract<ServerMsg, { type: 'gallery' }>
type VoteState = Extract<ServerMsg, { type: 'vote-state' }>

const socket = inject(socketKey)!.value!
const clientId = inject(clientIdKey)!
const { stopVoting, cancelRound } = useGmActions(socket)

const isGm = computed(() => props.gmClientId === clientId)

// This client's own opaque submission id (#73): the one drawing it can identify as its own — to
// flag it "yours" and stop it being voted for. Null for a spectator or a wiped-only round.
const mySubmissionId = computed(() => props.voteState?.mySubmissionId ?? null)

// The image aspect ratio — every drawing shares it. Falls back to square until the gallery lands.
const ar = computed(() => (props.gallery ? props.gallery.gridW / props.gallery.gridH : 1))

// ── Countdown for the backstop (a warning, not a frame-accurate clock) ─────────────
const WARN_AT_SECONDS = 30
const secondsLeft = ref<number | null>(null)
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

// ── Per-client gallery order (cosmetic — votes carry the submissionId) ──────────────
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

// Everyone present has finished voting. Can un-fire when a straggler reconnects — a status line.
const allVoted = computed(() => props.totalVoters > 0 && props.votedCount >= props.totalVoters)

// ── Ballot: local-only optimistic picks (one submissionId per category, null until cast) ────
const myVotes = ref<Record<VoteCategory, string | null>>({ funniest: null, best: null })

function emptyVotes(): Record<VoteCategory, string | null> {
  return { funniest: null, best: null }
}
function applyVoteEcho(vs: VoteState | null) {
  if (!vs)
    return
  for (const c of VOTE_CATEGORIES) {
    const picked = vs.votes[c.id]
    if (picked)
      myVotes.value[c.id] = picked
  }
}
watch(() => props.voteState, vs => applyVoteEcho(vs), { immediate: true })

// Which of my category votes landed on a given submission — drives its pinned badges.
function awardsOn(submissionId: string) {
  return VOTE_CATEGORIES.filter(c => myVotes.value[c.id] === submissionId)
}

// A wiped canvas rides along so the reveal can acknowledge its author, but it's not a candidate.
function isBlank(sub: Submission): boolean {
  return sub.grid.every(cell => cell === -1)
}
const wipedCount = computed(() => (props.gallery?.submissions ?? []).filter(isBlank).length)

watch(() => props.gallery, () => {
  const subs = (props.gallery?.submissions ?? []).filter(s => !isBlank(s))
  if (!sameSet(ordered.value, subs)) {
    ordered.value = shuffle(subs)
    myVotes.value = emptyVotes()
    applyVoteEcho(props.voteState)
  }
}, { immediate: true })

function castVote(category: VoteCategory, submissionId: string) {
  if (props.spectating || submissionId === mySubmissionId.value)
    return // spectators can't vote; a drawing can't award itself (mirrors the server)
  if (myVotes.value[category] === submissionId)
    return // movable but not withdrawable: re-click is a no-op
  myVotes.value = { ...myVotes.value, [category]: submissionId }
  const msg: ClientMsg = { type: 'vote:cast', category, submissionId }
  socket.send(JSON.stringify(msg))
}

// ── The hung wall (deterministic; a server push never re-rolls it) ──────────────────
const { wallItems } = useSalonWall(() => props.gallery, ordered, () => props.targetGrid)

// ── Modal: judge one drawing at a time; the wall behind never moves ─────────────────
const wall = useTemplateRef<{ focusPiece: (i: number) => void }>('wall')
const openIndex = ref<number | null>(null)
const openSub = computed(() => (openIndex.value === null ? null : ordered.value[openIndex.value] ?? null))

function openModal(i: number) {
  openIndex.value = i
}
function closeModal() {
  const i = openIndex.value
  openIndex.value = null
  if (i !== null)
    nextTick(() => wall.value?.focusPiece(i))
}
function stepModal(dir: -1 | 1) {
  if (openIndex.value === null)
    return
  openIndex.value = Math.max(0, Math.min(ordered.value.length - 1, openIndex.value + dir))
}

const promptText = computed(() => {
  if (props.spectating)
    return 'you joined mid-round, watch this one'
  if (VOTE_CATEGORIES.every(c => myVotes.value[c.id] !== null))
    return 'both awards placed. click a drawing to move them, or take another look'
  return 'vote for the funniest and the best. click a drawing to look closely and award it'
})

onMounted(() => {
  readClock()
  tick = setInterval(readClock, 1000)
})
onBeforeUnmount(() => clearInterval(tick))
watch(() => props.deadline, readClock)
</script>

<template>
  <PhaseLayout heading="Voting" class="phase--fixed">
    <template #status>
      <span class="voting__tally" :class="{ 'voting__tally--complete': allVoted }" role="status">
        {{ allVoted ? 'the votes are in…' : `${votedCount} of ${totalVoters} voted` }}
      </span>
      <span v-if="secondsLeft !== null" class="voting__clock">
        {{ secondsLeft }}s to vote
      </span>
      <span class="sr-only" role="status">{{ countdownAnnounce }}</span>
      <Button
        v-if="isGm && gallery"
        variant="primary"
        size="small"
        @click="stopVoting(allVoted)"
      >
        <template #icon>
          <Check :size="18" aria-hidden="true" />
        </template>
        End voting
      </Button>
      <Button
        v-if="isGm"
        variant="secondary"
        collapse
        size="small"
        title="Abandon this round and return everyone to the lobby"
        aria-label="Cancel round"
        @click="cancelRound"
      >
        <template #icon>
          <CircleSlash :size="16" aria-hidden="true" />
        </template>
        Cancel round
      </Button>
    </template>

    <div class="voting">
      <p class="voting__prompt">
        {{ promptText }}
      </p>
      <p v-if="gallery && ordered.length && wipedCount" class="voting__wiped">
        {{ ordered.length }} to judge. {{ wipedCount === 1 ? 'one player wiped theirs' : `${wipedCount} players wiped theirs` }}
      </p>

      <SalonWall
        v-if="gallery && ordered.length"
        ref="wall"
        :items="wallItems"
        :palette="gallery.palette"
        :count="ordered.length"
        :my-submission-id="mySubmissionId"
        :awards-on="awardsOn"
        @open="openModal"
      />

      <p v-else-if="gallery" class="voting__waiting">
        nobody drew anything…
      </p>
      <p v-else class="voting__waiting">
        hanging the exhibition…
      </p>
    </div>

    <VotingCloseup
      v-if="openSub && gallery"
      :sub="openSub"
      :grid-w="gallery.gridW"
      :grid-h="gallery.gridH"
      :palette="gallery.palette"
      :ar="ar"
      :my-submission-id="mySubmissionId"
      :spectating="spectating"
      :awards-on="awardsOn"
      :my-votes="myVotes"
      @close="closeModal"
      @step="stepModal"
      @vote="castVote"
    />
  </PhaseLayout>
</template>
