// A reusable driver for the room's full loop — LOBBY -> DRAWING -> VOTING -> RESULTS — built on
// the fake `RoomCtx` harness. `playFullRound` walks the canonical round; the step functions
// beside it (`configure`/`start`/`submit`/`done`/`voteBoth`) let a suite fast-forward to any
// phase or drive a bespoke path. Time is injected (no real timers), so every transition is
// forced through the all-done / GM-stops paths a real deadline would otherwise take.

import type { GmConfigureMsg, Phase, RankedResult } from '../../src/lib/protocol/types'
import type { Harness } from './room'
import { handleDrawDone, handleSubmit } from '../../party/drawing'
import { handleConfigure } from '../../party/gm'
import { endDrawing, endVoting, handleStart } from '../../party/phases'
import { handleStopVoting, handleVote } from '../../party/voting'
import { VOTE_CATEGORIES } from '../../src/lib/protocol/types'

// The same 2x2 target the handler suites use — a real palette and grid, so the contextual
// `draw:submit` check (length + index range) passes.
export const testConfig: GmConfigureMsg = {
  type: 'gm:configure',
  gridW: 2,
  gridH: 2,
  palette: ['#000000', '#ffffff'],
  targetGrid: [0, 1, 1, 0],
  drawSeconds: 60,
  musicTrack: null,
}

// A painted grid (counts for the gallery) and a wiped one (in the gallery, but un-votable).
export const PAINTED = [0, 1, 1, 0]
export const BLANK = [-1, -1, -1, -1]

const connFor = (h: Harness, clientId: string) => h.conn(`conn-${clientId}`)

// The opaque gallery id minted for a drawer this round, or undefined if they aren't in it.
export function submissionIdOf(h: Harness, clientId: string): string | undefined {
  for (const [subId, owner] of h.state.submissionOwners) {
    if (owner === clientId)
      return subId
  }
  return undefined
}

export function configure(h: Harness, gm = 'gm', config: GmConfigureMsg = testConfig): void {
  handleConfigure(h.ctx, connFor(h, gm), config)
}

export function start(h: Harness, gm = 'gm'): void {
  handleStart(h.ctx, connFor(h, gm))
}

// Submit a grid on behalf of a player. Painted by default; pass BLANK to auto-submit an empty
// canvas (the deadline case) or to wipe one already painted.
export function submit(h: Harness, clientId: string, grid: number[] = PAINTED): void {
  handleSubmit(h.ctx, connFor(h, clientId), { type: 'draw:submit', grid })
}

export function done(h: Harness, clientId: string): void {
  handleDrawDone(h.ctx, connFor(h, clientId))
}

// Cast both categories for `voter` at `submissionId` (a target it does not own).
export function voteBoth(h: Harness, voter: string, submissionId: string): void {
  for (const c of VOTE_CATEGORIES)
    handleVote(h.ctx, connFor(h, voter), { type: 'vote:cast', category: c.id, submissionId })
}

export interface FullRoundOpts {
  gm?: string
  config?: GmConfigureMsg
  // Paint a real grid and click Done; these become the gallery. Defaults to every connected
  // player (the GM draws too).
  drawers?: string[]
  // Cast both categories. Defaults to the drawers.
  voters?: string[]
  // The clientId everyone rallies behind, for a clear winner. Defaults to the first drawer.
  winner?: string
  // How VOTING ends: the GM pressing stop (default) or the absent-GM backstop firing.
  endVotingBy?: 'gm' | 'backstop'
  // Stop once this phase is reached, to fast-forward a suite. Defaults to RESULTS.
  stopAfter?: Phase
}

// Walk a canonical round from LOBBY. Assumes the players are already seated and `gm` holds GM.
export function playFullRound(h: Harness, opts: FullRoundOpts = {}): RankedResult[] | null {
  const gm = opts.gm ?? 'gm'
  const connected = [...h.state.players.values()].filter(p => p.connected).map(p => p.clientId)
  const drawers = opts.drawers ?? connected

  configure(h, gm, opts.config ?? testConfig)
  start(h, gm)
  if (opts.stopAfter === 'DRAWING')
    return h.state.ranked

  for (const id of drawers) {
    submit(h, id)
    done(h, id)
  }
  endDrawing(h.ctx)
  if (opts.stopAfter === 'VOTING')
    return h.state.ranked

  const voters = opts.voters ?? drawers
  const winner = opts.winner ?? drawers[0]
  for (const v of voters) {
    // Everyone rallies behind `winner`; the winner votes for the next drawer instead, so no
    // one self-votes (the server rejects it) yet the winner still casts a valid ballot.
    const target = v === winner ? drawers.find(d => d !== v) : winner
    const subId = target ? submissionIdOf(h, target) : undefined
    if (subId)
      voteBoth(h, v, subId)
  }

  if (opts.endVotingBy === 'backstop')
    endVoting(h.ctx)
  else
    handleStopVoting(h.ctx, connFor(h, gm))
  return h.state.ranked
}
