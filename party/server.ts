import type * as Party from 'partykit/server'
import type {
  ClientMsg,
  GmConfigureMsg,
  Phase,
  Player,
  ServerMsg,
  StateMsg,
} from '../src/lib/types'

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
  votes: Map<string, string> // voterClientId → submissionId (= clientId of submitter)
  drawTimer: ReturnType<typeof setTimeout> | null
}

export default class PixmalerServer implements Party.Server {
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
    drawTimer: null,
  }

  constructor(readonly room: Party.Room) {}

  // ── HTTP existence check ───────────────────────────────────────────────────
  async onRequest(req: Party.Request): Promise<Response> {
    if (req.method === 'GET') {
      const exists = [...this.state.players.values()].some(p => p.connected)
      return new Response(JSON.stringify({ exists }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('Method not allowed', { status: 405 })
  }

  // ── Connection lifecycle ───────────────────────────────────────────────────
  onConnect(_conn: Party.Connection) {
    // Don't send `state` here — the client hasn't told us who they are yet
    // (no `join` message processed), so the snapshot would be stale and could
    // cause the first joiner to render an empty-lobby with no GM controls.
    // `handleJoin` broadcasts a fresh state to everyone once the client has
    // identified itself.
  }

  onClose(conn: Party.Connection) {
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
  onMessage(raw: string, sender: Party.Connection) {
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

  private handleJoin(msg: Extract<ClientMsg, { type: 'join' }>, conn: Party.Connection) {
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
    this.broadcastAll(this.buildState())
  }

  private handleRename(msg: Extract<ClientMsg, { type: 'rename' }>, conn: Party.Connection) {
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

  private handleConfigure(msg: Extract<ClientMsg, { type: 'gm:configure' }>, conn: Party.Connection) {
    if (!this.isGm(conn))
      return
    if (this.state.phase !== 'LOBBY')
      return
    this.state.config = msg
    this.broadcastAll(this.buildState())
  }

  private handleTransfer(msg: Extract<ClientMsg, { type: 'gm:transfer' }>, conn: Party.Connection) {
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

  private handleStart(conn: Party.Connection) {
    if (!this.isGm(conn))
      return
    if (this.state.phase !== 'LOBBY')
      return
    if (!this.state.config)
      return

    // Require at least 2 non-GM connected players so there are meaningful
    // submissions — relaxed in local dev (PIXMALER_DEV) so the whole flow can
    // be tested solo across a couple of browsers. Never set in production.
    const devMode = this.room.env.PIXMALER_DEV === '1'
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
    for (const p of this.state.players.values()) p.doneDrawing = false

    this.broadcastAll({ type: 'phase', phase: 'DRAWING', deadline } satisfies ServerMsg)
    this.state.drawTimer = setTimeout(() => this.endDrawing(), this.state.config.drawSeconds * 1000)
  }

  private handleDrawDone(conn: Party.Connection) {
    const player = this.playerByConn(conn)
    if (!player || this.state.phase !== 'DRAWING')
      return
    player.doneDrawing = true
    this.broadcastDoneStatus()
  }

  private handleSubmit(msg: Extract<ClientMsg, { type: 'draw:submit' }>, conn: Party.Connection) {
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

  private handleVote(msg: Extract<ClientMsg, { type: 'vote:cast' }>, conn: Party.Connection) {
    const voter = this.playerByConn(conn)
    if (!voter || this.state.phase !== 'VOTING')
      return
    // submissionId is the clientId of the submitter (see handleSubmit).
    if (msg.submissionId === voter.clientId) {
      conn.send(JSON.stringify({ type: 'error', message: 'Cannot vote for yourself.' } satisfies ServerMsg))
      return
    }
    // Voters can change their mind — `set` overwrites any previous vote.
    // The auto-end check still uses `votes.size`, which counts each voter once.
    this.state.votes.set(voter.clientId, msg.submissionId)

    const connectedCount = [...this.state.players.values()].filter(p => p.connected).length
    if (this.state.votes.size >= connectedCount)
      this.endVoting()
  }

  private handleStopVoting(conn: Party.Connection) {
    if (!this.isGm(conn))
      return
    if (this.state.phase !== 'VOTING')
      return
    this.endVoting()
  }

  private handlePlayAgain(conn: Party.Connection) {
    if (!this.isGm(conn))
      return
    this.clearDrawTimer()
    this.state.phase = 'LOBBY'
    this.state.config = null
    this.state.deadline = null
    this.state.submissions.clear()
    this.state.votes.clear()
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

    this.broadcastAll({
      type: 'gallery',
      submissions: [...this.state.submissions.entries()].map(([clientId, grid]) => ({
        submissionId: clientId,
        grid,
      })),
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

    const tally = new Map<string, number>()
    for (const clientId of this.state.submissions.keys()) tally.set(clientId, 0)
    for (const subId of this.state.votes.values()) tally.set(subId, (tally.get(subId) ?? 0) + 1)

    const ranked = [...this.state.submissions.entries()]
      .map(([clientId, grid]) => ({
        submissionId: clientId,
        clientId,
        name: this.state.players.get(clientId)?.name ?? 'Unknown',
        votes: tally.get(clientId) ?? 0,
        grid,
      }))
      .sort((a, b) => b.votes - a.votes)

    this.broadcastAll({ type: 'phase', phase: 'RESULTS', deadline: null } satisfies ServerMsg)
    this.broadcastAll({ type: 'results', ranked, palette: cfg.palette, gridW: cfg.gridW, gridH: cfg.gridH } satisfies ServerMsg)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private playerByConn(conn: Party.Connection): Player | undefined {
    const clientId = this.state.connMap.get(conn.id)
    return clientId ? this.state.players.get(clientId) : undefined
  }

  private isGm(conn: Party.Connection): boolean {
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
    }
  }

  private broadcastAll(msg: ServerMsg) {
    this.room.broadcast(JSON.stringify(msg))
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
