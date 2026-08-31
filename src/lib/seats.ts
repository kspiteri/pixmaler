// Seat identity: a player's colour, initial, avatar shape and chip tilt, shared by the
// lobby roster and the results screen so the colour follows the player rather than the
// screen. Colours arrive only as `--player-colour-N` custom properties — the ramp lives
// in `_tokens.scss` and no hex crosses into TypeScript.
//
// **A seat is the player's index in `state.players`, and that index is stable**: the
// server never removes a player, so insertion order survives disconnects and
// `gm:playAgain`. Two things keep it true — `buildState` must not sort `players`, and
// callers must take the seat from the array index *before* sorting for display.

import type { AvatarShape, Player } from './types'
import { normaliseShape } from './types'

// Keep in sync with `$player-colours`, stored in golden-angle walk order so consecutive
// seats land ~137° apart and the 2nd player never neighbours the 1st.
export const SEAT_COUNT = 21

// How far the chip leans, as a multiplier on `$wonk-avatar`. Four buckets, two at half
// strength, so a screenful reads as hand-placed. Keyed by the **initial**, not the seat:
// rows already alternate by seat, so the letter makes it vary independently.
const LEANS = [-1, -0.55, 0.55, 1] as const

export interface Seat {
  /** `var()` reference into the ramp — never a literal colour. */
  colour: string
  /** Decorative: the name is rendered beside it, so the chip is `aria-hidden`. */
  initial: string
  /** Modifier class suffix — `avatar--<shape>` (see `_avatar.scss`). */
  shape: AvatarShape
  /** Multiplier on `$wonk-avatar` (see `LEANS`). */
  lean: number
}

// Null for a player absent from the roster, so the caller renders no chip rather than
// guessing a colour — don't reintroduce `?? -1` at a call site to lean on the `seat < 0`
// branch. Seats past `SEAT_COUNT` wrap. Takes the player so the chip's inputs stay together.
export function seatFor(seat: number, player: Pick<Player, 'name' | 'shape'>): Seat | null {
  if (seat < 0)
    return null
  // Code points, not UTF-16 units. `charAt(0)` returned a lone high surrogate, so every
  // emoji in a block collapsed to the same tofu glyph *and* the same lean — U+1F300–1F3FF
  // all share \uD83C. The '?' fallback stops an all-whitespace name reaching `LEANS`.
  const initial = [...player.name.trim()][0]?.toUpperCase() ?? '?'
  return {
    colour: `var(--player-colour-${seat % SEAT_COUNT})`,
    initial,
    // The read-side boundary: `state` is assigned verbatim by App.vue's dispatcher, and
    // client and server deploy independently, so a newer client could emit
    // `avatar--undefined`. Normalising keeps the declared type honest.
    shape: normaliseShape(player.shape),
    lean: LEANS[initial.codePointAt(0)! % LEANS.length],
  }
}
