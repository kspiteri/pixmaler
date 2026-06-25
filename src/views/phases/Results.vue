<script setup lang="ts">
// RESULTS phase — chaotic overall reveal. The winner(s) (most total votes,
// joint on a tie) take the hero card; everyone else falls into a gallery
// ordered by overall points. Each drawing appears exactly once. The GM gets a
// "Play again" button that returns the room to LOBBY.

import type { ClientMsg, ServerMsg } from '../../lib/types'
import { computed, inject, nextTick, onBeforeUnmount, watch } from 'vue'
import PhaseLayout from '../../components/PhaseLayout.vue'
import { PixelCanvas } from '../../lib/canvas'
import { clientIdKey, socketKey } from '../../lib/keys'
import { VOTE_CATEGORIES } from '../../lib/types'

type Results = Extract<ServerMsg, { type: 'results' }>
type Entry = Results['ranked'][number]

const props = defineProps<{
  results: Results | null
  gmClientId: string
}>()

const socket = inject(socketKey)!
const clientId = inject(clientIdKey)!

const isGm = computed(() => props.gmClientId === clientId)

// Top scorers (joint on a tie) become the hero; the rest form the gallery,
// still in overall-points order. `ranked` arrives pre-sorted descending.
const winners = computed<Entry[]>(() => {
  const ranked = props.results?.ranked ?? []
  if (ranked.length === 0)
    return []
  const top = ranked[0].votes
  return ranked.filter(e => e.votes === top)
})
const rest = computed<Entry[]>(() => {
  const ranked = props.results?.ranked ?? []
  return ranked.slice(winners.value.length)
})

// "5 😂 · 6 ⭐" breakdown line for the hero. Falls back to 0 for any missing
// category so a stale/old-shape results payload can't crash the reveal.
function breakdownText(entry: Entry): string {
  return VOTE_CATEGORIES
    .map(c => `${entry.breakdown?.[c.id] ?? 0} ${c.emoji}`)
    .join(' · ')
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
        Play again →
      </button>
      <span v-else-if="results" class="results__hint">waiting for the GM…</span>
    </template>

    <div class="results">
      <p v-if="!results" class="results__waiting">
        Waiting for results…
      </p>

      <template v-else>
        <!-- Hero: overall winner(s) -->
        <div class="results__hero">
          <p class="results__crown">
            👑 {{ winners.length > 1 ? "joint winners" : "overall winner" }}
          </p>
          <div class="results__winners">
            <div
              v-for="w in winners"
              :key="w.submissionId"
              class="results__winner"
              :class="{ 'results__winner--mine': w.clientId === clientId }"
            >
              <div :ref="el => setSlot(w.submissionId, el)" class="results__winner-art" />
              <div class="results__winner-meta">
                <p class="results__winner-name">
                  {{ w.name }}
                </p>
                <p class="results__winner-votes">
                  {{ w.votes }} vote{{ w.votes === 1 ? "" : "s" }}
                </p>
                <p class="results__winner-breakdown">
                  {{ breakdownText(w) }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Gallery: everyone else, ordered by overall points -->
        <div v-if="rest.length" class="results__gallery">
          <div
            v-for="entry in rest"
            :key="entry.submissionId"
            class="results__item"
            :class="{ 'results__item--mine': entry.clientId === clientId }"
          >
            <div :ref="el => setSlot(entry.submissionId, el)" class="results__item-art" />
            <p class="results__item-name">
              {{ entry.name }}
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
  height: 100%;
  background: #fff;
}
</style>
