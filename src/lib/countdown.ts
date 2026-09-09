// Countdown announcements for assistive tech (#10). A visible timer that ticks every
// second must stay silent — a per-second live region drowns out the tally and phase
// announcements. This vocalises the remaining time at chosen milestones only.
//
// Returns a ref of screen-reader text to bind to a visually-hidden `role="status"`
// region; the visible number keeps ticking, untouched.

import type { Ref } from 'vue'
import { ref, watch } from 'vue'

export function useCountdownAnnounce(seconds: Ref<number | null>, milestones: number[]): Ref<string> {
  const message = ref('')
  watch(seconds, (s) => {
    // Only fires when the integer second actually changes (a ref), so each milestone
    // is announced once. Distinct numbers mean the text always differs from the last,
    // which is what makes a polite live region re-read it. `milestones` is a handful of
    // values, so a linear scan is nothing.
    if (s !== null && milestones.includes(s))
      message.value = `${s} second${s === 1 ? '' : 's'} left`
  })
  return message
}
