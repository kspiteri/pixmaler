// Pure room logic lifted out of `PixmalerServer` (#19): the vote key format, the
// tally that turns raw votes into a ranking, and the name-uniquing rule. Everything
// is a function of its arguments, so the parts with real consequences — who wins,
// what a player ends up called — are testable without a Durable Object.

import type { Player, RankedResult, Submission, VoteCategory } from '../src/lib/types'
import { adjectives } from '../src/lib/words'

// Enforced on BOTH write paths (join and rename): a name reaches the DOM as a class
// name, and `maxlength="24"` on the inputs is not a check.
export const NAME_MAX_LEN = 24

// One vote per voter per category. clientIds are UUIDs (no colons), so the LAST colon
// is always the separator — hence `lastIndexOf` rather than `split(':')`.
export function voteKey(clientId: string, category: VoteCategory): string {
  return `${clientId}:${category}`
}

export function categoryOf(key: string): VoteCategory {
  return key.slice(key.lastIndexOf(':') + 1) as VoteCategory
}

export function voterOf(key: string): string {
  return key.slice(0, key.lastIndexOf(':'))
}

// Narrowed so a test can build one without inventing a whole `Player`.
type Voter = Pick<Player, 'name' | 'connected'>

// Counted from the gallery, not `submissions`, so a non-drawer cannot appear. Votes
// from disconnected players are skipped, keeping the tally on the same population as
// the "N of M voted" readout the GM decided on. Unknown submissionIds are ignored.
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

// Compared case- and whitespace-insensitively; the returned name keeps its casing.
// `exceptClientId` is why the join path calls this in the new-player branch only — a
// reconnect compared against itself would re-decorate on every blip.
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

  // `adjective-Name`, matching the room code's shape (`feral-crayon`). Random start
  // and full rotation rather than one pick: with 63 adjectives a single pick collides
  // with another decorated player often enough to reproduce the bug this fixes.
  const start = Math.floor(Math.random() * adjectives.length)
  for (let i = 0; i < adjectives.length; i++) {
    const adj = adjectives[(start + i) % adjectives.length]
    // Clamp the BASE, not the result: prefixing first and clamping after cuts the
    // name off its own tail.
    const stem = base.trimStart().slice(0, NAME_MAX_LEN - adj.length - 1)
    const candidate = `${adj}-${stem}`
    if (!taken.has(candidate.toLowerCase()))
      return candidate
  }

  // Needs 63 players sharing one name, so unreachable in practice. Exists so the
  // function can never fail to return.
  for (let n = 2; ; n++) {
    const tail = `-${n}`
    const candidate = `${base.slice(0, NAME_MAX_LEN - tail.length).trimEnd()}${tail}`
    if (!taken.has(candidate.toLowerCase()))
      return candidate
  }
}
