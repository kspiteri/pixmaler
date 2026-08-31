// DRAWING handlers, driven through a fake `RoomCtx`.
//
// `draw:submit` carries a grid that is broadcast verbatim to every other player in
// the `gallery` message, so its contextual validation — length and palette range
// against the round's own config — is the guard that keeps a crafted payload out of
// everyone else's renderer.

import type { RoomPlayer, RoomState } from '../party/state'
import type { GmConfigureMsg } from '../src/lib/types'
import { describe, expect, it } from 'vitest'
import { handleDrawDone, handleSubmit } from '../party/drawing'
import { player, harness as room } from './support/room'

// A 2x2 round with a two-colour palette, so valid cells are -1, 0 and 1.
const config = {
  type: 'gm:configure',
  gridW: 2,
  gridH: 2,
  palette: ['#000000', '#ffffff'],
  targetGrid: [0, 1, 1, 0],
  drawSeconds: 60,
} satisfies GmConfigureMsg

function harness(players: RoomPlayer[], over: Partial<RoomState> = {}) {
  return room(players, { phase: 'DRAWING', config, ...over })
}

function submit(grid: number[]) {
  return { type: 'draw:submit', grid } as const
}

describe('handleDrawDone', () => {
  it('flags the player and broadcasts the new counts', () => {
    const h = harness([player('a'), player('b')])
    handleDrawDone(h.ctx, h.conn('conn-a'))
    expect(h.state.players.get('a')!.doneDrawing).toBe(true)
    expect(h.doneStatusBroadcasts()).toBe(1)
  })

  it('does not end the round — the deadline does', () => {
    // A social signal only. Everyone flagging done must leave the phase alone.
    const h = harness([player('a'), player('b')])
    handleDrawDone(h.ctx, h.conn('conn-a'))
    handleDrawDone(h.ctx, h.conn('conn-b'))
    expect(h.state.phase).toBe('DRAWING')
  })

  it('ignores a spectator, who has no canvas', () => {
    const h = harness([player('late', { spectating: true })])
    handleDrawDone(h.ctx, h.conn('conn-late'))
    expect(h.state.players.get('late')!.doneDrawing).toBe(false)
    expect(h.doneStatusBroadcasts()).toBe(0)
  })

  it('ignores an unidentified connection', () => {
    const h = harness([player('a')])
    handleDrawDone(h.ctx, h.conn('conn-nobody'))
    expect(h.doneStatusBroadcasts()).toBe(0)
  })

  it('ignores it outside DRAWING', () => {
    for (const phase of ['LOBBY', 'VOTING', 'RESULTS'] as const) {
      const h = harness([player('a')], { phase })
      handleDrawDone(h.ctx, h.conn('conn-a'))
      expect(h.state.players.get('a')!.doneDrawing).toBe(false)
    }
  })
})

describe('handleSubmit', () => {
  it('stores a valid grid under the player\'s clientId', () => {
    // submissionId === clientId is what the vote self-check relies on.
    const h = harness([player('a')])
    handleSubmit(h.ctx, h.conn('conn-a'), submit([0, 1, 1, 0]))
    expect(h.state.submissions.get('a')).toEqual([0, 1, 1, 0])
  })

  it('accepts unpainted cells, which a real canvas legitimately has', () => {
    const h = harness([player('a')])
    handleSubmit(h.ctx, h.conn('conn-a'), submit([-1, 0, -1, 1]))
    expect(h.state.submissions.get('a')).toEqual([-1, 0, -1, 1])
  })

  it('rejects a grid whose length disagrees with the round', () => {
    const h = harness([player('a')])
    for (const grid of [[0], [0, 1, 1], [0, 1, 1, 0, 0], []])
      handleSubmit(h.ctx, h.conn('conn-a'), submit(grid))
    expect(h.state.submissions.size).toBe(0)
  })

  it('rejects a cell outside the round\'s palette', () => {
    // Broadcast verbatim in `gallery`, so an out-of-range index would reach every
    // other player's renderer.
    const h = harness([player('a')])
    for (const grid of [[0, 1, 1, 2], [0, 1, 1, 99], [0, 1, 1, -2]])
      handleSubmit(h.ctx, h.conn('conn-a'), submit(grid))
    expect(h.state.submissions.size).toBe(0)
  })

  it('rejects everything when no round is configured', () => {
    const h = harness([player('a')], { config: null })
    handleSubmit(h.ctx, h.conn('conn-a'), submit([0, 1, 1, 0]))
    expect(h.state.submissions.size).toBe(0)
  })

  it('keeps a spectator out of submissions, so they cannot be voted on', () => {
    const h = harness([player('late', { spectating: true })])
    handleSubmit(h.ctx, h.conn('conn-late'), submit([0, 1, 1, 0]))
    expect(h.state.submissions.size).toBe(0)
  })

  it('ignores it outside DRAWING', () => {
    for (const phase of ['LOBBY', 'VOTING', 'RESULTS'] as const) {
      const h = harness([player('a')], { phase })
      handleSubmit(h.ctx, h.conn('conn-a'), submit([0, 1, 1, 0]))
      expect(h.state.submissions.size).toBe(0)
    }
  })

  it('does not set doneDrawing — that is a separate signal', () => {
    const h = harness([player('a')])
    handleSubmit(h.ctx, h.conn('conn-a'), submit([0, 1, 1, 0]))
    expect(h.state.players.get('a')!.doneDrawing).toBe(false)
  })

  it('sets drewThisRound once the player paints anything', () => {
    const h = harness([player('a')])
    handleSubmit(h.ctx, h.conn('conn-a'), submit([0, -1, -1, -1]))
    expect(h.state.players.get('a')!.drewThisRound).toBe(true)
  })

  it('leaves drewThisRound unset for a canvas that was never touched', () => {
    const h = harness([player('a')])
    handleSubmit(h.ctx, h.conn('conn-a'), submit([-1, -1, -1, -1]))
    expect(h.state.players.get('a')!.drewThisRound).toBe(false)
  })

  it('keeps drewThisRound set after the canvas is wiped', () => {
    // The #3 regression: clearing sends an all-`-1` grid down this same path, and
    // unsetting the flag dropped the player out of the gallery for having wiped
    // work they did do.
    const h = harness([player('a')])
    handleSubmit(h.ctx, h.conn('conn-a'), submit([0, 1, 1, 0]))
    handleSubmit(h.ctx, h.conn('conn-a'), submit([-1, -1, -1, -1]))
    expect(h.state.players.get('a')!.drewThisRound).toBe(true)
    expect(h.state.submissions.get('a')).toEqual([-1, -1, -1, -1])
  })

  it('overwrites the previous grid rather than accumulating', () => {
    // The client debounces this on every stroke, so it arrives constantly.
    const h = harness([player('a')])
    handleSubmit(h.ctx, h.conn('conn-a'), submit([0, 0, 0, 0]))
    handleSubmit(h.ctx, h.conn('conn-a'), submit([1, 1, 1, 1]))
    expect(h.state.submissions.get('a')).toEqual([1, 1, 1, 1])
    expect(h.state.submissions.size).toBe(1)
  })

  it('still accepts strokes after the player has flagged themselves done', () => {
    // "I'm done" is a social ping, not a submit — the player keeps painting if they want,
    // and whatever is on the canvas at the deadline is what goes to VOTING. Guarding
    // submissions on `doneDrawing` would silently freeze their drawing at the flag.
    const h = harness([player('a')])
    handleSubmit(h.ctx, h.conn('conn-a'), submit([0, 0, 0, 0]))
    handleDrawDone(h.ctx, h.conn('conn-a'))
    handleSubmit(h.ctx, h.conn('conn-a'), submit([1, 1, 1, 1]))
    expect(h.state.submissions.get('a')).toEqual([1, 1, 1, 1])
    expect(h.state.players.get('a')!.doneDrawing).toBe(true)
  })

  it('broadcasts nothing — submission is silent', () => {
    // It fires on every stroke; broadcasting would flood the room.
    const h = harness([player('a'), player('b')])
    handleSubmit(h.ctx, h.conn('conn-a'), submit([0, 1, 1, 0]))
    expect(h.broadcasts).toEqual([])
    expect(h.sent).toEqual([])
  })
})
