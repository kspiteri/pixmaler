<script setup lang="ts">
// RESULTS phase — chaotic overall reveal. The winner(s) (most total votes,
// joint on a tie) take the hero card; everyone else falls into a gallery
// ordered by overall points. Each drawing appears exactly once. The GM gets a
// "Play again" button that returns the room to LOBBY.

import type { ClientMsg, Player, ServerMsg } from '../../lib/types'
import { computed, inject, nextTick, onBeforeUnmount, watch } from 'vue'
import PhaseLayout from '../../components/PhaseLayout.vue'
import PlayerTag from '../../components/PlayerTag.vue'
import Tagline from '../../components/Tagline.vue'
import { artRatio as artRatioFor } from '../../lib/aspect'
import { PixelCanvas } from '../../lib/canvas'
import { clientIdKey, socketKey } from '../../lib/keys'
import { seatFor } from '../../lib/seats'
import { VOTE_CATEGORIES } from '../../lib/types'

const props = defineProps<{
  results: Results | null
  gmClientId: string
  // Needed only to resolve seat colours: `RankedResult` carries a clientId but
  // no seat, and a seat is the player's index in this array (see `lib/seats.ts`).
  players: Player[]
}>()

// Resolve a `public/`-hosted asset path against Vite's `base` (e.g.
// `/pixmaler/`) so absolute URLs don't skip the base and 404.
function iconUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`
}

type Results = Extract<ServerMsg, { type: 'results' }>
type Entry = Results['ranked'][number]

const socket = inject(socketKey)!.value!
const clientId = inject(clientIdKey)!

const isGm = computed(() => props.gmClientId === clientId)

// clientId → { seat, player }, built once per state push rather than a findIndex
// per card: the gallery is ordered by points, not by join order, so every entry
// needs a lookup. The `Player` comes along because the chip's shape lives there —
// `RankedResult` carries a name but no shape. A player missing from the roster
// yields no chip rather than a guess.
const seats = computed(() =>
  new Map(props.players.map((p, i) => [p.clientId, { seat: i, player: p }])),
)

// All drawings share the GM's image dimensions — one ratio drives every art
// slot (hero + gallery) via `--art-ratio`, so non-square images keep shape.
const artRatio = computed(() =>
  props.results ? artRatioFor(props.results.gridW, props.results.gridH) : '1 / 1',
)

// Top scorers (joint on a tie) become the hero; the rest form the gallery,
// still in overall-points order. `ranked` arrives pre-sorted descending. Each
// entry is paired with its seat here so the template resolves the lookup once
// per card instead of once per binding.
const ranked = computed<Entry[]>(() => props.results?.ranked ?? [])
function withSeats(entries: Entry[]) {
  return entries.map((e) => {
    const found = seats.value.get(e.clientId)
    return { entry: e, seat: found ? seatFor(found.seat, found.player) : null }
  })
}

const winners = computed(() => {
  const all = ranked.value
  if (all.length === 0)
    return []
  const top = all[0].votes
  return withSeats(all.filter(e => e.votes === top))
})
const rest = computed(() => withSeats(ranked.value.slice(winners.value.length)))

// Per-category breakdown for the hero, e.g. `[{ count: 5, icon: laugh.svg, … }, …]`.
// Falls back to 0 for any missing category so a stale/old-shape results payload
// can't crash the reveal.
function breakdownItems(entry: Entry) {
  return VOTE_CATEGORIES.map(c => ({
    id: c.id,
    label: c.label,
    icon: iconUrl(c.icon),
    count: entry.breakdown?.[c.id] ?? 0,
  }))
}

// PixelCanvas instances mounted into the per-row slots. Re-built whenever
// the results object changes (Play again → new round).
let canvases: PixelCanvas[] = []

const slotMap = new Map<string, HTMLElement>()
function setSlot(submissionId: string, el: unknown) {
  if (el instanceof HTMLElement)
    slotMap.set(submissionId, el)
  else slotMap.delete(submissionId)
}

function mountCanvases() {
  canvases = []
  if (!props.results)
    return
  for (const r of props.results.ranked) {
    const slot = slotMap.get(r.submissionId)
    if (!slot)
      continue
    const pc = new PixelCanvas({
      gridW: props.results.gridW,
      gridH: props.results.gridH,
      palette: props.results.palette,
      targetGrid: r.grid,
      editable: false,
    })
    pc.canvas.classList.add('results__canvas')
    slot.replaceChildren(pc.canvas)
    canvases.push(pc)
  }
}

watch(() => props.results, async () => {
  // See Voting.vue's note: `flush: "post"` doesn't strictly guarantee that
  // function-form :ref callbacks have fired before the watcher runs.
  // nextTick() twice is the public, supported way to wait for the patch.
  await nextTick()
  await nextTick()
  mountCanvases()
}, { immediate: true })

onBeforeUnmount(() => { canvases = [] })

function playAgain() {
  const msg: ClientMsg = { type: 'gm:playAgain' }
  socket.send(JSON.stringify(msg))
}
</script>

<template>
  <PhaseLayout>
    <template #status>
      <button
        v-if="results && isGm"
        class="btn btn--primary results__again"
        type="button"
        @click="playAgain"
      >
        Play again
      </button>
      <span v-else-if="results" class="results__hint">waiting for the GM…</span>
    </template>

    <div class="results" :style="{ '--art-ratio': artRatio }">
      <p v-if="!results" class="results__waiting">
        counting the damage…
      </p>

      <template v-else>
        <!-- Hero: overall winner(s) -->
        <div class="results__hero">
          <p class="results__crown">
            <img :src="iconUrl('assets/icons/crown.svg')" alt="crown" class="results__crown-icon">
            {{ winners.length > 1 ? "joint winners" : "overall winner" }}
          </p>
          <div class="results__winners">
            <div
              v-for="{ entry: w, seat } in winners"
              :key="w.submissionId"
              class="results__winner"
              :class="{ 'results__winner--mine': w.clientId === clientId }"
            >
              <div class="results__winner-art art-frame art-frame--winner">
                <div :ref="el => setSlot(w.submissionId, el)" class="art-surface" />
              </div>
              <div class="results__winner-meta">
                <p class="results__winner-name">
                  <PlayerTag v-if="seat" :seat="seat" :name="w.name" />
                </p>
                <p class="results__winner-votes">
                  {{ w.votes }} vote{{ w.votes === 1 ? "" : "s" }}
                </p>
                <p class="results__winner-breakdown">
                  <span
                    v-for="(b, i) in breakdownItems(w)"
                    :key="b.id"
                    class="results__winner-breakdown-item"
                  >
                    <template v-if="i > 0"> · </template>
                    {{ b.count }}
                    <img :src="b.icon" :alt="b.label" class="results__breakdown-icon">
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <Tagline class="results__tagline" />

        <!-- Gallery: everyone else, ordered by overall points -->
        <div v-if="rest.length" class="results__gallery">
          <div
            v-for="{ entry, seat } in rest"
            :key="entry.submissionId"
            class="results__item"
            :class="{ 'results__item--mine': entry.clientId === clientId }"
          >
            <div class="results__item-art art-frame">
              <div :ref="el => setSlot(entry.submissionId, el)" class="art-surface" />
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
          </div>
        </div>
      </template>
    </div>
  </PhaseLayout>
</template>

<style scoped lang="scss">
// Static layout lives in styles/_results.scss. Only the :deep rule reaching the
// imperatively-mounted PixelCanvas stays here — :deep needs the scoped context.
.results :deep(.results__canvas) {
  display: block;
  width: 100%;
  height: auto;
  background: #fff;
}
</style>
