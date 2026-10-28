// The server-message reducer's read side for `results`: what a client renders is the
// normalised payload, so an older Worker's missing `likeness` never reaches the screen.

import type PartySocket from 'partysocket'
import type { RoomRefs } from '../src/lib/composables/useRoom/messages'
import type { RankedResult, ResultsMsg } from '../src/lib/protocol/types'
import { describe, expect, it } from 'vitest'
import { ref, shallowRef } from 'vue'
import { applyServerMessage } from '../src/lib/composables/useRoom/messages'

function refs(): RoomRefs {
  return {
    state: shallowRef(null),
    gallery: shallowRef(null),
    results: shallowRef(null),
    voteState: shallowRef(null),
    drawState: shallowRef(null),
    targetGrid: shallowRef(null),
    sessionClosed: ref(false),
    roomFull: ref(false),
    noSuchRoom: ref(false),
    roundCancelled: ref(false),
    joinCreate: ref(false),
  }
}

function entry(id: string, likeness: unknown): RankedResult {
  return { submissionId: id, clientId: id, name: id, votes: 0, breakdown: { funniest: 0, best: 0 }, grid: [0], likeness } as RankedResult
}

describe('results reducer', () => {
  it('reads likeness through the normaliser: missing or malformed is no likeness, 0 stays 0', () => {
    const r = refs()
    const msg = {
      type: 'results',
      palette: ['#000000'],
      gridW: 1,
      gridH: 1,
      ranked: [entry('old-worker', undefined), entry('scored', 64), entry('zero', 0), entry('junk', '64')],
    } as ResultsMsg
    applyServerMessage(msg, r, {} as PartySocket)
    expect(r.results.value!.ranked.map(e => e.likeness)).toEqual([null, 64, 0, null])
  })
})
