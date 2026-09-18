<script setup lang="ts">
// Close-up modal: judge one drawing at a time; the wall behind never moves. Awards are cast
// only from here, so the wall stays a pure comparison surface. Native <dialog> + showModal(), so
// focus trapping, restore, Esc and the top layer come from the platform; arrow keys step. Focus
// lands on Close on open; returning it to the drawing is the wall's job (it owns the frames).

import type { Submission, VoteCategory, VoteCategoryMeta } from '@/lib'
import { ChevronLeft, ChevronRight, X } from '@lucide/vue'
import { onMounted, useTemplateRef } from 'vue'
import Button from '@/components/elements/Button.vue'
import { asset, VOTE_CATEGORIES } from '@/lib'
import SalonFrame from './SalonFrame.vue'

defineProps<{
  sub: Submission
  gridW: number
  gridH: number
  palette: string[]
  ar: number
  mySubmissionId: string | null
  spectating: boolean
  awardsOn: (submissionId: string) => VoteCategoryMeta[]
  myVotes: Record<VoteCategory, string | null>
}>()

const emit = defineEmits<{
  close: []
  step: [dir: -1 | 1]
  vote: [category: VoteCategory, submissionId: string]
}>()

const dialogEl = useTemplateRef<HTMLDialogElement>('dialogEl')

onMounted(() => dialogEl.value?.showModal())

// Esc closes via the native `cancel` event (default-prevented so the element never closes itself
// behind its own v-if, which would leave an invisible modal). Arrows step; focus is trapped.
function onArrow(e: KeyboardEvent) {
  if (e.key === 'ArrowRight') { e.preventDefault(); emit('step', 1) }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); emit('step', -1) }
}
</script>

<template>
  <dialog
    ref="dialogEl"
    class="voting__modal"
    :style="{ '--ar': ar }"
    aria-label="Drawing close-up"
    @cancel.prevent="emit('close')"
    @keydown="onArrow"
    @click.self="emit('close')"
  >
    <Button autofocus icon variant="tertiary" class="voting__nav voting__nav--close" aria-label="Close" @click="emit('close')">
      <template #icon>
        <X :size="20" />
      </template>
    </Button>
    <Button icon variant="tertiary" class="voting__nav voting__nav--prev" aria-label="Previous drawing" @click="emit('step', -1)">
      <template #icon>
        <ChevronLeft :size="22" />
      </template>
    </Button>
    <Button icon variant="tertiary" class="voting__nav voting__nav--next" aria-label="Next drawing" @click="emit('step', 1)">
      <template #icon>
        <ChevronRight :size="22" />
      </template>
    </Button>

    <div class="voting__modal-card">
      <SalonFrame :key="sub.submissionId" :grid-w="gridW" :grid-h="gridH" :palette="palette" :grid="sub.grid">
        <span v-if="sub.submissionId === mySubmissionId" class="salon-frame__tag">yours</span>
        <div v-if="awardsOn(sub.submissionId).length" class="salon-frame__badges">
          <img v-for="c in awardsOn(sub.submissionId)" :key="c.id" :src="asset(c.icon)" :alt="c.label" class="salon-frame__badge">
        </div>
      </SalonFrame>

      <div class="voting__cast">
        <p v-if="spectating" class="voting__mine">
          watching, you can't vote this round
        </p>
        <p v-else-if="sub.submissionId === mySubmissionId" class="voting__mine">
          can't award your own
        </p>
        <template v-else>
          <Button
            v-for="c in VOTE_CATEGORIES"
            :key="c.id"
            class="voting__award"
            :variant="myVotes[c.id] === sub.submissionId ? 'primary' : 'tertiary'"
            :aria-pressed="myVotes[c.id] === sub.submissionId"
            @click="emit('vote', c.id, sub.submissionId)"
          >
            <template #icon>
              <img :src="asset(c.icon)" alt="" class="voting__award-icon">
            </template>
            {{ c.label }}
          </Button>
        </template>
      </div>
    </div>
  </dialog>
</template>
