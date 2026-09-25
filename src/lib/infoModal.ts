import { ref } from 'vue'

// The info modal's active content, or null. Module-level like `lib/dialog.ts` — one global
// instance, opened from the settings menu (and Entry's privacy link). Credits and the privacy
// notice are the app's two info surfaces; a modal keeps both reachable everywhere, including
// mid-game for a joiner who never sees Entry. CC-BY needs a visible, findable credit (incompetech
// FAQ), and the privacy notice is a data-minimisation nudge (#44).

export type InfoModalKind = 'credits' | 'privacy'

export const activeInfo = ref<InfoModalKind | null>(null)

export function openCredits(): void {
  activeInfo.value = 'credits'
}

export function openPrivacy(): void {
  activeInfo.value = 'privacy'
}

export function closeInfo(): void {
  activeInfo.value = null
}
