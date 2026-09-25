import type { MusicTrackId } from '../protocol/types'
import { asset } from '../assets'
import { MUSIC_TRACK_IDS } from '../protocol/types'

// Background-music manifest (#2): the id → label + asset for each track, keyed off the DOM-free
// MUSIC_TRACK_IDS the server validates against, so the two can't drift. Files are self-hosted
// webm/Opus under public/assets/audio/music (no CDN, #44). Credit is in LICENSE.md and the
// in-app Credits page — CC-BY requires a visible credit.

export interface MusicTrack {
  id: MusicTrackId
  label: string
  src: string
}

const LABELS: Record<MusicTrackId, string> = {
  'blue-ska': 'Blue Ska',
  'cheery-monday': 'Cheery Monday',
  'rocket-power': 'Rocket Power',
  'the-builder': 'The Builder',
  'the-show-must-be-go': 'The Show Must Be Go',
}

export const MUSIC_TRACKS: MusicTrack[] = MUSIC_TRACK_IDS.map(id => ({
  id,
  label: LABELS[id],
  src: asset(`assets/audio/music/${id}.webm`),
}))

/** Resolve a track id to its asset URL. */
export function trackSrc(id: MusicTrackId): string {
  return asset(`assets/audio/music/${id}.webm`)
}

/** The display label for a track id. */
export function trackLabel(id: MusicTrackId): string {
  return LABELS[id]
}
