import type { Connection, ConnectionContext } from 'partyserver'
import type { ServerMsg } from '../src/lib/types'
import type { LifecycleClock } from './alarm'
import type { RoomCtx } from './ctx'
import type { RoomState } from './state'
import { routePartykitRequest, Server } from 'partyserver'
import { parseClientMsg } from '../src/lib/types'
import { alarmAction, handleExtendTime, nextWake, shouldArm } from './alarm'
import { handleClose, handleJoin, handleRename, handleShape } from './connection'
import { handleDrawDone, handleSubmit } from './drawing'
import {
  handleCancelRound,
  handleConfigure,
  handleEndSession,
  handlePlayAgain,
  handleTransfer,
} from './gm'
import { endDrawing, endVoting, handleStart } from './phases'
import { buildState, drawProgress, freshRoomState } from './state'
import { handleStopVoting, handleVote } from './voting'

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
  // Injected by Cloudflare (see `version_metadata` in wrangler.jsonc). Optional:
  // `wrangler dev` does not always provide it, and a missing version must never
  // stop a room working.
  CF_VERSION_METADATA?: { id: string, tag: string, timestamp: string }
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
  private state: RoomState = freshRoomState()

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
  onConnect(conn: Connection, _ctx: ConnectionContext) {
    // Don't send `state` here — the client hasn't told us who they are yet
    // (no `join` message processed), so the snapshot would be stale and could
    // cause the first joiner to render an empty-lobby with no GM controls.
    // `handleJoin` broadcasts a fresh state to everyone once the client has
    // identified itself.
    //
    // The version is safe to send now: it describes the Worker, not the player.
    const v = this.env.CF_VERSION_METADATA
    conn.send(JSON.stringify({
      type: 'version',
      id: v?.id ?? '',
      tag: v?.tag ?? '',
      timestamp: v?.timestamp ?? '',
    } satisfies ServerMsg))
  }

  onClose(conn: Connection) {
    handleClose(this.ctxFor(), conn.id)
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
      case 'join': handleJoin(this.ctxFor(), sender, msg); break
      case 'rename': handleRename(this.ctxFor(), sender, msg); break
      case 'shape': handleShape(this.ctxFor(), sender, msg); break
      case 'gm:configure': handleConfigure(this.ctxFor(), sender, msg); break
      case 'gm:start': handleStart(this.ctxFor(), sender); break
      case 'gm:transfer': handleTransfer(this.ctxFor(), sender, msg); break
      case 'draw:done': handleDrawDone(this.ctxFor(), sender); break
      case 'draw:submit': handleSubmit(this.ctxFor(), sender, msg); break
      case 'vote:cast': handleVote(this.ctxFor(), sender, msg); break
      case 'gm:stopVoting': handleStopVoting(this.ctxFor(), sender); break
      case 'gm:extendTime': handleExtendTime(this.ctxFor(), sender); break
      case 'gm:playAgain': handlePlayAgain(this.ctxFor(), sender); break
      case 'gm:cancelRound': handleCancelRound(this.ctxFor(), sender); break
      case 'gm:endSession': handleEndSession(this.ctxFor(), sender); break
    }

    // Re-arm the lifecycle alarm after every message: the activity stamp moved,
    // and a phase change (start/stop) may have changed the draw deadline.
    this.armAlarm()
  }

  // ── Room lifecycle (DO alarm) ────────────────────────────────────────────
  // A single alarm drives four deadlines (one alarm slot per DO): the draw round
  // end, the VOTING backstop, the empty-room grace wipe and the idle wipe. The
  // decisions live in `./alarm`; this keeps only what needs the Durable Object.

  private get idleMs(): number {
    return parseMs(this.env.IDLE_MS, DEFAULT_IDLE_MS)
  }

  private get emptyGraceMs(): number {
    return parseMs(this.env.EMPTY_GRACE_MS, DEFAULT_EMPTY_GRACE_MS)
  }

  private get votingMs(): number {
    return parseMs(this.env.VOTING_MS, DEFAULT_VOTING_MS)
  }

  private clock(): LifecycleClock {
    return {
      now: Date.now(),
      lastActivityAt: this.lastActivityAt,
      emptySince: this.emptySince,
      idleMs: this.idleMs,
      emptyGraceMs: this.emptyGraceMs,
    }
  }

  // (Re)arm the DO alarm to the soonest pending deadline. Fire-and-forget: the
  // storage write is awaited internally; errors are logged, not propagated (the DO
  // keeps running and the next event re-arms).
  private armedFor: number | null = null

  private armAlarm(): void {
    const when = nextWake(this.state, this.clock())
    if (when === null || !shouldArm(when, this.armedFor))
      return
    this.armedFor = when
    this.ctx.storage.setAlarm(when).catch(err =>
      console.error('[pixmaler] setAlarm failed', err),
    )
  }

  // Fired by the runtime when the alarm is due. Idempotent (alarms auto-retry):
  // `alarmAction` re-checks every condition before naming a branch.
  async onAlarm(): Promise<void> {
    // The slot just fired and is now empty — forget what we armed for so the next
    // `armAlarm` definitely writes rather than coalescing against a stale value.
    this.armedFor = null

    switch (alarmAction(this.state, this.clock())) {
      case 'end-drawing':
        endDrawing(this.ctxFor())
        this.armAlarm()
        return
      case 'end-voting':
        endVoting(this.ctxFor())
        this.armAlarm()
        return
      case 'wipe-empty':
      case 'wipe-idle':
        this.wipeState()
        return
      case 're-arm':
        this.armAlarm()
    }
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
    this.state = freshRoomState()
    this.emptySince = null
    this.lastActivityAt = Date.now()
    this.armedFor = null
    this.ctx.storage.deleteAlarm().catch(err =>
      console.error('[pixmaler] deleteAlarm failed', err),
    )
  }

  // The effect surface handed to the handler modules (#19). Built per call rather
  // than cached: `this.state` is reassigned wholesale by `wipeState`, so a cached
  // ctx would keep pointing at the wiped room.
  private ctxFor(): RoomCtx {
    return {
      state: this.state,
      broadcast: msg => this.broadcastAll(msg),
      broadcastState: () => this.broadcastState(),
      broadcastDoneStatus: () => this.broadcastDoneStatus(),
      send: (conn, msg) => conn.send(JSON.stringify(msg)),
      devMode: this.env.PIXMALER_DEV === '1',
      votingMs: this.votingMs,
      markEmpty: () => { this.emptySince = Date.now() },
      markOccupied: () => { this.emptySince = null },
      wipeState: () => this.wipeState(),
    }
  }

  private broadcastAll(msg: ServerMsg) {
    this.broadcast(JSON.stringify(msg))
  }

  private broadcastState() {
    this.broadcastAll(buildState(this.state))
  }

  private broadcastDoneStatus() {
    this.broadcastAll({ type: 'done-status', ...drawProgress(this.state) })
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
