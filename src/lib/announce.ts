// A single pair of visually-hidden live regions for one-off screen-reader announcements
// that have no visible home — a copy confirmation that only swaps an icon, say. Module-level,
// one per document, like `lib/dialog.ts` and `lib/theme.ts`. In-place status that annotates
// visible text (the countdown, the vote tally) keeps its own `role="status"`; this is only for
// ephemeral messages. `App.vue` binds both refs to always-present `sr-only` regions — a live
// region must exist before its text changes, or the change isn't announced.

import { ref } from 'vue'

export const politeMessage = ref('')
export const assertiveMessage = ref('')

export function announce(message: string, politeness: 'polite' | 'assertive' = 'polite') {
  const region = politeness === 'assertive' ? assertiveMessage : politeMessage
  // Clear then set on the next frame so an identical consecutive message still speaks —
  // a live region only announces on a change.
  region.value = ''
  requestAnimationFrame(() => { region.value = message })
}
