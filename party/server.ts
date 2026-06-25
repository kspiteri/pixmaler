import type { Connection, ConnectionContext } from 'partyserver'
import type {
  ClientMsg,
  GmConfigureMsg,
  Phase,
  Player,
  ServerMsg,
  StateMsg,
  Submission,
  VoteCategory,
} from '../src/lib/types'
import { routePartykitRequest, Server } from 'partyserver'
import { VOTE_CATEGORIES } from '../src/lib/types'

// Bindings available on `this.env`. `PIXMALER_DEV=1` (local only, via .dev.vars)
// relaxes the lobby start gate so the whole flow can be tested solo.
interface Env {
  PIXMALER_DEV?: string
  // The Durable Object namespace bound in wrangler.jsonc — used by
  // routePartykitRequest in the Worker entry to address rooms.
  PixmalerServer: DurableObjectNamespace
}

// Votes are keyed by voter + category so each player gets one vote per
// category. `voteKey` builds the composite key; `categoryOf` reads it back.
function voteKey(clientId: string, category: VoteCategory): string {
  return `${clientId}:${category}`
}
function categoryOf(key: string): VoteCategory {
  return key.slice(key.lastIndexOf(':') + 1) as VoteCategory
}

interface RoomState {
  phase: Phase
  // Keyed by clientId throughout — conn.id tracked separately in connMap.
  players: Map<string, Player>
  // Maps conn.id → clientId for fast lookup in message/close handlers.
  connMap: Map<string, string>
  gmClientId: string
  // The player who first claimed GM. They reclaim the role on reconnect even
  // if someone else has been auto-promoted in their absence (per the plan).
  originalGmClientId: string
  config: GmConfigureMsg | null
  deadline: number | null
  submissions: Map<string, number[]> // clientId → grid
  votes: Map<string, string> // `${voterClientId}:${category}` → submissionId
  // Frozen gallery for the current VOTING round — filtered (blanks dropped) and
  // shuffled once at endDrawing so the order is stable across re-sends (rejoins).
  gallery: Submission[] | null
  drawTimer: ReturnType<typeof setTimeout> | null
}

// Ported from PartyKit to PartyServer (standard Durable Object, deployed via
// wrangler). State is in-memory: the DO stays warm while anyone is connected,
// so this behaves exactly as before. NOTE: not hibernation-safe — if we ever
// enable `static options = { hibernate: true }`, this state must be persisted
// to `this.ctx.storage` (reload in onStart) and the setTimeout draw timer
// replaced with a DO alarm. See docs/.plans/07-partyserver-port.md.
export class PixmalerServer extends Server<Env> {
  private state: RoomState = {
    phase: 'LOBBY',
    players: new Map(),
    connMap: new Map(),
    gmClientId: '',
    originalGmClientId: '',
    config: null,
    deadline: null,
    submissions: new Map(),
    votes: new Map(),
    gallery: null,
    drawTimer: null,
  }

  // ── HTTP existence check ───────────────────────────────────────────────────
  async onRequest(req: Request): Promise<Response> {
    if (req.method === 'GET') {
      const exists = [...this.state.players.values()].some(p => p.connected)
      return new Response(JSON.stringify({ exists }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('Method not allowed', { status: 405 })
  }

  // ── Connection lifecycle ───────────────────────────────────────────────────
  onConnect(_conn: Connection, _ctx: ConnectionContext) {
    // Don't send `state` here — the client hasn't told us who they are yet
    // (no `join` message processed), so the snapshot would be stale and could
    // cause the first joiner to render an empty-lobby with no GM controls.
    // `handleJoin` broadcasts a fresh state to everyone once the client has
    // identified itself.
  }

  onClose(conn: Connection) {
    const clientId = this.state.connMap.get(conn.id)
    this.state.connMap.delete(conn.id)
    if (!clientId)
      return
    const player = this.state.players.get(clientId)
    if (!player)
      return
    player.connected = false
    this.autoPromoteGm()
    this.broadcastAll(this.buildState())
  }

  // ── Message handler ────────────────────────────────────────────────────────
  onMessage(sender: Connection, raw: string) {
    let msg: ClientMsg
    try { msg = JSON.parse(raw) as ClientMsg }
    catch { return }

    switch (msg.type) {
      case 'join': return this.handleJoin(msg, sender)
      case 'rename': return this.handleRename(msg, sender)
      case 'gm:configure': return this.handleConfigure(msg, sender)
      case 'gm:start': return this.handleStart(sender)
      case 'gm:transfer': return this.handleTransfer(msg, sender)
      case 'draw:done': return this.handleDrawDone(sender)
      case 'draw:submit': return this.handleSubmit(msg, sender)
      case 'vote:cast': return this.handleVote(msg, sender)
      case 'gm:stopVoting': return this.handleStopVoting(sender)
      case 'gm:playAgain': return this.handlePlayAgain(sender)
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  private handleJoin(msg: Extract<ClientMsg, { type: 'join' }>, conn: Connection) {
    this.state.connMap.set(conn.id, msg.clientId)

    const existing = this.state.players.get(msg.clientId)
    if (existing) {
      existing.connected = true
      // The original GM reclaims the role on reconnect — even if an auto-promote
      // gave it to someone else while they were gone.
      if (msg.clientId === this.state.originalGmClientId) {
        this.state.gmClientId = msg.clientId
      }
    }
    else {
      const isFirst = this.state.players.size === 0
      const player: Player = {
        clientId: msg.clientId,
        name: msg.name,
        // Derived in buildState; per-player flag here is intentionally unused.
        isGm: false,
        connected: true,
        doneDrawing: false,
      }
      if (isFirst) {
        this.state.gmClientId = msg.clientId
        this.state.originalGmClientId = msg.clientId
      }
      this.state.players.set(msg.clientId, player)
    }

    // A player rejoining mid-VOTING needs the gallery to vote — it's only
    // broadcast once at endDrawing, so re-send the frozen copy to this client.
    if (this.state.phase === 'VOTING' && this.state.gallery && this.state.config) {
      const cfg = this.state.config
      conn.send(JSON.stringify({
        type: 'gallery',
        submissions: this.state.gallery,
        palette: cfg.palette,
        gridW: cfg.gridW,
        gridH: cfg.gridH,
      } satisfies ServerMsg))
    }

    this.broadcastAll(this.buildState())
  }

  private handleRename(msg: Extract<ClientMsg, { type: 'rename' }>, conn: Connection) {
    // Renaming is only meaningful before the game starts; names are revealed in
    // RESULTS, so locking them at LOBBY keeps the reveal honest.
    if (this.state.phase !== 'LOBBY')
      return
    const clientId = this.state.connMap.get(conn.id)
    if (!clientId)
      return
    const player = this.state.players.get(clientId)
    if (!player)
      return
    const name = msg.name.trim().slice(0, 24)
    if (!name)
      return
    player.name = name
    this.broadcastAll(this.buildState())
  }

  private handleConfigure(msg: Extract<ClientMsg, { type: 'gm:configure' }>, conn: Connection) {
    if (!this.isGm(conn))
      return
    if (this.state.phase !== 'LOBBY')
      return
    this.state.config = msg
    this.broadcastAll(this.buildState())
  }

  private handleTransfer(msg: Extract<ClientMsg, { type: 'gm:transfer' }>, conn: Connection) {
    if (!this.isGm(conn))
      return
    // LOBBY only — mid-game transfers complicate the FSM with no clear payoff.
    if (this.state.phase !== 'LOBBY') {
      conn.send(JSON.stringify({ type: 'error', message: 'GM transfer is only allowed in the lobby.' } satisfies ServerMsg))
      return
    }
    const target = this.state.players.get(msg.toClientId)
    if (!target || !target.connected) {
      conn.send(JSON.stringify({ type: 'error', message: 'Cannot transfer GM: target not present.' } satisfies ServerMsg))
      return
    }
    if (target.clientId === this.state.gmClientId)
      return // no-op
    // Rewrite both — the new GM is the "real" GM now and should reclaim on
    // disconnect, not the previous holder.
    this.state.gmClientId = target.clientId
    this.state.originalGmClientId = target.clientId
    this.broadcastAll(this.buildState())
  }

  private handleStart(conn: Connection) {
    if (!this.isGm(conn))
      return
    if (this.state.phase !== 'LOBBY')
      return
    if (!this.state.config)
      return

    // Require at least 2 non-GM connected players so there are meaningful
    // submissions — relaxed in local dev (PIXMALER_DEV) so the whole flow can
    // be tested solo across a couple of browsers. Never set in production.
    const devMode = this.env.PIXMALER_DEV === '1'
    const nonGmConnected = [...this.state.players.values()].filter(
      p => p.connected && p.clientId !== this.state.gmClientId,
    )
    if (!devMode && nonGmConnected.length < 2) {
      conn.send(JSON.stringify({ type: 'error', message: 'Need at least 2 players (plus GM) to start.' } satisfies ServerMsg))
      return
    }

    this.clearDrawTimer()
    const deadline = Date.now() + this.state.config.drawSeconds * 1000
    this.state.phase = 'DRAWING'
    this.state.deadline = deadline
    this.state.submissions.clear()
    this.state.votes.clear()
    this.state.gallery = null
    for (const p of this.state.players.values()) p.doneDrawing = false

    this.broadcastAll({ type: 'phase', phase: 'DRAWING', deadline } satisfies ServerMsg)
    this.state.drawTimer = setTimeout(() => this.endDrawing(), this.state.config.drawSeconds * 1000)
  }

  private handleDrawDone(conn: Connection) {
    const player = this.playerByConn(conn)
    if (!player || this.state.phase !== 'DRAWING')
      return
    player.doneDrawing = true
    this.broadcastDoneStatus()
  }

  private handleSubmit(msg: Extract<ClientMsg, { type: 'draw:submit' }>, conn: Connection) {
    const player = this.playerByConn(conn)
    if (!player || this.state.phase !== 'DRAWING')
      return
    // submissionId === clientId — the vote self-check in handleVote relies on this.
    // Note: we do NOT set `doneDrawing` here. Submission is automatic and
    // high-frequency now (debounced on every stroke); `doneDrawing` is a
    // social signal driven only by the player clicking "I'm done", which
    // sends a separate `draw:done` message.
    this.state.submissions.set(player.clientId, msg.grid)
  }

  private handleVote(msg: Extract<ClientMsg, { type: 'vote:cast' }>, conn: Connection) {
    const voter = this.playerByConn(conn)
    if (!voter || this.state.phase !== 'VOTING')
      return
    // Ignore unknown categories (protocol drift / tampering).
    if (!VOTE_CATEGORIES.some(c => c.id === msg.category))
      return
    // submissionId is the clientId of the submitter (see handleSubmit).
    if (msg.submissionId === voter.clientId) {
      conn.send(JSON.stringify({ type: 'error', message: 'Cannot vote for yourself.' } satisfies ServerMsg))
      return
    }
    // One vote per voter per category — `set` overwrites the previous pick in
    // that category, so voters can change their mind.
    this.state.votes.set(voteKey(voter.clientId, msg.category), msg.submissionId)

    // No auto-end: the GM decides when to stop (they watch the "X of Y voted"
    // tally). Re-broadcast state so that tally updates live for everyone.
    // Vote *targets* are never broadcast — only the progress count — so running
    // tallies can't sway later voters.
    this.broadcastAll(this.buildState())
  }

  private handleStopVoting(conn: Connection) {
    if (!this.isGm(conn))
      return
    if (this.state.phase !== 'VOTING')
      return
    this.endVoting()
  }

  private handlePlayAgain(conn: Connection) {
    if (!this.isGm(conn))
      return
    this.clearDrawTimer()
    this.state.phase = 'LOBBY'
    this.state.config = null
    this.state.deadline = null
    this.state.submissions.clear()
    this.state.votes.clear()
    this.state.gallery = null
    for (const p of this.state.players.values()) p.doneDrawing = false
    this.broadcastAll(this.buildState())
  }

  // ── Phase transitions ──────────────────────────────────────────────────────

  private endDrawing() {
    this.clearDrawTimer()
    if (this.state.phase !== 'DRAWING')
      return
    this.state.phase = 'VOTING'
    this.state.deadline = null
    const cfg = this.state.config!

    // Build the gallery once: drop blank submissions (a player who never drew
    // leaves an all-`-1` grid — nothing to vote on). Order is left as-is;
    // anonymising the display order is done per-client in Voting.vue. Frozen
    // for the round so rejoins and results read a consistent set.
    this.state.gallery = [...this.state.submissions.entries()]
      .filter(([, grid]) => grid.some(cell => cell !== -1))
      .map(([clientId, grid]): Submission => ({ submissionId: clientId, grid }))

    this.broadcastAll({
      type: 'gallery',
      submissions: this.state.gallery,
      palette: cfg.palette,
      gridW: cfg.gridW,
      gridH: cfg.gridH,
    } satisfies ServerMsg)
    this.broadcastAll({ type: 'phase', phase: 'VOTING', deadline: null } satisfies ServerMsg)
  }

  private endVoting() {
    if (this.state.phase !== 'VOTING')
      return
    this.state.phase = 'RESULTS'
    const cfg = this.state.config!

    // Tally per category from the frozen gallery (blanks already filtered out)
    // so a non-drawer can't appear in results. `votes` is keyed
    // "voterClientId:category"; we read the category back off each key.
    const gallery = this.state.gallery ?? []
    const breakdowns = new Map<string, Record<VoteCategory, number>>()
    for (const sub of gallery) {
      breakdowns.set(sub.submissionId, { funniest: 0, best: 0 })
    }
    for (const [key, subId] of this.state.votes.entries()) {
      const bd = breakdowns.get(subId)
      if (bd)
        bd[categoryOf(key)]++
    }

    const ranked = gallery
      .map((sub) => {
        const breakdown = breakdowns.get(sub.submissionId)!
        return {
          submissionId: sub.submissionId,
          clientId: sub.submissionId,
          name: this.state.players.get(sub.submissionId)?.name ?? 'Unknown',
          votes: breakdown.funniest + breakdown.best,
          breakdown,
          grid: sub.grid,
        }
      })
      .sort((a, b) => b.votes - a.votes)

    this.broadcastAll({ type: 'phase', phase: 'RESULTS', deadline: null } satisfies ServerMsg)
    this.broadcastAll({ type: 'results', ranked, palette: cfg.palette, gridW: cfg.gridW, gridH: cfg.gridH } satisfies ServerMsg)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private playerByConn(conn: Connection): Player | undefined {
    const clientId = this.state.connMap.get(conn.id)
    return clientId ? this.state.players.get(clientId) : undefined
  }

  private isGm(conn: Connection): boolean {
    const clientId = this.state.connMap.get(conn.id)
    return clientId === this.state.gmClientId
  }

  private autoPromoteGm() {
    const gm = this.state.players.get(this.state.gmClientId)
    if (gm?.connected)
      return
    const next = [...this.state.players.values()].find(p => p.connected)
    if (next) {
      this.state.gmClientId = next.clientId
      // originalGmClientId is intentionally NOT updated — if the original GM
      // returns later, they reclaim the role from this temporary holder.
    }
  }

  private clearDrawTimer() {
    if (this.state.drawTimer) {
      clearTimeout(this.state.drawTimer)
      this.state.drawTimer = null
    }
  }

  private buildState(): StateMsg {
    // Derive `isGm` from `gmClientId` at broadcast time so the flag can't
    // drift out of sync with the canonical role-holder.
    const players = [...this.state.players.values()].map(p => ({
      ...p,
      isGm: p.clientId === this.state.gmClientId,
    }))
    return {
      type: 'state',
      phase: this.state.phase,
      players,
      gmClientId: this.state.gmClientId,
      config: this.state.config,
      deadline: this.state.deadline,
      // `doneCount` reflects players who have flagged themselves as done via
      // the "I'm done" social ping. Submission is now automatic on every
      // stroke, so `submissions.size` no longer corresponds to "done".
      doneCount: [...this.state.players.values()].filter(p => p.doneDrawing).length,
      // Exclude GM — they don't submit a drawing.
      totalDrawing: [...this.state.players.values()].filter(
        p => p.connected && p.clientId !== this.state.gmClientId,
      ).length,
      ...this.votingProgress(),
    }
  }

  // VOTING progress: how many connected players have cast a vote in *every*
  // category (= finished voting), out of all present. Broadcast (not the
  // tallies) so the GM can decide when to stop.
  private votingProgress(): { votedCount: number, totalVoters: number } {
    const perVoter = new Map<string, number>()
    for (const key of this.state.votes.keys()) {
      const voterId = key.slice(0, key.lastIndexOf(':'))
      perVoter.set(voterId, (perVoter.get(voterId) ?? 0) + 1)
    }
    const present = [...this.state.players.values()].filter(p => p.connected)
    const votedCount = present.filter(
      p => (perVoter.get(p.clientId) ?? 0) >= VOTE_CATEGORIES.length,
    ).length
    return { votedCount, totalVoters: present.length }
  }

  private broadcastAll(msg: ServerMsg) {
    this.broadcast(JSON.stringify(msg))
  }

  private broadcastDoneStatus() {
    this.broadcastAll({
      type: 'done-status',
      doneCount: [...this.state.players.values()].filter(p => p.doneDrawing).length,
      totalDrawing: [...this.state.players.values()].filter(
        p => p.connected && p.clientId !== this.state.gmClientId,
      ).length,
    })
  }
}

// ── Worker entry ───────────────────────────────────────────────────────────
// Routes /parties/:server/:room WebSocket + HTTP requests to the Durable
// Object. `routePartykitRequest` kebab-cases the binding class name, so
// PixmalerServer is reachable as the party name "pixmaler-server" (see the
// client's PartySocket `party` option in src/App.vue).
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routePartykitRequest(request, env))
      || new Response('Not Found', { status: 404 })
    )
  },
}
