import type { AvatarShape, Player } from './types'
import { normaliseShape } from './types'

// Seat colours — a player's identity colour, shared by the lobby roster and the
// results screen so the colour genuinely follows the player rather than being a
// per-screen decoration. The palette lives in `_tokens.scss` as `$player-colours`
// and reaches here only as `--player-colour-N` custom properties; no hex crosses
// into TypeScript.
//
// **A seat is the player's index in `state.players`, and that index is stable.**
// The server keys players by clientId in a `Map` and *never* removes one — a
// disconnect only flips `connected` to false, which is why a dropped player still
// shows as `[offline]`. A `Map` iterates in insertion order and `buildState()`
// spreads it straight into the array, so seat === join order for the room's whole
// life, and it survives `gm:playAgain` too. That is what makes an index-based
// colour safe to treat as identity. A `clientId` hash was rejected because
// adjacent players could collide on near-identical colours.
//
// **Two invariants keep that true; both are easy to break by accident.**
//   1. The server must never remove a player, and `buildState()` must keep
//      emitting `players` in insertion order. Sorting there would re-seat
//      everyone below the moved row, out of reach of any client-side fix.
//   2. Callers must compute the seat from the *array* index, then sort for
//      display — never sort first. Nothing sorts today and the intent is to keep
//      it that way: a kicked player (`13-technical.md` item 33) would stay in
//      place, as an `[offline]` one already does. The note in `PlayerList.vue`
//      has the details for whoever revisits that.
// If display order ever has to diverge from seat order for real, put an explicit
// `seat` on `Player` rather than inferring it — but that is a protocol change.

// Keep in sync with `$player-colours` in `src/styles/_tokens.scss`. That list is
// stored in golden-angle walk order, so consecutive seats land ~137° apart in hue
// and the 2nd player to join never gets a near-neighbour of the 1st's colour.
export const SEAT_COUNT = 21

// How far the chip leans, as a multiplier on `$wonk-avatar` (the angle itself
// lives in `_wonk.scss` with the rest of the tilt doctrine, so no degree value
// crosses into TypeScript). Four buckets rather than a simple ±1: two of them
// half-strength, so a screenful reads as hand-placed rather than as two
// alternating states.
//
// Picked by the **initial's** character code, not the seat. The roster rows
// already alternate by seat (`wonk()` on `.player-list__row`), so keying the chip
// to seat parity too would just amplify a signal that's already there; keyed to
// the letter it varies independently, and a player keeps the same lean in every
// room forever — like their colour, but derived from their name instead of their
// join order. Consecutive letters land in different buckets, so alphabetically
// adjacent names don't match. Two players sharing an initial do share a lean; the
// row tilt still separates them.
const LEANS = [-1, -0.55, 0.55, 1] as const

export interface Seat {
  /** `var()` reference into the ramp — never a literal colour. */
  colour: string
  /**
   * The avatar's letter. Decorative: the name is always rendered beside it, so
   * the chip is `aria-hidden` and this is never read aloud.
   */
  initial: string
  /** Modifier class suffix — `avatar--<shape>` (see `_avatar.scss`). */
  shape: AvatarShape
  /**
   * Multiplier on `$wonk-avatar` (see `LEANS`) — how far and which way the chip
   * leans. Derived from the initial, so it varies independently of the row tilt.
   */
  lean: number
}

/**
 * Everything a seat chip needs, or `null` for a player who isn't in the roster —
 * the caller then renders no chip rather than guessing a colour.
 *
 * **No caller passes the old `-1` sentinel any more.** Results resolves the
 * `Player` first and renders nothing on a lookup miss, `PlayerList` maps over the
 * array so its index is never negative, and `Lobby` guards before calling. The
 * `seat < 0` branch is belt-and-braces, not the documented way to say "not
 * found" — don't reintroduce `?? -1` at a call site to lean on it, or a player
 * absent from the roster gets a chip.
 *
 * Takes the player rather than loose fields so the chip's three inputs stay in
 * one object: Results resolves the `Player` for the shape anyway, and splitting
 * them invited passing a `RankedResult` (which has a name but no shape).
 *
 * Seats past `SEAT_COUNT` wrap, so a 22nd player reuses seat 0 rather than
 * falling off the end of the ramp.
 */
export function seatFor(seat: number, player: Pick<Player, 'name' | 'shape'>): Seat | null {
  if (seat < 0)
    return null
  const initial = player.name.trim().charAt(0).toUpperCase() || '?'
  return {
    colour: `var(--player-colour-${seat % SEAT_COUNT})`,
    initial,
    // Inbound `state` is assigned verbatim by App.vue's dispatcher, so this is
    // the read-side boundary: the client and server deploy to two independent
    // targets, and a client newer than the server would otherwise emit
    // `avatar--undefined`. Harmless today only because `--rounded` carries no
    // rule of its own; normalising keeps the declared type honest regardless.
    shape: normaliseShape(player.shape),
    lean: LEANS[initial.charCodeAt(0) % LEANS.length],
  }
}
