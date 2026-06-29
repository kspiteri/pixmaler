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
  // Comma-separated list of web origins allowed to open a connection (prod).
  // Public config, not a secret — it's just the frontend's URL. Defaults to the
  // GitHub Pages origin if unset. See guardOrigin + docs/.plans/09-server-hardening.md.
  ALLOWED_ORIGINS?: string
  // Room-lifecycle windows (ms, strings — vars come through as strings). See
  // docs/.plans/10-room-lifecycle.md. Configurable via wrangler.jsonc vars or the
  // dashboard so they're tunable/testable without a code change.
  IDLE_MS?: string // wipe a room after this long with no messages (default 45 min)
  EMPTY_GRACE_MS?: string // wipe this long after the last connection closes (default 60 s)
  // The Durable Object namespace bound in wrangler.jsonc — used by
  // routePartykitRequest in the Worker entry to address rooms.
  PixmalerServer: DurableObjectNamespace
}

// Lifecycle window defaults (ms) if the env vars are unset/unparseable.
const DEFAULT_IDLE_MS = 45 * 60 * 1000 // 45 min of no activity → wipe
const DEFAULT_EMPTY_GRACE_MS = 60 * 1000 // 60 s after last tab closes → wipe

function parseMs(value: string | undefined, fallback: number): number {
  const n = value ? Number.parseInt(value, 10) : Number.NaN
  return Number.isFinite(n) && n > 0 ? n : fallback
}

// Origin allowlist for incoming connections / requests. This is CSWSH / casual-
// abuse hygiene — NOT authentication (a non-browser client can forge or omit
// `Origin`). Browsers can't forge it, so it blocks other websites and stray
// frontends. See docs/.plans/09-server-hardening.md.
//
// In dev (PIXMALER_DEV) everything is allowed so `wr:dev` + local smoke-tests
// work. In prod we require `Origin` to match the allowlist (a missing Origin is
// rejected). Returns a 403 Response to block, or undefined to allow.
const DEFAULT_ALLOWED_ORIGIN = 'https://kspiteri.github.io'

function guardOrigin(req: Request, env: Env): Response | undefined {
  if (env.PIXMALER_DEV === '1')
    return undefined // dev bypass — localhost + header-less smoke-tests

  const origin = req.headers.get('Origin')
  const allowed = (env.ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGIN)
    .split(',')
    .map(o => o.trim())
    .filter(Boolean)

  if (origin && allowed.includes(origin))
    return undefined // allowed

  return new Response('Forbidden origin', { status: 403 })
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
}

// Ported from PartyKit to PartyServer (standard Durable Object, deployed via
// wrangler). State is in-memory: the DO stays warm while anyone is connected.
// Room lifecycle (idle / empty-room cleanup) + the draw-round deadline are
// driven by a single DO **alarm** (see armAlarm/onAlarm) rather than setTimeout,
// so the round still ends and stale rooms still get wiped even across an
// eviction. NOTE: full state persistence (Tier 2) is still deferred — if a DO is
// evicted mid-game its in-memory state is lost; that's acceptable (idle/empty
// rooms are what get evicted, and those are what we wipe anyway). See
// docs/.plans/10-room-lifecycle.md + 07-partyserver-port.md.
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
  }

  // Lifecycle bookkeeping (not part of RoomState — it's wipe target). Timestamps
  // in ms epoch; null when not applicable.
  private lastActivityAt = Date.now()
  private emptySince: number | null = null

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
    // When the last live connection drops, start the empty-room grace clock.
    // connMap is the authoritative live-connection count (the closing conn is
    // already deleted above).
    if (this.state.connMap.size === 0)
      this.emptySince = Date.now()
    if (!clientId) {
      this.armAlarm()
      return
    }
    const player = this.state.players.get(clientId)
    if (!player) {
      this.armAlarm()
      return
    }
    player.connected = false
    this.autoPromoteGm()
    this.broadcastAll(this.buildState())
    this.armAlarm()
  }

  // ── Message handler ────────────────────────────────────────────────────────
  onMessage(sender: Connection, raw: string) {
    let msg: ClientMsg
    try { msg = JSON.parse(raw) as ClientMsg }
    catch { return }

    // Any message counts as activity — pushes back the idle-wipe deadline.
    this.lastActivityAt = Date.now()

    switch (msg.type) {
      case 'join': this.handleJoin(msg, sender); break
      case 'rename': this.handleRename(msg, sender); break
      case 'gm:configure': this.handleConfigure(msg, sender); break
      case 'gm:start': this.handleStart(sender); break
      case 'gm:transfer': this.handleTransfer(msg, sender); break
      case 'draw:done': this.handleDrawDone(sender); break
      case 'draw:submit': this.handleSubmit(msg, sender); break
      case 'vote:cast': this.handleVote(msg, sender); break
      case 'gm:stopVoting': this.handleStopVoting(sender); break
      case 'gm:playAgain': this.handlePlayAgain(sender); break
    }

    // Re-arm the lifecycle alarm after every message: the activity stamp moved,
    // and a phase change (start/stop) may have changed the draw deadline.
    this.armAlarm()
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  private handleJoin(msg: Extract<ClientMsg, { type: 'join' }>, conn: Connection) {
    // Someone's here — cancel any pending empty-room wipe.
    this.emptySince = null
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

      // Echo back this voter's OWN picks so the client rehydrates its vote UI
      // after a reconnect. Only their votes — never others' (tallies stay
      // hidden until RESULTS).
      const own: Partial<Record<VoteCategory, string>> = {}
      for (const [key, subId] of this.state.votes.entries()) {
        const voterId = key.slice(0, key.lastIndexOf(':'))
        if (voterId === msg.clientId)
          own[categoryOf(key)] = subId
      }
      conn.send(JSON.stringify({ type: 'vote-state', votes: own } satisfies ServerMsg))
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

    const deadline = Date.now() + this.state.config.drawSeconds * 1000
    this.state.phase = 'DRAWING'
    this.state.deadline = deadline
    this.state.submissions.clear()
    this.state.votes.clear()
    this.state.gallery = null
    for (const p of this.state.players.values()) p.doneDrawing = false

    this.broadcastAll({ type: 'phase', phase: 'DRAWING', deadline } satisfies ServerMsg)
    // Round-end fires from the DO alarm at `deadline` (armed by onMessage after
    // this handler) — survives eviction where a setTimeout would not.
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

  // ── Room lifecycle (DO alarm) ────────────────────────────────────────────
  // A single alarm drives three deadlines (one alarm slot per DO): the draw
  // round end, the empty-room grace wipe, and the idle wipe. armAlarm() picks
  // the soonest; onAlarm() figures out which fired and acts, then re-arms.

  private get idleMs(): number {
    return parseMs(this.env.IDLE_MS, DEFAULT_IDLE_MS)
  }

  private get emptyGraceMs(): number {
    return parseMs(this.env.EMPTY_GRACE_MS, DEFAULT_EMPTY_GRACE_MS)
  }

  // Soonest deadline we care about, or null if nothing is pending.
  private nextWake(): number | null {
    const candidates: number[] = [this.lastActivityAt + this.idleMs]
    if (this.state.phase === 'DRAWING' && this.state.deadline !== null)
      candidates.push(this.state.deadline)
    if (this.emptySince !== null)
      candidates.push(this.emptySince + this.emptyGraceMs)
    return candidates.length ? Math.min(...candidates) : null
  }

  // (Re)arm the DO alarm to the soonest pending deadline. Fire-and-forget: the
  // storage write is awaited internally; errors are logged, not propagated (the
  // DO keeps running and the next event re-arms).
  //
  // Coalesced: the idle deadline slides forward on every message, so naively
  // re-arming per message thrashes the single alarm slot (a storage write +
  // a "alarm canceled with requestScheduledAlarm" runtime log each time). We
  // skip the write unless the target moved by more than ARM_TOLERANCE_MS, which
  // is harmless for minute-scale windows.
  private armedFor: number | null = null
  private static readonly ARM_TOLERANCE_MS = 5000

  private armAlarm(): void {
    const when = this.nextWake()
    if (when === null)
      return
    if (this.armedFor !== null && Math.abs(when - this.armedFor) < PixmalerServer.ARM_TOLERANCE_MS)
      return
    this.armedFor = when
    this.ctx.storage.setAlarm(when).catch(err =>
      console.error('[pixmaler] setAlarm failed', err),
    )
  }

  // Fired by the runtime when the alarm is due. Idempotent (alarms auto-retry):
  // each branch re-checks its condition before acting.
  async onAlarm(): Promise<void> {
    const now = Date.now()
    // The alarm slot just fired and is now empty — forget what we armed for so
    // the next armAlarm() definitely writes (rather than coalescing against a
    // stale value).
    this.armedFor = null

    // 1) Draw round ended.
    if (this.state.phase === 'DRAWING' && this.state.deadline !== null && now >= this.state.deadline) {
      this.endDrawing()
      this.armAlarm()
      return
    }

    // 2) Room empty past the grace window → wipe so the code reuses clean.
    if (this.emptySince !== null && this.state.connMap.size === 0 && now >= this.emptySince + this.emptyGraceMs) {
      this.wipeState()
      return
    }

    // 3) No activity for the idle window → wipe.
    if (now >= this.lastActivityAt + this.idleMs) {
      this.wipeState()
      return
    }

    // Woke early (deadlines moved) — just re-arm for whatever's next.
    this.armAlarm()
  }

  // Reset the room to a pristine LOBBY (as if the code were never used) and
  // cancel any pending alarm. Used by both wipe paths.
  private wipeState(): void {
    this.state = {
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
    }
    this.emptySince = null
    this.lastActivityAt = Date.now()
    this.armedFor = null
    this.ctx.storage.deleteAlarm().catch(err =>
      console.error('[pixmaler] deleteAlarm failed', err),
    )
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
//
// onBeforeConnect guards WebSocket upgrades; onBeforeRequest guards plain HTTP
// (the room existence check). Both run the same origin allowlist so neither
// door is left open. Returning a Response short-circuits with that status.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (
      (await routePartykitRequest(request, env, {
        onBeforeConnect: req => guardOrigin(req, env),
        onBeforeRequest: req => guardOrigin(req, env),
      }))
      || new Response('Not Found', { status: 404 })
    )
  },
}
