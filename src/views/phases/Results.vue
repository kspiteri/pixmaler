<script setup lang="ts">
// RESULTS phase — overall reveal. Winner(s) (most total votes, joint on a tie) take the
// hero card; everyone else falls into a gallery ordered by points, each drawing once.
// The GM gets a "Play again" button that returns the room to LOBBY.

import type { ClientMsg, Player, RankedResult, ServerMsg } from '../../lib/types'
import { Power } from '@lucide/vue'
import { computed, inject, nextTick, onBeforeUnmount, watch } from 'vue'
import PhaseLayout from '../../components/PhaseLayout.vue'
import PlayerTag from '../../components/PlayerTag.vue'
import Tagline from '../../components/Tagline.vue'
import { artRatio as artRatioFor } from '../../lib/aspect'
import { PixelCanvas } from '../../lib/canvas/pixel'
import { askConfirm } from '../../lib/dialog'
import { clientIdKey, socketKey } from '../../lib/keys'
import { seatFor } from '../../lib/seats'
import { VOTE_CATEGORIES } from '../../lib/types'

const props = defineProps<{
  results: Results | null
  gmClientId: string
  // Needed only to resolve seat colours: `RankedResult` carries a clientId but no seat,
  // and a seat is the player's index in this array (see `lib/seats.ts`).
  players: Player[]
  // The round's target grid, rendered as the winner when nobody voted (see `noWinner`).
  targetGrid: number[] | null
}>()

// Resolve a `public/`-hosted asset path against Vite's `base` so it doesn't 404.
function iconUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`
}

type Results = Extract<ServerMsg, { type: 'results' }>
type Entry = Results['ranked'][number]

const socket = inject(socketKey)!.value!
const clientId = inject(clientIdKey)!

const isGm = computed(() => props.gmClientId === clientId)

// clientId → { seat, player }, built once per state push. The `Player` comes along because
// the chip's shape lives there; a player missing from the roster yields no chip.
const seats = computed(() =>
  new Map(props.players.map((p, i) => [p.clientId, { seat: i, player: p }])),
)

// All drawings share the GM's image dimensions — one ratio drives every art slot (hero +
// gallery) via `--art-ratio`, so non-square images keep shape.
const artRatio = computed(() =>
  props.results ? artRatioFor(props.results.gridW, props.results.gridH) : '1 / 1',
)

// Top scorers (joint on a tie) become the hero; the rest form the gallery in points order.
// `ranked` arrives pre-sorted descending. Each entry is paired with its seat here so the
// template resolves the lookup once per card.
const ranked = computed<Entry[]>(() => props.results?.ranked ?? [])
function withSeats(entries: Entry[]) {
  return entries.map((e) => {
    const found = seats.value.get(e.clientId)
    return { entry: e, seat: found ? seatFor(found.seat, found.player) : null }
  })
}

// Players who were competing and never put a mark down. Derived by subtracting `ranked`
// from the roster, NOT by reading `drewThisRound`: that flag is set silently server-side
// and never reaches the client, so the roster still says `false` for everyone who drew.
// `ranked` can't go stale — it arrives in the same `results` message and is exactly the
// gallery. Deriving rather than appending matters: `nobodyDrew` infers from `ranked` being
// empty, so padding it would break the zero-submission reveal. Spectators are excluded;
// disconnected players are not — they were here and did not draw.
const drewIds = computed(() => new Set(ranked.value.map(e => e.clientId)))
const neverDrew = computed(() =>
  props.players
    .filter(p => !p.spectating && !drewIds.value.has(p.clientId))
    .map((p) => {
      const found = seats.value.get(p.clientId)
      return { player: p, seat: found ? seatFor(found.seat, found.player) : null }
    }),
)

// Nobody drew at all. The server skips VOTING in this case (see endDrawing), so this
// arrives straight from DRAWING with an empty ranked field.
const nobodyDrew = computed(() => ranked.value.length === 0)
// No human winner — either nobody drew, or people drew and nobody voted. `ranked` arrives
// sorted descending, so a zero at the top means a zero everywhere; without this guard
// `e.votes === top` matched every entry and deleted the gallery. Either way the target
// takes the hero and everyone falls into the gallery.
const noWinner = computed(() => nobodyDrew.value || ranked.value[0].votes === 0)

const winners = computed(() => {
  const all = ranked.value
  if (all.length === 0 || noWinner.value)
    return []
  const top = all[0].votes
  return withSeats(all.filter(e => e.votes === top))
})
// Empty `winners` makes this `slice(0)` — the whole ranked field — which is what the
// no-winner case wants: nobody crowned, everybody in the gallery.
const rest = computed(() => withSeats(ranked.value.slice(winners.value.length)))

// A player who drew and then cleared.
function isWiped(entry: RankedResult): boolean {
  return entry.grid.every(cell => cell === -1)
}

// Per-category breakdown for the hero. Falls back to 0 for any missing category so a
// stale results payload can't crash the reveal.
function breakdownItems(entry: Entry) {
  return VOTE_CATEGORIES.map(c => ({
    id: c.id,
    label: c.label,
    icon: iconUrl(c.icon),
    count: entry.breakdown?.[c.id] ?? 0,
  }))
}

// PixelCanvas instances mounted into the per-row slots. Re-built when the results change.
let canvases: PixelCanvas[] = []

// Slots are keyed per block, NOT in one shared map. The hero and gallery `v-for`s can hold
// the same submissionId at once (a gallery player wins the next round), Vue patches the hero
// before the gallery, and unmount fires the `:ref` with `null` — so one shared map would let
// the gallery's unmount-null delete the freshly registered hero element. Two maps keep the
// lifecycles independent.
const heroSlots = new Map<string, HTMLElement>()
const gallerySlots = new Map<string, HTMLElement>()
function setSlot(kind: 'hero' | 'gallery', submissionId: string, el: unknown) {
  const slots = kind === 'hero' ? heroSlots : gallerySlots
  if (el instanceof HTMLElement)
    slots.set(submissionId, el)
  else slots.delete(submissionId)
}

// Slot key for the target image's canvas in the no-winner hero; never collides with a submissionId.
const TARGET_SLOT = '__target__'

function mountCanvases() {
  canvases = []
  if (!props.results)
    return
  for (const r of props.results.ranked) {
    // Hero first: a submission is in `winners` or `rest`, never both at rest. During the
    // patch that lands a new winner both may briefly hold it, and the hero slot wins.
    const slot = heroSlots.get(r.submissionId) ?? gallerySlots.get(r.submissionId)
    if (!slot)
      continue
    const pc = new PixelCanvas({
      gridW: props.results.gridW,
      gridH: props.results.gridH,
      palette: props.results.palette,
      targetGrid: r.grid,
      editable: false,
    })
    slot.replaceChildren(pc.canvas)
    canvases.push(pc)
  }
  // No human winner: the target image occupies the hero instead.
  if (noWinner.value && props.targetGrid) {
    const slot = heroSlots.get(TARGET_SLOT)
    if (slot) {
      const pc = new PixelCanvas({
        gridW: props.results.gridW,
        gridH: props.results.gridH,
        palette: props.results.palette,
        targetGrid: props.targetGrid,
        editable: false,
      })
      slot.replaceChildren(pc.canvas)
      canvases.push(pc)
    }
  }
}

// `targetGrid` is watched too: in the no-winner case it renders the hero, and it arrives on
// `state`, not the `results` payload, so the two can land in either order.
watch(() => [props.results, props.targetGrid], async () => {
  // See Voting.vue's note: `flush: "post"` doesn't guarantee :ref callbacks have fired;
  // nextTick() twice is the supported way to wait for the patch.
  await nextTick()
  await nextTick()
  mountCanvases()
}, { immediate: true })

onBeforeUnmount(() => { canvases = [] })

function playAgain() {
  const msg: ClientMsg = { type: 'gm:playAgain' }
  socket.send(JSON.stringify(msg))
}

// Ends the whole session rather than starting another round. Always confirmed: it closes
// the room for everyone and releases the code.
async function endSession() {
  if (!await askConfirm('End the session for everyone? The room closes and this code is released.'))
    return
  const msg: ClientMsg = { type: 'gm:endSession' }
  socket.send(JSON.stringify(msg))
}
</script>

<template>
  <PhaseLayout heading="Results">
    <template #status>
      <!-- Never gate the GM's only control on the payload arriving: if the `results`
           replay ever fails the GM must still be able to restart the room. Non-GMs get
           the hint unconditionally so a rejoining player never sees a blank status bar. -->
      <button
        v-if="isGm"
        class="btn btn--primary results__again"
        type="button"
        @click="playAgain"
      >
        Play again
      </button>
      <button
        v-if="isGm"
        class="btn btn--ghost btn--icon-mobile"
        type="button"
        title="Close the room for everyone and release this code"
        aria-label="End session"
        @click="endSession"
      >
        <Power class="btn__icon" :size="16" aria-hidden="true" />
        <span class="btn__label">End session</span>
      </button>
      <span v-if="!isGm" class="results__hint">waiting for the GM…</span>
    </template>

    <div class="results" :style="{ '--art-ratio': artRatio }">
      <p v-if="!results" class="results__waiting">
        counting the damage…
      </p>

      <template v-else>
        <!-- Hero: overall winner(s), or the target image when nobody voted. -->
        <div class="results__hero">
          <p class="results__crown">
            <img :src="iconUrl('assets/icons/crown.svg')" alt="crown" class="results__crown-icon">
            {{ noWinner ? (nobodyDrew ? "nobody drew — the original wins" : "nobody voted — the original wins") : winners.length > 1 ? "joint winners" : "overall winner" }}
          </p>
          <div class="results__winners">
            <!-- Nobody voted, so the target takes the hero. Same frame as a real
                 winner: it did beat them. -->
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

        <!-- Gallery: everyone else, ordered by overall points. -->
        <div v-if="rest.length" class="results__gallery">
          <div
            v-for="{ entry, seat } in rest"
            :key="entry.submissionId"
            class="results__item"
            :class="{ 'results__item--mine': entry.clientId === clientId }"
          >
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
            <p v-if="isWiped(entry)" class="results__item-wiped">
              wiped their canvas
            </p>
            <p v-else class="results__item-votes">
              {{ entry.votes }} pt{{ entry.votes === 1 ? "" : "s" }}
            </p>
          </div>
        </div>

        <!-- Players who never drew. -->
        <ul v-if="neverDrew.length" class="results__nodraw">
          <li
            v-for="{ player, seat } in neverDrew"
            :key="player.clientId"
            class="results__nodraw-item"
          >
            <PlayerTag v-if="seat" :seat="seat" :name="player.name" />
            seems to have lost their paint brush
          </li>
        </ul>
      </template>
    </div>

    <Tagline class="results__tagline" />
  </PhaseLayout>
</template>
