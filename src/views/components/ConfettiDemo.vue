<script setup lang="ts">
// Gallery section: fire the winner confetti (#43) with live controls for intensity, fade length,
// colour source and launch position, so the burst can be tuned by eye. Layout classes (demo__*) are
// styled by the parent gallery via :deep(). The dynamic import matches the RESULTS wrapper, so
// emoji-blast is never statically pulled into the gallery chunk; `maxParticles` is read once on
// mount to show the machine's intensity ceiling.

import { computed, onMounted, ref, useTemplateRef } from 'vue'
import Button from '@/components/elements/Button.vue'
import Slider from '@/components/elements/Slider.vue'
import { SEAT_COUNT } from '@/lib'

type Source = 'ramp' | 'winner' | 'palette'
type Spot = 'card' | 'top' | 'middle' | 'bottom'

// A representative artwork palette (muted, like a real quantise) to show the 'palette' tradeoff.
const SAMPLE_PALETTE = ['#27150e', '#552a13', '#985016', '#de9328', '#f4bd3f', '#7e6e2b', '#a38935', '#463f1e']

// Fade length ≈ opacityDecay × 60 ms; floor at 20 (~1.2 s) so it can never flash past in a frame.
const decayStops = [
  { value: 20, label: '~1.2s' },
  { value: 30, label: '~1.8s' },
  { value: 40, label: '~2.4s' },
  { value: 50, label: '~3.0s' },
  { value: 60, label: '~3.6s' },
  { value: 72, label: '~4.3s' },
  { value: 83, label: '~5.0s' },
]

const count = ref(48)
const decay = ref(60)
const source = ref<Source>('ramp')
const spot = ref<Spot>('card')
const cap = ref<number | null>(null)

onMounted(async () => {
  cap.value = (await import('@/lib/confetti')).maxParticles()
})

const decayLabel = computed(() => decayStops.find(s => s.value === decay.value)?.label ?? '')
const effective = computed(() => (cap.value !== null ? Math.min(count.value, cap.value) : count.value))
const intensityLabel = computed(() =>
  cap.value !== null && count.value > cap.value
    ? `${count.value} (capped to ${cap.value} on this machine)`
    : `${count.value}`,
)

function coloursFor(s: Source): string[] | undefined {
  if (s === 'ramp')
    return undefined // wrapper default: the full seat ramp
  if (s === 'palette')
    return SAMPLE_PALETTE
  // 'winner': weight one seat colour, flecked with the rest of the ramp.
  const ramp = Array.from({ length: SEAT_COUNT }, (_, i) => `var(--player-colour-${i})`)
  return [...Array.from<string>({ length: 6 }).fill('var(--player-colour-1)'), ...ramp]
}

function originFor(s: Exclude<Spot, 'card'>): { x: number, y: number } {
  const fraction = { top: 0.16, middle: 0.5, bottom: 0.82 }[s]
  return { x: window.innerWidth / 2, y: window.innerHeight * fraction }
}

const stage = useTemplateRef<HTMLElement>('stage')

// The exact call RESULTS makes: an element origin (two fountains from its sides) and every other
// knob left at the wrapper default. No demo controls apply \u2014 this is the reveal, verbatim.
async function fireLikeResults(): Promise<void> {
  const { fireConfetti } = await import('@/lib/confetti')
  if (stage.value)
    fireConfetti({ origin: stage.value })
}

async function fire(): Promise<void> {
  const { fireConfetti } = await import('@/lib/confetti')
  // 'card' is the RESULTS path: launch from the stage element's two sides. The rest are page points.
  const s = spot.value
  const origin = s === 'card' ? stage.value : originFor(s)
  if (!origin)
    return
  fireConfetti({
    count: count.value,
    opacityDecay: decay.value,
    colours: coloursFor(source.value),
    origin,
  })
}
</script>

<template>
  <div>
    <section class="demo__section">
      <h3 class="demo__heading">
        as RESULTS fires it
      </h3>
      <div>
        <div
          ref="stage"
          style="width: 150px; aspect-ratio: 2 / 3; background: var(--surface); border: 2px dashed var(--border); border-radius: 4px; display: grid; place-items: center; text-align: center; color: var(--fg-60); font-size: 0.75rem"
        >
          winner card
        </div>
        <div class="demo__row">
          <Button variant="secondary" @click="fireLikeResults">
            Fire
          </Button>
          <p class="demo__note">
            The reveal's exact call — <code>fireConfetti({ origin })</code> on the card, every other knob at its default. The controls below don't apply.
          </p>
        </div>
      </div>
    </section>
    <section class="demo__section">
      <div class="demo__stack">
        <div class="demo__item">
          <span class="demo__heading">intensity — {{ intensityLabel }}</span>
          <Slider v-model="count" :min="12" :max="120" label="Confetti count" />
        </div>
        <div class="demo__item">
          <span class="demo__heading">fade — {{ decayLabel }}</span>
          <Slider v-model="decay" :stops="decayStops" label="Fade length" />
        </div>
        <div class="demo__item">
          <span class="demo__heading">colours</span>
          <div class="segmented" role="group" aria-label="Confetti colours">
            <button
              v-for="s in (['ramp', 'winner', 'palette'] as const)"
              :key="s"
              class="segmented__item"
              :class="{ 'segmented__item--active': source === s }"
              type="button"
              :aria-pressed="source === s"
              @click="source = s"
            >
              {{ s }}
            </button>
          </div>
        </div>
        <div class="demo__item">
          <span class="demo__heading">launch from</span>
          <div class="segmented" role="group" aria-label="Launch from">
            <button
              v-for="p in (['card', 'top', 'middle', 'bottom'] as const)"
              :key="p"
              class="segmented__item"
              :class="{ 'segmented__item--active': spot === p }"
              type="button"
              :aria-pressed="spot === p"
              @click="spot = p"
            >
              {{ p }}
            </button>
          </div>
        </div>
      </div>
      <div class="demo__row">
        <Button variant="secondary" @click="fire">
          Fire confetti ({{ effective }})
        </Button>
        <span class="demo__note">no burst under reduced motion</span>
      </div>
    </section>
  </div>
</template>
