import type { MusicTrackId } from '../protocol/types'
import { asset } from '../assets'
import { MUSIC_TRACK_IDS } from '../protocol/types'

// Background-music manifest: id → label + category, keyed off the DOM-free MUSIC_TRACK_IDS the
// server validates against, so the two can't drift. Category is both the subfolder the file lives
// under (public/assets/audio/music/<category>, no CDN) and the dropdown group. Credit is in
// LICENSE.md and the in-app Credits page — CC-BY requires a visible credit.

export type MusicCategory = 'Upbeat' | 'Classical'

export interface MusicTrack {
  id: MusicTrackId
  label: string
  category: MusicCategory
}

const TRACKS: Record<MusicTrackId, { label: string, category: MusicCategory }> = {
  'blue-ska': { label: 'Blue Ska', category: 'Upbeat' },
  'cheery-monday': { label: 'Cheery Monday', category: 'Upbeat' },
  'rocket-power': { label: 'Rocket Power', category: 'Upbeat' },
  'the-builder': { label: 'The Builder', category: 'Upbeat' },
  'the-show-must-be-go': { label: 'The Show Must Be Go', category: 'Upbeat' },
}

// Dropdown group order; a group with no tracks is dropped by the control.
export const MUSIC_CATEGORIES: MusicCategory[] = ['Upbeat', 'Classical']

export const MUSIC_TRACKS: MusicTrack[] = MUSIC_TRACK_IDS.map(id => ({
  id,
  label: TRACKS[id].label,
  category: TRACKS[id].category,
}))

/** Resolve a track id to its asset URL (files live under the category subfolder). */
export function trackSrc(id: MusicTrackId): string {
  return asset(`assets/audio/music/${TRACKS[id].category}/${id}.webm`)
}

/** The display label for a track id. */
export function trackLabel(id: MusicTrackId): string {
  return TRACKS[id].label
}
