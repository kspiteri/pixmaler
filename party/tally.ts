// Pure room logic lifted out of `PixmalerServer`: the vote key format, the tally
// that turns raw votes into a ranking, and the name-uniquing rule.
//
// First slice of the split tracked in #19. Everything here is a function of its
// arguments — no `this`, no connections, no broadcasts — which is what lets the
// parts with real consequences (who wins, what a player ends up called) be tested
// without standing up a Durable Object.

import type { Player, RankedResult, Submission, VoteCategory } from '../src/lib/types'
import { adjectives } from '../src/lib/words'

// Name length cap. Enforced on BOTH write paths (join and rename): a name reaches
// the DOM as a class name, and until this was centralised `handleRename` clamped
// while `handleJoin` stored the raw value — so the cap was really only the
// `maxlength="24"` on three inputs, which any crafted or stale client walks past.
export const NAME_MAX_LEN = 24

// Votes are keyed by voter + category so each player gets one vote per category.
// `voteKey` builds the composite key; `categoryOf` and `voterOf` read the halves
// back. clientIds are UUIDs (no colons), so the LAST colon is always the
// separator — which is why these use `lastIndexOf` rather than `split(':')`.
export function voteKey(clientId: string, category: VoteCategory): string {
  return `${clientId}:${category}`
}

export function categoryOf(key: string): VoteCategory {
  return key.slice(key.lastIndexOf(':') + 1) as VoteCategory
}

export function voterOf(key: string): string {
  return key.slice(0, key.lastIndexOf(':'))
}

// What the tally needs to know about a player. Narrowed so a test can build one
// without inventing a whole `Player`.
type Voter = Pick<Player, 'name' | 'connected'>

/**
 * Rank the frozen gallery by votes.
 *
 * Counted from the gallery rather than from `submissions`, so a non-drawer can
 * never appear in the results.
 *
 * **Votes from disconnected players are skipped.** Votes are never pruned
 * (`onClose` only flips `connected`), so reconnecting before the GM ends voting
 * restores a player's weight. This keeps the tally counting the same population
 * as `votingProgress`, which is what the GM's "N of M voted" readout — and so
 * their decision to end the round — is based on.
 *
 * Votes for a submission that is not in the gallery are ignored rather than
 * throwing: a blank canvas is filtered out of the gallery after voting opened in
 * some orderings, and a stale client can name anything.
 */
export function tallyVotes(
  gallery: Submission[],
  votes: Map<string, string>,
  players: Map<string, Voter>,
): RankedResult[] {
  const breakdowns = new Map<string, Record<VoteCategory, number>>()
  for (const sub of gallery)
    breakdowns.set(sub.submissionId, { funniest: 0, best: 0 })

  for (const [key, subId] of votes.entries()) {
    if (!players.get(voterOf(key))?.connected)
      continue
    const breakdown = breakdowns.get(subId)
    if (breakdown)
      breakdown[categoryOf(key)]++
  }

  return gallery
    .map((sub) => {
      const breakdown = breakdowns.get(sub.submissionId)!
      return {
        submissionId: sub.submissionId,
        clientId: sub.submissionId,
        name: players.get(sub.submissionId)?.name ?? 'Unknown',
        votes: breakdown.funniest + breakdown.best,
        breakdown,
        grid: sub.grid,
      }
    })
    .sort((a, b) => b.votes - a.votes)
}

/**
 * A name nobody else in the room is already using, case- and whitespace-
 * insensitively: `keith` and `Keith ` are the same person to everyone in the
 * room, and the game ends in a one-shot name reveal. The returned name keeps its
 * original casing.
 *
 * `exceptClientId` is what makes this safe to call from a rename (you may keep
 * your own name), and it is why the join path calls it in the new-player branch
 * only: a reconnecting player must never be compared against themselves. Called
 * outside that branch it would re-decorate on every reconnect blip — `Keith` →
 * `feral-Keith` → `crusty-feral-Keith` — and partysocket reconnects unprompted,
 * so a flaky phone would ratchet a name forever.
 */
export function uniqueName(
  base: string,
  exceptClientId: string,
  players: Iterable<Pick<Player, 'clientId' | 'name'>>,
): string {
  const taken = new Set<string>()
  for (const p of players) {
    if (p.clientId !== exceptClientId)
      taken.add(p.name.trim().toLowerCase())
  }
  if (!taken.has(base.trim().toLowerCase()))
    return base

  // `adjective-Name`, matching the room code's own shape (`feral-crayon`) so a
  // decorated name reads as part of the game's vocabulary rather than as an error.
  //
  // Retried rather than picked once: with 63 adjectives a single pick collides with
  // another decorated player ~50% of the time within about ten of them, which would
  // reproduce the exact bug this exists to fix. Random start, full rotation, so
  // every adjective is tried without biasing toward the head of the list.
  const start = Math.floor(Math.random() * adjectives.length)
  for (let i = 0; i < adjectives.length; i++) {
    const adj = adjectives[(start + i) % adjectives.length]
    // Clamp the BASE, not the result: prefixing first and clamping after would cut
    // the *name* off its own tail, and with a long adjective could drop it entirely.
    const stem = base.trimStart().slice(0, NAME_MAX_LEN - adj.length - 1)
    const candidate = `${adj}-${stem}`
    if (!taken.has(candidate.toLowerCase()))
      return candidate
  }

  // Every adjective taken — needs 63 players sharing one name, so unreachable in
  // practice. Counter suffix rather than a second prefix: `2-Keith` reads as a typo,
  // `Keith-2` reads as a fallback. Exists so the function can never fail to return.
  for (let n = 2; ; n++) {
    const tail = `-${n}`
    const candidate = `${base.slice(0, NAME_MAX_LEN - tail.length).trimEnd()}${tail}`
    if (!taken.has(candidate.toLowerCase()))
      return candidate
  }
}
