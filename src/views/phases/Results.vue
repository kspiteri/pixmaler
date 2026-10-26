<script setup lang="ts">
// RESULTS phase — the reveal. The overall winner(s) take the hero; Best and Funniest are awarded
// beneath it. A category the overall winner also took is named there, never redrawn; a distinct
// champion shows their drawing in the award and is not repeated below. Everyone else falls into a
// ranked gallery, each drawing once. The awards fade in just after the gallery so the reveal
// travels bottom→top. The GM gets "Play again" in the status bar and, full size, under the reveal.

import type { ExportGrid, Player, RankedResult, ServerMsg, VoteCategory } from '@/lib'
import { Power, RotateCcw } from '@lucide/vue'
import { computed, inject, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import Button from '@/components/elements/Button.vue'
import PlayerTag from '@/components/elements/PlayerTag.vue'
import Tagline from '@/components/elements/Tagline.vue'
import { SaveDrawingButton } from '@/components/game'
import GameIcon from '@/components/game/shared/GameIcon.vue'
import PhaseLayout from '@/components/layout/PhaseLayout.vue'
import { artRatio as artRatioFor, clientIdKey, drawingFilename, prefersReducedMotion, seatFor, socketKey, useGmActions, useReadonlyCanvases, VOTE_CATEGORIES } from '@/lib'

const props = defineProps<{
  results: Results | null
  gmClientId: string
  // Needed only to resolve seat colours: `RankedResult` carries a clientId but no seat,
  // and a seat is the player's index in this array (see `lib/seats.ts`).
  players: Player[]
  // The round's target grid, rendered as the winner when nobody voted (see `noWinner`).
  targetGrid: number[] | null
}>()

type Results = Extract<ServerMsg, { type: 'results' }>
type Entry = Results['ranked'][number]
type Seat = ReturnType<typeof seatFor>

const socket = inject(socketKey)!.value!
const clientId = inject(clientIdKey)!
const { playAgain, endSession } = useGmActions(socket)

const isGm = computed(() => props.gmClientId === clientId)

// clientId → { seat, player }, built once per state push. The `Player` comes along because
// the chip's shape lives there; a player missing from the roster yields no chip.
const seats = computed(() =>
  new Map(props.players.map((p, i) => [p.clientId, { seat: i, player: p }])),
)

// All drawings share the GM's image dimensions — one ratio drives every art slot via
// `--art-ratio`, so non-square images keep shape.
const artRatio = computed(() =>
  props.results ? artRatioFor(props.results.gridW, props.results.gridH) : '1 / 1',
)

// `ranked` arrives pre-sorted descending by overall points (funniest + best).
const ranked = computed<Entry[]>(() => props.results?.ranked ?? [])

function withSeat(e: Entry): { entry: Entry, seat: Seat | null } {
  const found = seats.value.get(e.clientId)
  return { entry: e, seat: found ? seatFor(found.seat, found.player) : null }
}

// Nobody drew at all. The server skips VOTING in this case (see endDrawing), so this arrives
// straight from DRAWING with an empty ranked field.
const nobodyDrew = computed(() => ranked.value.length === 0)
// No human winner — either nobody drew, or people drew and nobody voted. `ranked` is sorted
// descending, so a zero at the top means a zero everywhere. Either way the target takes the hero.
const noWinner = computed(() => nobodyDrew.value || ranked.value[0].votes === 0)

// Top scorers (joint on a tie) become the hero.
const winners = computed(() => {
  const all = ranked.value
  if (all.length === 0 || noWinner.value)
    return []
  const top = all[0].votes
  return all.filter(e => e.votes === top).map(withSeat)
})
const overallIds = computed(() => new Set(winners.value.map(w => w.entry.submissionId)))

// The entries tied for the most votes in one category, or none when that category drew no votes.
function championsOf(cat: VoteCategory): { max: number, entries: Entry[] } {
  const all = ranked.value
  let max = 0
  for (const e of all)
    max = Math.max(max, e.breakdown?.[cat] ?? 0)
  if (max === 0)
    return { max: 0, entries: [] }
  return { max, entries: all.filter(e => (e.breakdown?.[cat] ?? 0) === max) }
}

interface AwardItem { entry: Entry, seat: Seat | null, asArt: boolean, mention: 'overall' | 'best' | null, count: number }
interface Award { cat: VoteCategory, label: string, max: number, items: AwardItem[], shared: boolean }

// Best, then Funniest. A champion who also won overall is named, never redrawn. A drawing that
// takes both categories (but not overall) shows its art under Best and is named under Funniest —
// the processing order below decides that. `shownArt` collects every drawing shown in an award
// so the gallery can exclude it (a distinct champion lives in its award only).
const awards = computed(() => {
  const shownArt = new Set<string>()
  const oIds = overallIds.value
  const list = (['best', 'funniest'] as const).map<Award>((cat) => {
    const { max, entries } = championsOf(cat)
    const label = VOTE_CATEGORIES.find(c => c.id === cat)?.label ?? cat
    const built = entries.map<AwardItem>((e) => {
      const isOverall = oIds.has(e.submissionId)
      const asArt = !isOverall && !shownArt.has(e.submissionId)
      if (asArt)
        shownArt.add(e.submissionId)
      return { ...withSeat(e), asArt, mention: asArt ? null : (isOverall ? 'overall' : 'best'), count: e.breakdown?.[cat] ?? 0 }
    })
    // Drawings of the winners first, then the "won by the overall winner" note underneath.
    const items = [...built.filter(i => i.asArt), ...built.filter(i => !i.asArt)]
    // `shared` when a listed co-winner's drawing is shown alongside an overall-winner mention.
    return { cat, label, max, items, shared: built.some(i => i.asArt) && built.some(i => !i.asArt) }
  })
  return { list, shownArt }
})

// Standard competition ranking over the full field (ties share a rank, the next rank skips).
const rankMap = computed(() => {
  const m = new Map<string, { rank: number, shared: boolean }>()
  const all = ranked.value
  let i = 0
  while (i < all.length) {
    let j = i
    while (j < all.length && all[j].votes === all[i].votes)
      j++
    for (let k = i; k < j; k++)
      m.set(all[k].submissionId, { rank: i + 1, shared: j - i > 1 })
    i = j
  }
  return m
})

// A player who drew and then cleared back to an empty canvas.
function isWiped(entry: RankedResult): boolean {
  return entry.grid.every(cell => cell === -1)
}

// Everyone who finished a drawing, minus the overall winner and anyone shown with their drawing in
// an award. Wiped canvases are not here — they join the "didn't finish" group below.
const gallery = computed(() => {
  const shown = awards.value.shownArt
  const oIds = overallIds.value
  return ranked.value
    .filter(e => !oIds.has(e.submissionId) && !shown.has(e.submissionId) && !isWiped(e))
    .map(e => ({ ...withSeat(e), rank: rankMap.value.get(e.submissionId) ?? { rank: 0, shared: false } }))
})

// "Didn't finish" — wiped canvases and players who never put a mark down, as one group below the
// ranked gallery so a 0-vote non-finisher never reads as having come last. Never-drew is derived by
// subtracting `ranked` from the roster, NOT from `drewThisRound` (set silently server-side, never
// sent). Spectators are excluded; disconnected players are not — they were here and did not finish.
const didNotFinish = computed(() => {
  const shown = awards.value.shownArt
  const oIds = overallIds.value
  const wiped = ranked.value
    .filter(e => !oIds.has(e.submissionId) && !shown.has(e.submissionId) && isWiped(e))
    .map((e) => {
      const found = seats.value.get(e.clientId)
      return { key: e.submissionId, name: e.name, seat: found ? seatFor(found.seat, found.player) : null, line: 'wiped their canvas' }
    })
  const never = props.players
    .filter(p => !p.spectating && !ranked.value.some(e => e.clientId === p.clientId))
    .map((p) => {
      const found = seats.value.get(p.clientId)
      return { key: p.clientId, name: p.name, seat: found ? seatFor(found.seat, found.player) : null, line: 'seems to have lost their paint brush' }
    })
  return [...wiped, ...never]
})

function ordinal(n: number): string {
  const suffix = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]}`
}
function rankLabel(r: { rank: number, shared: boolean }): string {
  return (r.shared ? '=' : '') + ordinal(r.rank)
}

const roomCode = new URLSearchParams(location.search).get('room') ?? ''

function exportOf(e: Entry): ExportGrid {
  const r = props.results!
  return { grid: e.grid, palette: r.palette, gridW: r.gridW, gridH: r.gridH }
}

// Slot key for the target image's hero canvas; never collides with a submissionId.
const TARGET_SLOT = '__target__'

// The reveal travels bottom→top: the gallery is on screen at mount, the awards block fades in just
// after. The art canvases stay mounted throughout (the block only animates opacity and translate),
// so a faded-in award already has its drawing. Reduced motion shows the block at once and skips the
// burst. The confetti wrapper is dynamic-imported on this route only (#43), so emoji-blast stays off
// other routes; it's torn down on unmount so Play again mid-burst leaves nothing behind.
const heroRef = useTemplateRef<HTMLElement>('hero')
const revealed = ref(false)
let stopConfetti: (() => void) | null = null
let revealCancelled = false

function fireReveal(): void {
  revealed.value = true
  if (noWinner.value || !props.results || !heroRef.value)
    return
  const hero = heroRef.value
  void import('@/lib/confetti')
    .then(({ fireConfetti }) => {
      if (!revealCancelled)
        stopConfetti = fireConfetti({ origin: hero })
    })
    .catch(() => {}) // a failed chunk load just means no confetti; never surface it
}

onMounted(() => {
  // TODO: when a `cheer` clip exists, play it here (above the reduced-motion gate, guarded by
  // `!noWinner.value` + `props.results`) so it sounds even for reduced-motion users — sound isn't
  // motion. Add the key + sprite in audio, play via `playSfx`, and update the audio docs then.
  if (prefersReducedMotion()) {
    revealed.value = true
    return
  }
  requestAnimationFrame(() => requestAnimationFrame(fireReveal))
})

onBeforeUnmount(() => {
  revealCancelled = true
  stopConfetti?.()
})

// Mount each shown drawing into its one slot: overall winner(s) → hero, a distinct category
// champion → that award, everyone else → gallery, plus the target in the hero when nobody won.
const { setSlot } = useReadonlyCanvases(
  () => [props.results, props.targetGrid],
  () => {
    const r = props.results
    if (!r)
      return []
    const dims = { gridW: r.gridW, gridH: r.gridH, palette: r.palette }
    const thumbs = [
      ...winners.value.map(w => ({ groups: ['hero'], key: w.entry.submissionId, ...dims, grid: w.entry.grid })),
      ...awards.value.list.flatMap(a => a.items.filter(it => it.asArt).map(it => ({ groups: [a.cat], key: it.entry.submissionId, ...dims, grid: it.entry.grid }))),
      ...gallery.value.map(g => ({ groups: ['gallery'], key: g.entry.submissionId, ...dims, grid: g.entry.grid })),
    ]
    if (noWinner.value && props.targetGrid)
      thumbs.push({ groups: ['hero'], key: TARGET_SLOT, ...dims, grid: props.targetGrid })
    return thumbs
  },
)
</script>

<template>
  <PhaseLayout heading="Results">
    <template #status>
      <!-- Never gate the GM's only control on the payload arriving: if the `results`
           replay ever fails the GM must still be able to restart the room. Non-GMs get
           the hint unconditionally so a rejoining player never sees a blank status bar. -->
      <Button
        v-if="isGm"
        variant="primary"
        size="small"
        collapse
        @click="playAgain"
      >
        <template #icon>
          <RotateCcw :size="18" aria-hidden="true" />
        </template>
        Play again
      </Button>
      <Button
        v-if="isGm"
        variant="secondary"
        size="small"
        collapse
        title="Close the room for everyone and release this code"
        aria-label="End session"
        @click="endSession"
      >
        <template #icon>
          <Power :size="16" aria-hidden="true" />
        </template>
        End session
      </Button>
      <span v-if="!isGm" class="results__hint">waiting for the GM…</span>
    </template>

    <div class="results" :style="{ '--art-ratio': artRatio }">
      <p v-if="!results" class="results__waiting">
        counting the damage…
      </p>

      <template v-else>
        <!-- Awards block — on screen but faded until just after mount, so the reveal lands
             bottom→top (the gallery first, these after). -->
        <div class="results__podium" :class="{ 'results__podium--in': revealed }">
          <!-- Hero: overall winner(s), or the target image when nobody voted. -->
          <div ref="hero" class="results__hero">
            <p class="results__crown">
              <GameIcon name="crown" class="results__crown-icon" />
              {{ noWinner ? (nobodyDrew ? "nobody drew, so the original wins" : "nobody voted, so the original wins") : winners.length > 1 ? "joint winners" : "overall winner" }}
            </p>
            <div class="results__winners">
              <!-- Nobody voted, so the target takes the hero. Same frame as a real winner. -->
              <div v-if="noWinner" class="results__winner">
                <div class="results__winner-art art-frame art-frame--winner">
                  <div :ref="el => setSlot('hero', TARGET_SLOT, el)" class="art-surface" />
                </div>
                <div class="results__winner-meta">
                  <p class="results__winner-name">
                    the original
                  </p>
                  <p class="results__winner-votes">
                    {{ nobodyDrew ? "unchallenged" : "undefeated" }}
                  </p>
                </div>
              </div>
              <div
                v-for="{ entry: w, seat } in winners"
                :key="w.submissionId"
                class="results__winner"
                :class="{ 'results__winner--mine': w.clientId === clientId }"
              >
                <div class="results__winner-art art-frame art-frame--winner">
                  <div :ref="el => setSlot('hero', w.submissionId, el)" class="art-surface" />
                </div>
                <div class="results__winner-meta">
                  <p class="results__winner-name">
                    <PlayerTag v-if="seat" :seat="seat" :name="w.name" />
                    <span v-if="w.clientId === clientId" class="results__you">you</span>
                  </p>
                  <p class="results__winner-votes">
                    {{ w.votes }} point{{ w.votes === 1 ? "" : "s" }}
                  </p>
                  <SaveDrawingButton
                    class="results__save"
                    icon
                    size="x-small"
                    variant="subtle"
                    :drawing="exportOf(w)"
                    :filename="drawingFilename(roomCode, w.name)"
                    :label="`Save ${w.name}'s drawing`"
                    :announcement="`Saved ${w.name}'s drawing`"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- Best + Funniest. Hidden when nobody won: there are no votes to award. -->
          <div v-if="!noWinner" class="results__awards">
            <div v-for="a in awards.list" :key="a.cat" class="results__award">
              <p class="results__award-label">
                <GameIcon :name="a.cat" class="results__award-icon" />
                {{ a.label }}
              </p>
              <p v-if="a.max === 0" class="results__award-empty">
                no {{ a.cat === "funniest" ? "funny" : "best" }} votes this round
              </p>
              <template v-else>
                <div
                  v-for="it in a.items"
                  :key="it.entry.submissionId"
                  class="results__award-item"
                  :class="{ 'results__award-item--mine': it.asArt && it.entry.clientId === clientId }"
                >
                  <template v-if="it.asArt">
                    <div class="results__award-art art-frame">
                      <div :ref="el => setSlot(a.cat, it.entry.submissionId, el)" class="art-surface" />
                    </div>
                    <div class="results__award-meta">
                      <p class="results__award-name">
                        <PlayerTag v-if="it.seat" :seat="it.seat" :name="it.entry.name" truncate />
                        <span v-if="it.entry.clientId === clientId" class="results__you">you</span>
                      </p>
                      <p class="results__award-votes">
                        {{ it.count }} {{ a.cat === "funniest" ? "funny" : "best" }} vote{{ it.count === 1 ? "" : "s" }}
                      </p>
                      <SaveDrawingButton
                        class="results__save"
                        icon
                        size="x-small"
                        variant="subtle"
                        :drawing="exportOf(it.entry)"
                        :filename="drawingFilename(roomCode, it.entry.name)"
                        :label="`Save ${it.entry.name}'s drawing`"
                        :announcement="`Saved ${it.entry.name}'s drawing`"
                      />
                    </div>
                  </template>
                  <p v-else class="results__award-mention">
                    <!-- The winner is named large in the hero, so a single overall winner needs no
                         repeat. Joint winners keep the name — it says which of them took this category. -->
                    <template v-if="it.mention === 'overall' && winners.length > 1">
                      <PlayerTag v-if="it.seat" :seat="it.seat" :name="it.entry.name" truncate />
                      <span class="results__award-mention-note">· a joint winner</span>
                    </template>
                    <span v-else class="results__award-mention-note">
                      {{ it.mention === "overall" ? (a.shared ? "shared with the overall winner" : "won by the overall winner") : "also won best" }}
                    </span>
                  </p>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- Everyone else — ranked by overall points, on screen from load. -->
        <div v-if="gallery.length" class="results__gallery">
          <div
            v-for="{ entry, seat, rank } in gallery"
            :key="entry.submissionId"
            class="results__item"
            :class="{ 'results__item--mine': entry.clientId === clientId }"
          >
            <span class="results__rank">{{ rankLabel(rank) }}</span>
            <span v-if="entry.clientId === clientId" class="results__you results__you--tile">you</span>
            <div class="results__item-art art-frame">
              <div :ref="el => setSlot('gallery', entry.submissionId, el)" class="art-surface" />
            </div>
            <p class="results__item-name">
              <PlayerTag
                v-if="seat"
                :seat="seat"
                :name="entry.name"
                truncate
              />
            </p>
            <p class="results__item-votes">
              {{ entry.votes }} pt{{ entry.votes === 1 ? "" : "s" }}
            </p>
            <SaveDrawingButton
              class="results__save"
              icon
              size="x-small"
              variant="subtle"
              :drawing="exportOf(entry)"
              :filename="drawingFilename(roomCode, entry.name)"
              :label="`Save ${entry.name}'s drawing`"
              :announcement="`Saved ${entry.name}'s drawing`"
            />
          </div>
        </div>

        <!-- Didn't finish: wiped canvases and players who never drew, as one group. -->
        <ul v-if="didNotFinish.length" class="results__nodraw">
          <li
            v-for="p in didNotFinish"
            :key="p.key"
            class="results__nodraw-item"
          >
            <PlayerTag v-if="p.seat" :seat="p.seat" :name="p.name" />
            {{ p.line }}
          </li>
        </ul>

        <div v-if="isGm" class="results__actions">
          <Button variant="primary" size="large" @click="playAgain">
            <template #icon>
              <RotateCcw :size="20" aria-hidden="true" />
            </template>
            Play again
          </Button>
        </div>
      </template>
    </div>

    <Tagline class="results__tagline" />
  </PhaseLayout>
</template>
