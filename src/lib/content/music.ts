import type { MusicTrackId } from '../protocol/types'
import { asset } from '../assets'
import { MUSIC_TRACK_IDS } from '../protocol/types'

// Background-music manifest: id → label + category + credit, keyed off the DOM-free
// MUSIC_TRACK_IDS the server validates against, so the two can't drift. Category is the dropdown
// group, and its lowercase form the subfolder the file lives under
// (public/assets/audio/music/<category>, no CDN). Credit shows in the in-app Credits page and
// LICENSE.md — CC BY and CC BY-NC both require a visible credit.

export type MusicCategory = 'Upbeat' | 'Classical'

export type MusicCreditId = 'macleod' | 'classicals' | 'pixabay'

export interface MusicCredit {
  artist: string
  source: string
  sourceUrl: string
  licence: string
  licenceUrl: string
}

export interface MusicTrack {
  id: MusicTrackId
  label: string
  category: MusicCategory
  credit: MusicCreditId
}

const TRACKS: Record<MusicTrackId, { label: string, category: MusicCategory, credit: MusicCreditId }> = {
  'blue-ska': { label: 'Blue Ska', category: 'Upbeat', credit: 'macleod' },
  'cheery-monday': { label: 'Cheery Monday', category: 'Upbeat', credit: 'macleod' },
  'rocket-power': { label: 'Rocket Power', category: 'Upbeat', credit: 'macleod' },
  'the-builder': { label: 'The Builder', category: 'Upbeat', credit: 'macleod' },
  'the-show-must-be-go': { label: 'The Show Must Be Go', category: 'Upbeat', credit: 'macleod' },
  'boccherini-minuet': { label: 'Boccherini: Minuet', category: 'Classical', credit: 'classicals' },
  'offenbach-can-can': { label: 'Offenbach: Can-can', category: 'Classical', credit: 'classicals' },
  'tchaikovsky-piano-concerto-1': { label: 'Tchaikovsky: Piano Concerto No. 1', category: 'Classical', credit: 'classicals' },
  'mozart-eine-kleine-nachtmusik': { label: 'Mozart: Eine kleine Nachtmusik', category: 'Classical', credit: 'pixabay' },
  'rossini-william-tell': { label: 'Rossini: William Tell', category: 'Classical', credit: 'pixabay' },
  'grieg-mountain-king': { label: 'Grieg: In the Hall of the Mountain King', category: 'Classical', credit: 'pixabay' },
}

// Attribution per source. CC BY (MacLeod) and CC BY-NC (classicals.de) require a visible credit;
// the Pixabay licence does not, but Gregor Quendel is credited anyway.
export const MUSIC_CREDITS: Record<MusicCreditId, MusicCredit> = {
  macleod: {
    artist: 'Kevin MacLeod',
    source: 'incompetech.com',
    sourceUrl: 'https://incompetech.com',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
  classicals: {
    artist: 'Gregor Quendel',
    source: 'classicals.de',
    sourceUrl: 'https://www.classicals.de',
    licence: 'CC BY-NC 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-nc/4.0/',
  },
  pixabay: {
    artist: 'Gregor Quendel',
    source: 'Pixabay',
    sourceUrl: 'https://pixabay.com/music/',
    licence: 'Pixabay Content License',
    licenceUrl: 'https://pixabay.com/service/license-summary/',
  },
}

// Dropdown group order; a group with no tracks is dropped by the control.
export const MUSIC_CATEGORIES: MusicCategory[] = ['Upbeat', 'Classical']

export const MUSIC_TRACKS: MusicTrack[] = MUSIC_TRACK_IDS.map(id => ({
  id,
  label: TRACKS[id].label,
  category: TRACKS[id].category,
  credit: TRACKS[id].credit,
}))

export interface MusicCreditGroup {
  id: MusicCreditId
  credit: MusicCredit
  titles: string[]
}

// Credits grouped by source for the modal, in a stable order; empty groups dropped.
const CREDIT_ORDER: MusicCreditId[] = ['macleod', 'classicals', 'pixabay']
export const MUSIC_CREDIT_GROUPS: MusicCreditGroup[] = CREDIT_ORDER
  .map(id => ({ id, credit: MUSIC_CREDITS[id], titles: MUSIC_TRACKS.filter(t => t.credit === id).map(t => t.label) }))
  .filter(g => g.titles.length > 0)

/** Resolve a track id to its asset URL (files live under the lowercase category subfolder). */
export function trackSrc(id: MusicTrackId): string {
  // Lowercase, not the display label: a miscased path gets index.html back and plays as silence.
  return asset(`assets/audio/music/${TRACKS[id].category.toLowerCase()}/${id}.webm`)
}

/** The display label for a track id. */
export function trackLabel(id: MusicTrackId): string {
  return TRACKS[id].label
}
