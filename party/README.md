# party/ — the realtime server

The game server: a [PartyServer](https://github.com/cloudflare/partyserver) Durable Object on Cloudflare Workers, deployed with `wrangler`. One room = one DO instance, keyed by a memorable `{word}-{word}` code. The server is authoritative for phase, timer, submissions and vote tallying — the client is a view of its truth.

> **It is not PartyKit.** There is no `partykit` dependency and no `partykit.json` — the managed PartyKit host was blocked by a shared-zone cap and the server was ported to PartyServer + `wrangler` (`wrangler.jsonc`). `VITE_PARTYKIT_HOST` and `routePartykitRequest` keep their historical names; nothing else of PartyKit remains. See [`docs/.plans/archive/07-partyserver-port.md`](../docs/.plans/archive/07-partyserver-port.md).

## Running it

```bash
pnpm wr:dev     # wrangler dev on :1999 — run alongside pnpm dev
pnpm wr:deploy  # deploy to Cloudflare, by hand and deliberately so (see Deploying)
```

`wrangler dev` auto-loads the gitignored **`.dev.vars`**: `PIXMALER_DEV=1` lifts the "min 2 non-GM players" start gate *and* the origin allowlist, so the whole flow can be driven solo. If a restart won't pick up server edits, check for a leftover process holding the port: `lsof -nP -iTCP:1999 -sTCP:LISTEN`.

To populate a round without friends: `node scripts/testbots.mjs --room=<code> --count=5` — bots join a local room, submit an imperfect redraw during DRAWING and vote during VOTING. GM in a real browser first, then the bots.

## Module map

`server.ts` owns the Durable Object — connections, the message loop, the alarm, the origin and rate-limit guards — and hands every parsed message to a per-concern handler module. The handlers never touch the DO, `partyserver` types or the alarm directly: they see only `RoomCtx` (`ctx.ts`), the effect surface a test can fake (`test/support/room.ts`).

| Module | Owns |
|---|---|
| `server.ts` | The `PixmalerServer` DO: connection lifecycle, `onMessage` dispatch, the existence probe (`onRequest`), origin allowlist, rate limiting, the alarm plumbing |
| `ctx.ts` | `RoomCtx` / `RoomConn` — the seam between the DO and the handlers, and the reason every handler is testable without one |
| `state.ts` | `RoomState` and the pure derivations over it: `buildState`, `buildVoteState`, progress counts, GM auto-promotion |
| `connection.ts` | `join` / reconnect / `rename` / `shape` / close — most rules exist because partysocket reconnects unprompted |
| `phases.ts` | `LOBBY → DRAWING → VOTING → RESULTS` and the way back; statement order inside `endDrawing` is load-bearing |
| `drawing.ts` | `draw:submit` (the hot path — broadcasts nothing) and `draw:done` |
| `voting.ts` | Vote casting + the GM's stop; guards ignore rather than answer, so a prober learns nothing |
| `gm.ts` | GM-only controls — every handler proves sender-is-GM, then phase-allows-it, then acts |
| `tally.ts` | Who wins and what a player ends up called — pure functions, no DO required |
| `alarm.ts` | Which deadline the single alarm wakes for and what to do when it fires — pure over an injected clock |
| `rateLimit.ts` | The per-connection token bucket (#75) — pure arithmetic, caller owns the buckets |

## The wire protocol

Lives in **`src/lib/protocol/`**, not here, because both deploy targets need it: `types.ts` (message shapes + `VOTE_CATEGORIES`), `protocol.ts` (`parseClientMsg` — server-only), `index.ts` (the DOM-free barrel). The Worker imports **that barrel and specific modules like `content/words` — never the client barrel**, which re-exports DOM-dependent modules that break the Workers build. `tsconfig.worker.json` type-checks `party/` + `src/lib/protocol` against Workers globals via `pnpm typecheck`.

`parseClientMsg` is the trust boundary: it never throws, and it **constructs** its result rather than narrowing the input, so unknown properties can't ride into room state. Contextual checks that need the live room (grid length against the round's config, palette range) happen a second time in the handlers — the two deploy targets can be out of step, so neither side trusts the other's vintage.

## Phases, deadlines and the one alarm

`LOBBY → DRAWING → VOTING → RESULTS`, timer transitions deadline-driven: the server broadcasts a deadline timestamp, clients tick locally, and a **single DO alarm** (never `setTimeout`) wakes for whichever deadline is nearest — draw deadline, VOTING backstop, empty-room grace or idle wipe. `onMessage` re-arms it after every message, which is also what lets the GM's "+15s" (`gm:extendTime`, capped at `MAX_EXTENSIONS`) simply bump `state.deadline` and work. See [`docs/.plans/archive/10-room-lifecycle.md`](../docs/.plans/archive/10-room-lifecycle.md).

Two orderings are load-bearing, pinned by `test/phases.test.ts`:

- **Payload before phase flip** — `endDrawing` broadcasts `gallery` then `phase`; `endVoting` broadcasts `results` then `phase`. Flipping first mounts the incoming screen against the previous round's payload.
- `endDrawing` computes its gallery **before** mutating state; the nobody-drew path sets `phase = 'VOTING'` before delegating to `endVoting`.

## State: in memory, on purpose (for now)

`RoomState` lives entirely in memory — `ctx.storage` holds the alarm and nothing else. **Hibernation is off**: `Server`'s default is `{ hibernate: false }` and we don't override it, so open WebSockets pin the DO in memory. A live room is therefore *not* evicted during a quiet lobby or an input-free stretch of DRAWING — the sockets keep it warm with no message traffic, and `IDLE_MS` (45 min) is a deliberate app-level wipe, not platform eviction. What *does* restart the DO and reset the room is a **Worker deploy** (by hand, at quiet moments) and, less often, **Cloudflare's own runtime maintenance** (roughly weekly) or a rare hardware migration. That's accepted deliberately: the exposure window is one game (~30 min at most), a restart landing inside any given game is unlikely, and the blast radius is one evaporated party — not lost data, since anything durable (leaderboard / hall of fame) is scoped in #91/#92.

[#93](https://github.com/kspiteri/pixmaler/issues/93) filed persistence as urgent on the premise of idle/hibernation resets mid-game and an existence probe that lies afterwards; with hibernation off, neither applies. It's resolved there as a deliberate deferral — persisting would trade that rare restart-loss for a permanent cost: the target image written to `ctx.storage` (the residue the memory-only design avoids, #44) and a state-shape migration burden on every deploy. Revisit only if restart-losses actually show up in play.

Roster rules that follow from the state shape:

- A player's **seat is their index in `state.players`** — join order, stable for the room's life. `onClose` only flips `connected`; the sole removal site is `handleRemove` (GM removes an *offline* player, LOBBY-only, #68), because a splice re-colours every seat below the gap.
- A room is created **only by explicit intent** (#66): a new player on an empty room needs `create: true` + a well-formed room code, or they get `no-such-room`. The client pre-flights the `onRequest` existence probe (`exists = players.size > 0`) before joining.
- A room is cleared wholesale by `resetRoom()` via the alarm — the empty-room grace or the idle wipe.

## Guards

Defence layers on the message path, in order:

1. **Origin allowlist** (`guardOrigin`) — CSWSH hygiene, not authentication: browsers can't forge `Origin`, non-browsers can. Dev (`PIXMALER_DEV=1`) bypasses it.
2. **Byte ceiling** (`MAX_FRAME_BYTES`) — an oversized frame is dropped before `JSON.parse` ever sees it.
3. **Token bucket** (`rateLimit.ts`, #75) — per-connection burst + sustained rate, O(1) arithmetic before parsing.
4. **`parseClientMsg`** — the construct-don't-narrow trust boundary.
5. **Handler guards** — phase gates, GM proofs, contextual grid/palette validation. Most refusals are silent: the UI can't produce the message, so answering would only confirm to a prober that it got through.

Plus the **16-player room cap** (`MAX_PLAYERS` → `room-full`) and display-name sanitising (`sanitiseName` + `clampName`, #64) at the join.

## Configuration

All read per-call from `this.env` — `wrangler dev` picks up a `.dev.vars` change on reload, and prod values are tunable in the dashboard without a redeploy (`vars` in `wrangler.jsonc`).

| Var | Default | What it does |
|---|---|---|
| `ALLOWED_ORIGINS` | the GitHub Pages origin | Comma-separated web origins allowed to connect in prod |
| `IDLE_MS` | 45 min | No messages for this long → the room is wiped |
| `EMPTY_GRACE_MS` | 60 s | Wipe this long after the last connection closes |
| `VOTING_MS` | 5 min | Backstop resolving a stalled VOTING phase — a safety net, not a mechanic |
| `RATE_BURST` | 40 | Max frames back-to-back before the bucket throttles |
| `RATE_PER_SEC` | 20 | Sustained frames/sec once the burst is spent |
| `MAX_FRAME_BYTES` | 1 000 000 | Frames longer than this are dropped pre-parse |
| `PIXMALER_DEV` | unset | `1` lifts the start gate + origin guard — local `.dev.vars` only, never deployed |

`CF_VERSION_METADATA` (a binding, not a var) carries the deployed Worker's identity, reported to clients on connect so client/server drift is visible (#25). It's deliberately not `package.json`'s version — the Worker deploys *before* the Release PR merges, so that would misreport.

## Testing

Every handler runs against a fake `RoomCtx` (`test/support/room.ts`) — no DO, no socket, no browser. The pure seams (`alarm.ts`, `tally.ts`, `rateLimit.ts`, `state.ts`) are unit-tested directly; `test/smoke.test.ts` walks the full loop through the real handlers. **Any change under `party/` must run the smoke suite** — and update it when the path shape genuinely changes, never re-pin it to broken behaviour. The suite table is in [`CONTRIBUTING.md`](../CONTRIBUTING.md#code-quality).

## Deploying

**By hand, `pnpm wr:deploy`, before merging the Release PR** — full reasoning in [`CONTRIBUTING.md`](../CONTRIBUTING.md#deploy), but the short version: no Cloudflare credential in CI, a deploy ends every game in progress (see State above), and a newer server tolerates older clients while the reverse does not. Only deploy when the server actually changed: `git diff <last-tag>..HEAD -- party/ src/lib/protocol/`.
