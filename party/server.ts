import type { Connection, ConnectionContext } from 'partyserver'
import type {
  ClientMsg,
  GmConfigureMsg,
  Phase,
  Player,
  RankedResult,
  ServerMsg,
  StateMsg,
  Submission,
  VoteCategory,
} from '../src/lib/types'
import { routePartykitRequest, Server } from 'partyserver'
import { normaliseShape, parseClientMsg, VOTE_CATEGORIES } from '../src/lib/types'
import { wordPair } from '../src/lib/words'
import { categoryOf, NAME_MAX_LEN, tallyVotes, uniqueName, voteKey, voterOf } from './tally'

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
  VOTING_MS?: string // resolve a stalled VOTING phase after this long (default 5 min)
  // The Durable Object namespace bound in wrangler.jsonc — used by
  // routePartykitRequest in the Worker entry to address rooms.
  PixmalerServer: DurableObjectNamespace
}

// Lifecycle window defaults (ms) if the env vars are unset/unparseable.
const DEFAULT_IDLE_MS = 45 * 60 * 1000 // 45 min of no activity → wipe
const DEFAULT_EMPTY_GRACE_MS = 60 * 1000 // 60 s after last tab closes → wipe
// A backstop, not a game mechanic. VOTING is GM-ended; this exists only so an
// absent GM can't lose the round to the idle wipe — which destroys it — instead of
// resolving it. Deliberately generous: nobody in a real game should ever meet it.
const DEFAULT_VOTING_MS = 5 * 60 * 1000

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

// GM "+15s" during DRAWING. Capped server-side — a client-side cap is decoration.
const EXTEND_STEP_MS = 15_000
const MAX_EXTENSIONS = 2

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
  // Grows with each "+15s"; reset at handleStart. Separate from
  // `config.drawSeconds`, which stays the configured start so the lobby setting
  // isn't rewritten by a mid-round extension.
  roundSeconds: number
  extensions: number
  submissions: Map<string, number[]> // clientId → grid
  votes: Map<string, string> // `${voterClientId}:${category}` → submissionId
  // Frozen gallery for the current VOTING round — filtered (blanks dropped) and
  // shuffled once at endDrawing so the order is stable across re-sends (rejoins).
  gallery: Submission[] | null
  // The computed ranking, retained from `endVoting` so a client that joins or
  // reloads during RESULTS can be sent the reveal it missed. `results` is
  // otherwise broadcast exactly once, and without this a rejoining client sits
  // on "counting the damage…" forever — and a rejoining GM loses their only way
  // to restart the room. Cleared on every path back out of RESULTS.
  ranked: RankedResult[] | null
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
    roundSeconds: 0,
    extensions: 0,
    submissions: new Map(),
    votes: new Map(),
    gallery: null,
    ranked: null,
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
    // Structural validation up front, so no handler can be reached by a payload
    // of the wrong shape. This used to be `JSON.parse(raw) as ClientMsg`, which
    // checked nothing at runtime — see `parseClientMsg` for what that cost.
    const msg = parseClientMsg(raw)
    if (msg === null)
      return

    // Any message counts as activity — pushes back the idle-wipe deadline.
    // Deliberately after validation: a malformed frame must not keep a room alive.
    this.lastActivityAt = Date.now()

    switch (msg.type) {
      case 'join': this.handleJoin(msg, sender); break
      case 'rename': this.handleRename(msg, sender); break
      case 'shape': this.handleShape(msg, sender); break
      case 'gm:configure': this.handleConfigure(msg, sender); break
      case 'gm:start': this.handleStart(sender); break
      case 'gm:transfer': this.handleTransfer(msg, sender); break
      case 'draw:done': this.handleDrawDone(sender); break
      case 'draw:submit': this.handleSubmit(msg, sender); break
      case 'vote:cast': this.handleVote(msg, sender); break
      case 'gm:stopVoting': this.handleStopVoting(sender); break
      case 'gm:extendTime': this.handleExtendTime(sender); break
      case 'gm:playAgain': this.handlePlayAgain(sender); break
      case 'gm:cancelRound': this.handleCancelRound(sender); break
      case 'gm:endSession': this.handleEndSession(sender); break
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
      // The client's localStorage is the source of truth for its own shape, but
      // **only the lobby may apply it.** Past LOBBY the shape is locked exactly
      // like `name`, which this branch deliberately does not re-apply either —
      // and without this guard the lock had only one of its two halves:
      // `handleShape` refuses mid-game messages, but a plain reconnect walked
      // straight past it, because `storedShape()` is re-read on every socket
      // `open`. Two tabs and a reload were enough to repaint a RESULTS chip
      // mid-reveal, and a phone waking a suspended tab did it unprompted.
      //
      // Skipping the assignment (rather than defaulting) also stops a reconnect
      // that carries no shape — an older bundle, or localStorage evicted by the
      // browser — from silently resetting a chosen shape to `rounded` mid-game.
      if (this.state.phase === 'LOBBY')
        existing.shape = normaliseShape(msg.shape)
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
        // Normalised and de-duplicated here, in the NEW-player branch only — the
        // reconnect branch above deliberately never re-applies `msg.name`, which is
        // what keeps a returning player from being suffixed against themselves.
        // An empty name falls back to a random pair, matching what the client's
        // name gate offers rather than storing "" and rendering a '?' chip.
        name: uniqueName(
          msg.name.trim().slice(0, NAME_MAX_LEN) || wordPair(),
          msg.clientId,
          this.state.players.values(),
        ),
        // Derived in buildState; per-player flag here is intentionally unused.
        isGm: false,
        connected: true,
        doneDrawing: false,
        // Sticky per-round participation. A mid-round joiner is a spectator, so
        // this stays false for them either way.
        drewThisRound: false,
        // A round already in flight means they missed it. Only reachable here, in
        // the new-player branch, so a reconnect never changes what someone is.
        spectating: this.state.phase !== 'LOBBY',
        shape: normaliseShape(msg.shape),
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
        if (voterOf(key) === msg.clientId)
          own[categoryOf(key)] = subId
      }
      conn.send(JSON.stringify({ type: 'vote-state', votes: own } satisfies ServerMsg))
    }

    // A player rejoining mid-DRAWING gets their own latest auto-submitted grid
    // back, so a page reload restores the drawing instead of a blank canvas.
    // Targeted at this connection only — never broadcast.
    if (this.state.phase === 'DRAWING') {
      const own = this.state.submissions.get(msg.clientId)
      if (own)
        conn.send(JSON.stringify({ type: 'draw-state', grid: own } satisfies ServerMsg))
    }

    // A client joining or reloading mid-RESULTS gets the reveal re-sent. Unlike
    // `gallery`, `results` is broadcast exactly once (endVoting), so without this
    // a rejoining client is stuck on "counting the damage…" indefinitely — and a
    // rejoining GM has no usable control at all, leaving the room unrestartable.
    // Replayed from the retained ranking rather than recomputed, so there is one
    // source of truth and no chance of two rankings disagreeing.
    if (this.state.phase === 'RESULTS' && this.state.ranked && this.state.config) {
      const cfg = this.state.config
      conn.send(JSON.stringify({
        type: 'results',
        ranked: this.state.ranked,
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
    const name = msg.name.trim().slice(0, NAME_MAX_LEN)
    if (!name)
      return
    player.name = uniqueName(name, clientId, this.state.players.values())
    this.broadcastAll(this.buildState())
  }

  private handleShape(msg: Extract<ClientMsg, { type: 'shape' }>, conn: Connection) {
    // LOBBY-only for the same reason as `rename`: the chip is shown in RESULTS,
    // so a shape change after the drawings are in would rewrite identity after
    // the fact. The picker only exists in the lobby UI; this is the enforcement.
    if (this.state.phase !== 'LOBBY')
      return
    const clientId = this.state.connMap.get(conn.id)
    if (!clientId)
      return
    const player = this.state.players.get(clientId)
    if (!player)
      return
    player.shape = normaliseShape(msg.shape)
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
    this.state.roundSeconds = this.state.config.drawSeconds
    this.state.extensions = 0
    this.state.submissions.clear()
    this.state.votes.clear()
    this.state.gallery = null
    this.state.ranked = null
    // Cleared together, deliberately: a new round makes everyone a competitor again
    // with nothing drawn yet, and keeping all three resets on one line is what stops
    // them drifting apart.
    for (const p of this.state.players.values()) { p.doneDrawing = false; p.spectating = false; p.drewThisRound = false }

    this.broadcastAll({ type: 'phase', phase: 'DRAWING', deadline } satisfies ServerMsg)
    // Round-end fires from the DO alarm at `deadline` (armed by onMessage after
    // this handler) — survives eviction where a setTimeout would not.
  }

  private handleDrawDone(conn: Connection) {
    const player = this.playerByConn(conn)
    // A spectator has no canvas, so a `draw:done` from one is drift or tampering.
    if (!player || player.spectating || this.state.phase !== 'DRAWING')
      return
    player.doneDrawing = true
    this.broadcastDoneStatus()
  }

  private handleSubmit(msg: Extract<ClientMsg, { type: 'draw:submit' }>, conn: Connection) {
    const player = this.playerByConn(conn)
    // Same as `draw:done`: a spectator sits the round out, so their grid must never
    // reach `submissions` — otherwise they'd appear in the gallery and be votable.
    if (!player || player.spectating || this.state.phase !== 'DRAWING')
      return

    // Contextual half of the payload check. `parseClientMsg` proved this is an
    // integer array inside the hard cap, but only the room knows the round's
    // dimensions and palette — and this grid is broadcast verbatim to everyone in
    // the `gallery` message, so a wrong length or an out-of-range index would
    // reach every other player's renderer.
    const cfg = this.state.config
    if (!cfg || msg.grid.length !== cfg.gridW * cfg.gridH)
      return
    // -1 is "unpainted", which is why this floor is -1 and not 0 — unlike
    // `targetGrid`, a player's grid legitimately has holes.
    if (msg.grid.some(cell => cell < -1 || cell >= cfg.palette.length))
      return

    // submissionId === clientId — the vote self-check in handleVote relies on this.
    // Note: we do NOT set `doneDrawing` here. Submission is automatic and
    // high-frequency now (debounced on every stroke); `doneDrawing` is a
    // social signal driven only by the player clicking "I'm done", which
    // sends a separate `draw:done` message.
    this.state.submissions.set(player.clientId, msg.grid)

    // Sticky, and only ever set — never cleared here. Clearing the canvas sends an
    // all-`-1` grid through this same path, so unsetting on a blank submission would
    // reintroduce the bug: the player would drop out of the gallery for having wiped
    // work they did do. The only reset is at round start.
    if (!player.drewThisRound && msg.grid.some(cell => cell !== -1))
      player.drewThisRound = true
  }

  private handleVote(msg: Extract<ClientMsg, { type: 'vote:cast' }>, conn: Connection) {
    const voter = this.playerByConn(conn)
    // A spectator watches this round's reveal but does not judge it. Also keeps the
    // voting denominator honest: they were never counted, so they cannot be waited on.
    if (!voter || voter.spectating || this.state.phase !== 'VOTING')
      return
    // Ignore unknown categories (protocol drift / tampering).
    if (!VOTE_CATEGORIES.some(c => c.id === msg.category))
      return
    // submissionId is the clientId of the submitter (see handleSubmit).
    if (msg.submissionId === voter.clientId) {
      conn.send(JSON.stringify({ type: 'error', message: 'Cannot vote for yourself.' } satisfies ServerMsg))
      return
    }
    // The target must be in this round's frozen gallery. Without this a crafted or
    // stale client could vote for any string: `endVoting`'s tally silently skips an
    // id it doesn't recognise (the `if (bd)` guard), but `votingProgress` counts
    // *keys*, so two junk casts made the sender count as fully voted — enough to
    // force `allVoted` and suppress the GM's End-voting confirm without voting for
    // anyone. Ignored rather than answered with `error`, matching the unknown-category
    // guard above: both are tamper-or-drift paths, and neither is reachable from the
    // UI, which only renders a button per gallery card.
    if (!this.state.gallery?.some(s => s.submissionId === msg.submissionId))
      return
    // A wiped canvas is shown on the reveal but is not a candidate — it carries no
    // drawing to judge. The gallery now includes it (see `endDrawing`), so this is
    // the guard that keeps it out of the tally. Ignored rather than answered,
    // matching the two guards above: the UI renders no vote control on a blank card,
    // so reaching here means drift or tampering.
    if (this.state.gallery.find(s => s.submissionId === msg.submissionId)?.grid.every(cell => cell === -1))
      return
    // One vote per voter per category — `set` overwrites the previous pick in
    // that category, so voters can change their mind.
    this.state.votes.set(voteKey(voter.clientId, msg.category), msg.submissionId)

    // No auto-end: the GM decides when to stop (they watch the "X of Y voted"
    // tally). Re-broadcast state so that tally updates live for everyone.
    // Vote *targets* are never broadcast — only the progress count — so running
    // tallies can't sway later voters.
    this.broadcastAll(this.buildState())
  }

  // Add EXTEND_STEP_MS to the running round. No alarm work needed: `onMessage`
  // re-arms after every message and `armAlarm` reads `state.deadline`.
  private handleExtendTime(conn: Connection) {
    if (!this.isGm(conn))
      return
    if (this.state.phase !== 'DRAWING' || this.state.deadline === null)
      return
    // The alarm may already be firing for this deadline — don't resurrect a round
    // whose submissions are being collected.
    if (Date.now() >= this.state.deadline)
      return
    if (this.state.extensions >= MAX_EXTENSIONS)
      return
    this.state.extensions++
    this.state.deadline += EXTEND_STEP_MS
    this.state.roundSeconds += EXTEND_STEP_MS / 1000
    this.broadcastAll(this.buildState())
  }

  private handleStopVoting(conn: Connection) {
    if (!this.isGm(conn))
      return
    if (this.state.phase !== 'VOTING')
      return
    this.endVoting()
  }

  // The teardown shared by "Play again" and "Cancel round". Everything a round in
  // flight holds is dropped here, including the target image: both callers want it
  // gone, and cancel especially — the motivating case is the image having rendered
  // broken, so the GM must re-pick. `roundSeconds` and `extensions` are reset by
  // handleStart rather than here, so LOBBY keeps reporting the last round's values
  // until a new one is configured.
  //
  // The DO alarm needs no explicit handling: onMessage re-arms after every handler,
  // and with phase ≠ DRAWING and a null deadline `nextWake` falls through to the
  // idle wake, which is far enough from the old draw deadline to clear
  // ARM_TOLERANCE_MS and genuinely rewrite. A stale fire is a no-op anyway —
  // onAlarm and endDrawing both re-check `phase === 'DRAWING'`.
  private resetToLobby() {
    this.state.phase = 'LOBBY'
    this.state.config = null
    this.state.deadline = null
    this.state.submissions.clear()
    this.state.votes.clear()
    this.state.gallery = null
    this.state.ranked = null
    for (const p of this.state.players.values()) { p.doneDrawing = false; p.spectating = false; p.drewThisRound = false }
    this.broadcastAll(this.buildState())
  }

  // RESULTS-only, and that guard is load-bearing. The button only exists on the
  // results screen, but a GM with a stale RESULTS tab open in another window can
  // click it while the room has moved on — and unguarded this nulled the `config`
  // they had just chosen in the lobby, silently losing their image.
  private handlePlayAgain(conn: Connection) {
    if (!this.isGm(conn))
      return
    if (this.state.phase !== 'RESULTS')
      return
    this.resetToLobby()
  }

  // Abandon a round in flight. DRAWING and VOTING only — from RESULTS the round is
  // already over and `gm:playAgain` is the right message.
  private handleCancelRound(conn: Connection) {
    if (!this.isGm(conn))
      return
    if (this.state.phase !== 'DRAWING' && this.state.phase !== 'VOTING')
      return
    this.resetToLobby()
  }

  // Ends the session for everyone. LOBBY and RESULTS only — between rounds, where
  // "we're done playing" is a real intent. Mid-round the equivalent is
  // `gm:cancelRound`, which abandons the round but keeps the room usable; ending a
  // session from DRAWING would throw away work and the room in one click.
  //
  // The teardown is `wipeState()` itself: it already broadcasts `session-closed`
  // and drops every connection, so a deliberate end and an idle expiry are the
  // same event from the client's side, differing only in who caused it.
  private handleEndSession(conn: Connection) {
    if (!this.isGm(conn))
      return
    if (this.state.phase !== 'LOBBY' && this.state.phase !== 'RESULTS')
      return
    this.wipeState()
  }

  // ── Phase transitions ──────────────────────────────────────────────────────

  private endDrawing() {
    if (this.state.phase !== 'DRAWING')
      return
    const cfg = this.state.config!

    // Build the gallery once, and **before touching state**. Membership is now
    // `drewThisRound`, not grid content: a player who painted and then cleared has
    // an all-`-1` grid at the deadline, and filtering on content dropped them from
    // voting *and* results with no feedback. The flag keeps them in — their card is
    // blank, but it exists. Someone who never touched the canvas still has no flag
    // and stays out, so a round nobody drew in still produces an empty gallery and
    // skips VOTING below.
    //
    // Order is left as-is; anonymising the display order is done per-client in
    // Voting.vue. Frozen for the round so rejoins and results read a consistent set.
    //
    // The ordering is deliberate and load-bearing. This used to run *after*
    // `phase` moved to VOTING, so anything thrown here left the room mid-mutation:
    // VOTING, holding DRAWING's now-past deadline, with `gallery` unassigned and
    // nothing broadcast. The DO alarm retry then matched the VOTING-expiry branch
    // instead of the DRAWING one and resolved the round off an empty gallery,
    // silently discarding every submission. Computing first means a throw leaves
    // the round untouched and the retry re-enters the same branch.
    const gallery = [...this.state.submissions.entries()]
      .filter(([clientId]) => this.state.players.get(clientId)?.drewThisRound)
      .map(([clientId, grid]): Submission => ({ submissionId: clientId, grid }))

    // Set early so `endVoting`'s own phase guard passes on the nobody-drew path
    // below. Nothing is broadcast until we know which way this round resolves.
    this.state.phase = 'VOTING'
    this.state.gallery = gallery

    // Nobody drew anything. VOTING would be a phase in which no one can act: no
    // cards to vote on, so `votedCount` can never rise, `allVoted` can never fire,
    // and the GM's End-voting confirm stays armed over an empty screen until the
    // backstop expires. Skip it entirely — RESULTS already knows how to resolve a
    // field with no winner in it, and the target image takes the hero.
    //
    // Clients see DRAWING → RESULTS directly: the transient VOTING above is never
    // broadcast, so there is no flicker through a phase nobody could use.
    if (this.state.gallery.length === 0) {
      this.endVoting()
      return
    }

    // VOTING gets its own expiry — a backstop for an absent GM, not a game timer.
    // `nextWake` and `onAlarm` distinguish the two timed phases by `state.phase`.
    this.state.deadline = Date.now() + this.votingMs

    this.broadcastAll({
      type: 'gallery',
      submissions: this.state.gallery,
      palette: cfg.palette,
      gridW: cfg.gridW,
      gridH: cfg.gridH,
    } satisfies ServerMsg)
    this.broadcastAll({ type: 'phase', phase: 'VOTING', deadline: this.state.deadline } satisfies ServerMsg)
  }

  private endVoting() {
    if (this.state.phase !== 'VOTING')
      return
    this.state.phase = 'RESULTS'
    // The VOTING backstop has done its job either way — GM-ended or expired.
    this.state.deadline = null
    const cfg = this.state.config!

    // Tallied from the frozen gallery (blanks already filtered out) so a
    // non-drawer can't appear in results. See `tallyVotes` for why a dropped
    // voter's votes are skipped.
    const ranked = tallyVotes(this.state.gallery ?? [], this.state.votes, this.state.players)

    // `results` BEFORE `phase`, matching endDrawing's gallery-then-phase order.
    // The other way round, the client mounts Results against whatever payload it
    // still holds — the previous round's, since nothing else clears it — and only
    // re-renders when the fresh one lands a frame later.
    this.state.ranked = ranked
    this.broadcastAll({ type: 'results', ranked, palette: cfg.palette, gridW: cfg.gridW, gridH: cfg.gridH } satisfies ServerMsg)
    this.broadcastAll({ type: 'phase', phase: 'RESULTS', deadline: null } satisfies ServerMsg)
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

  private get votingMs(): number {
    return parseMs(this.env.VOTING_MS, DEFAULT_VOTING_MS)
  }

  // Soonest deadline we care about, or null if nothing is pending.
  private nextWake(): number | null {
    const candidates: number[] = [this.lastActivityAt + this.idleMs]
    // Both timed phases park their expiry in `state.deadline`, so the phase check
    // is what distinguishes them — see the matching branches in `onAlarm`.
    if ((this.state.phase === 'DRAWING' || this.state.phase === 'VOTING') && this.state.deadline !== null)
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

    // 1b) Voting ran out. A backstop for an absent GM: without it the round falls
    // through to the idle wipe below, which destroys it rather than resolving it.
    if (this.state.phase === 'VOTING' && this.state.deadline !== null && now >= this.state.deadline) {
      this.endVoting()
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
    // Tell anyone still watching, before we forget they exist. The idle path can
    // fire with live connections, and every field their client depends on —
    // `players`, `connMap`, `gmClientId` — is about to be cleared, after which
    // everything they send is silently dropped by the phase and GM guards. The
    // empty path only fires with `connMap.size === 0`, so there this is a no-op.
    this.broadcastAll({ type: 'session-closed' } satisfies ServerMsg)
    // Then drop them. The client closes its own socket on `session-closed` to stop
    // partysocket reconnecting, but the room must not depend on client cooperation
    // to let go — an old bundle, or a client that ignores the message, would
    // otherwise re-join a pristine room and silently become its GM.
    for (const conn of this.getConnections())
      conn.close(1000, 'session closed')
    this.state = {
      phase: 'LOBBY',
      players: new Map(),
      connMap: new Map(),
      gmClientId: '',
      originalGmClientId: '',
      config: null,
      deadline: null,
      roundSeconds: 0,
      extensions: 0,
      submissions: new Map(),
      votes: new Map(),
      gallery: null,
      ranked: null,
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
      roundSeconds: this.state.roundSeconds,
      extensionsLeft: Math.max(0, MAX_EXTENSIONS - this.state.extensions),
      ...this.drawProgress(),
      ...this.votingProgress(),
    }
  }

  // DRAWING progress: how many connected players have flagged "I'm done", out
  // of all connected players. Both halves count the same population, so the
  // numerator can never exceed the denominator — a player who flags done and
  // then drops leaves both counts. The GM is included: they draw and are ranked
  // like everyone else (their submission lands in the gallery).
  private drawProgress(): { doneCount: number, totalDrawing: number } {
    // Spectators are excluded from both halves: they joined mid-round, and counting
    // them would make "X of Y done" jump backwards the moment somebody arrives.
    const present = [...this.state.players.values()].filter(p => p.connected && !p.spectating)
    return {
      doneCount: present.filter(p => p.doneDrawing).length,
      totalDrawing: present.length,
    }
  }

  // VOTING progress: how many connected players have cast a vote in *every*
  // category (= finished voting), out of all present. Broadcast (not the
  // tallies) so the GM can decide when to stop.
  private votingProgress(): { votedCount: number, totalVoters: number } {
    const perVoter = new Map<string, number>()
    for (const key of this.state.votes.keys()) {
      const voterId = voterOf(key)
      perVoter.set(voterId, (perVoter.get(voterId) ?? 0) + 1)
    }
    // Same exclusion as drawProgress: a mid-round arrival must not make `allVoted`
    // un-fire, which is what previously ruled out any latching GM notification.
    const present = [...this.state.players.values()].filter(p => p.connected && !p.spectating)
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
      ...this.drawProgress(),
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
