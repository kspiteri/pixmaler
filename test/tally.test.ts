// Room logic with real consequences: who wins the round, and what a player ends
// up called. Both were private to `PixmalerServer` until the split in #19 gave
// them a module of their own.

import type { Player, Submission } from '../src/lib/types'
import { describe, expect, it } from 'vitest'
import { categoryOf, NAME_MAX_LEN, tallyVotes, uniqueName, voteKey, voterOf } from '../party/tally'
import { adjectives } from '../src/lib/words'

type Voter = Pick<Player, 'name' | 'connected'>

function room(entries: [id: string, name: string, connected?: boolean][]): Map<string, Voter> {
  return new Map(entries.map(([id, name, connected = true]) => [id, { name, connected }]))
}

function gallery(...ids: string[]): Submission[] {
  return ids.map(id => ({ submissionId: id, grid: [0, 1] }))
}

describe('vote keys', () => {
  it('round-trips a voter and a category', () => {
    const key = voteKey('abc', 'funniest')
    expect(voterOf(key)).toBe('abc')
    expect(categoryOf(key)).toBe('funniest')
  })

  it('splits on the LAST colon, so a clientId containing one still parses', () => {
    // The reason these use lastIndexOf rather than split(':'). clientIds are UUIDs
    // today, but a naive split would silently mis-attribute a vote if that changed.
    const key = voteKey('ns:tenant:abc', 'best')
    expect(voterOf(key)).toBe('ns:tenant:abc')
    expect(categoryOf(key)).toBe('best')
  })

  it('gives each voter one key per category', () => {
    expect(voteKey('a', 'funniest')).not.toBe(voteKey('a', 'best'))
  })
})

describe('tallyVotes', () => {
  it('returns one entry per gallery submission, even with no votes', () => {
    const ranked = tallyVotes(gallery('a', 'b'), new Map(), room([['a', 'Ann'], ['b', 'Bob']]))
    expect(ranked.map(r => r.submissionId).sort()).toEqual(['a', 'b'])
    expect(ranked.every(r => r.votes === 0)).toBe(true)
    expect(ranked[0].breakdown).toEqual({ funniest: 0, best: 0 })
  })

  it('counts each category separately and sums them into the total', () => {
    const votes = new Map([
      [voteKey('v1', 'funniest'), 'a'],
      [voteKey('v2', 'funniest'), 'a'],
      [voteKey('v1', 'best'), 'a'],
    ])
    const ranked = tallyVotes(gallery('a'), votes, room([['a', 'Ann'], ['v1', 'V1'], ['v2', 'V2']]))
    expect(ranked[0].breakdown).toEqual({ funniest: 2, best: 1 })
    expect(ranked[0].votes).toBe(3)
  })

  it('ranks by total votes, highest first', () => {
    const votes = new Map([
      [voteKey('v1', 'funniest'), 'b'],
      [voteKey('v2', 'funniest'), 'b'],
      [voteKey('v1', 'best'), 'a'],
    ])
    const ranked = tallyVotes(gallery('a', 'b', 'c'), votes, room([
      ['a', 'Ann'],
      ['b', 'Bob'],
      ['c', 'Cal'],
      ['v1', 'V1'],
      ['v2', 'V2'],
    ]))
    expect(ranked.map(r => r.submissionId)).toEqual(['b', 'a', 'c'])
  })

  it('skips votes from a disconnected voter', () => {
    // Votes are never pruned — onClose only flips `connected` — so the tally has
    // to filter, or it counts a population the GM's "N of M voted" never did.
    const votes = new Map([
      [voteKey('v1', 'funniest'), 'a'],
      [voteKey('gone', 'funniest'), 'a'],
    ])
    const players = room([['a', 'Ann'], ['v1', 'V1'], ['gone', 'Ghost', false]])
    expect(tallyVotes(gallery('a'), votes, players)[0].votes).toBe(1)
  })

  it('counts a voter again once they reconnect', () => {
    const votes = new Map([[voteKey('v1', 'best'), 'a']])
    expect(tallyVotes(gallery('a'), votes, room([['a', 'Ann'], ['v1', 'V1', false]]))[0].votes).toBe(0)
    expect(tallyVotes(gallery('a'), votes, room([['a', 'Ann'], ['v1', 'V1', true]]))[0].votes).toBe(1)
  })

  it('ignores a vote for a submission not in the gallery', () => {
    // A blank canvas is filtered out of the gallery, and a stale client can name
    // anything — neither may throw.
    const votes = new Map([
      [voteKey('v1', 'best'), 'ghost'],
      [voteKey('v2', 'best'), 'a'],
    ])
    const players = room([['a', 'Ann'], ['v1', 'V1'], ['v2', 'V2']])
    expect(() => tallyVotes(gallery('a'), votes, players)).not.toThrow()
    expect(tallyVotes(gallery('a'), votes, players)[0].votes).toBe(1)
  })

  it('ignores a vote from someone who is not in the room at all', () => {
    const votes = new Map([[voteKey('nobody', 'best'), 'a']])
    expect(tallyVotes(gallery('a'), votes, room([['a', 'Ann']]))[0].votes).toBe(0)
  })

  it('names the drawing after its author, falling back when they are gone', () => {
    const ranked = tallyVotes(gallery('a', 'b'), new Map(), room([['a', 'Ann']]))
    expect(ranked.find(r => r.submissionId === 'a')!.name).toBe('Ann')
    expect(ranked.find(r => r.submissionId === 'b')!.name).toBe('Unknown')
  })

  it('carries the grid through so results can render without a second lookup', () => {
    expect(tallyVotes(gallery('a'), new Map(), room([['a', 'Ann']]))[0].grid).toEqual([0, 1])
  })

  it('sets clientId to the submissionId, which the vote self-check relies on', () => {
    const ranked = tallyVotes(gallery('a'), new Map(), room([['a', 'Ann']]))
    expect(ranked[0].clientId).toBe(ranked[0].submissionId)
  })

  it('handles an empty gallery', () => {
    expect(tallyVotes([], new Map([[voteKey('v1', 'best'), 'a']]), room([['v1', 'V1']]))).toEqual([])
  })
})

describe('uniqueName', () => {
  const players = (entries: [string, string][]) => entries.map(([clientId, name]) => ({ clientId, name }))

  it('returns the name unchanged when nobody has it', () => {
    expect(uniqueName('keith', 'me', players([['other', 'ray']]))).toBe('keith')
  })

  it('lets a player keep their own name on rename', () => {
    // Without `exceptClientId` a rename to your current name would decorate it.
    expect(uniqueName('keith', 'me', players([['me', 'keith']]))).toBe('keith')
  })

  it('treats case and surrounding whitespace as the same name', () => {
    // The room ends in a one-shot name reveal, so `keith` and `Keith ` colliding
    // is a gameplay problem, not just a cosmetic one.
    for (const taken of ['KEITH', 'Keith', ' keith '])
      expect(uniqueName('keith', 'me', players([['other', taken]]))).not.toBe('keith')
  })

  it('decorates a collision with an adjective prefix', () => {
    const out = uniqueName('keith', 'me', players([['other', 'keith']]))
    expect(out).not.toBe('keith')
    const [prefix] = out.split('-')
    expect(adjectives).toContain(prefix)
  })

  it('never returns a name already taken, however crowded the room', () => {
    // The invariant that matters. The adjective is picked from a random start, so
    // this runs repeatedly rather than asserting one specific output.
    const taken = players([['a', 'keith'], ['b', 'feral-keith'], ['c', 'crusty-keith']])
    const lower = new Set(taken.map(p => p.name.toLowerCase()))
    for (let i = 0; i < 200; i++)
      expect(lower.has(uniqueName('keith', 'me', taken).toLowerCase())).toBe(false)
  })

  it('stays within the name cap even with a long name and a long adjective', () => {
    const long = 'a'.repeat(60)
    const taken = players([['a', long]])
    for (let i = 0; i < 200; i++)
      expect(uniqueName(long, 'me', taken).length).toBeLessThanOrEqual(NAME_MAX_LEN)
  })

  it('clamps the base, not the result, so the name keeps its head', () => {
    // Prefixing first and clamping after would cut the name off its own tail, and
    // with a long adjective could drop it entirely.
    const base = 'Bartholomew-the-Third'
    const out = uniqueName(base, 'me', players([['a', base]]))
    const [prefix, ...rest] = out.split('-')
    expect(adjectives).toContain(prefix)
    // Whatever survived must be a prefix of the original, never a fragment of it.
    expect(base.startsWith(rest.join('-'))).toBe(true)
    expect(rest.join('-').length).toBeGreaterThan(0)
  })

  it('falls back to a counter suffix when every adjective is taken', () => {
    const taken = players([
      ['base', 'keith'],
      ...adjectives.map((adj, i) => [`c${i}`, `${adj}-keith`] as [string, string]),
    ])
    const out = uniqueName('keith', 'me', taken)
    expect(out).toMatch(/^keith-\d+$/)
  })

  it('always returns a non-empty name', () => {
    for (const base of ['keith', '', ' ', 'x'])
      expect(uniqueName(base, 'me', players([['a', base]])).length).toBeGreaterThan(0)
  })
})
