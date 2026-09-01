# Contributing

Small, single-package project. The workflow is light. This covers setup, tooling, and the conventions worth knowing before a PR.

## Setup

```bash
pnpm install               # installs deps + wires git hooks
pnpm dev                   # Vite frontend on :7965
pnpm wr:dev                # realtime Worker on :1999 (separate terminal)
```

You need **both** servers to play — the frontend talks to the Worker over a WebSocket. Two gitignored env files, read by different tools:

- **`.env.local`** — Vite's. `VITE_PARTYKIT_HOST=127.0.0.1:1999` in dev. (The var keeps its historical name.)
- **`.dev.vars`** — `wrangler dev`'s. `PIXMALER_DEV=1` lifts the server's "min 2 players + GM" start gate so the whole flow can be driven solo across two browsers. Never deployed.

The server's lifecycle windows are env-overridable too, which is the only sane way to test them — the defaults are measured in minutes. All three are read per-call from `this.env`, so `wrangler dev` picks up a `.dev.vars` change on reload:

| Var | Default | What it bounds |
|---|---|---|
| `VOTING_MS` | 5 min | Backstop that resolves a stalled VOTING phase. A safety net, not a mechanic — an absent GM used to lose the round to the idle wipe instead. Surfaces to players only in the last 30 s. |
| `IDLE_MS` | 45 min | No messages for this long → the room is wiped and every open tab is dropped onto the closed screen. |
| `EMPTY_GRACE_MS` | 60 s | Wipe this long after the last connection closes, so a room code reuses clean. |

Set one low (`VOTING_MS=20000`) rather than waiting, and remember a wipe is deliberately destructive: it clears the players, the GM and the round.

> The server runs on **PartyServer + `wrangler`**, configured in `wrangler.jsonc`. There is no `partykit` dependency and no `partykit.json` — the managed PartyKit host was blocked by a shared-zone cap and replaced. If a round won't pick up server edits, check for a leftover process on the port: `lsof -nP -iTCP:1999 -sTCP:LISTEN`.

The solo `/pixmaler/paint` sandbox needs only `pnpm dev` — no socket.

## Package manager

pnpm. Versions are pinned in `pnpm-workspace.yaml` catalogs (`prod` / `dev`) and referenced as `catalog:*` in `package.json`, so they stay consistent across the repo.

Adding a dependency:

```bash
pnpm add <pkg>
```

Then move the version into the relevant catalog and change the `package.json` entry to `catalog:prod` or `catalog:dev`. Run `pnpm install` to relink.

## Scripts

```bash
pnpm dev          # Vite dev server (:7965)
pnpm wr:dev       # realtime Worker (:1999)
pnpm build        # type-check + production build
pnpm preview      # preview the built dist
pnpm typecheck    # vue-tsc --noEmit + tsc -p tsconfig.worker.json (no build)
pnpm lint         # eslint .
pnpm lint:fix     # eslint . --fix
pnpm test         # vitest run (unit tests in test/)
pnpm wr:deploy    # deploy the realtime server to Cloudflare
```

## Code quality

**Lint + format** via `@antfu/eslint-config` (no separate Prettier) — config in `eslint.config.mjs`. Two local tweaks:

- `style/max-statements-per-line` relaxed to `max: 6` — grouped one-line variable inits are idiomatic in the algorithmic code.
- `no-alert` on, **with no inline exemptions** — the rule covers `confirm()` as well as `alert()`, and both have an in-UI replacement. `src/lib/dialog.ts` exposes `askAlert(message)` and `askConfirm(message)`; each returns a promise, so a guard reads `if (!await askConfirm('End voting now?')) return`. Requests queue into the one `AlertDialog.vue` instance mounted in `App.vue`, which renders acknowledge or yes/no from its `mode` prop (`'alert'` by default). Reach for the browser's dialogs only if you're prepared to explain why in the same commit that adds the disable.

Run `pnpm lint:fix` before committing. Most issues auto-fix.

**Git hooks** — `simple-git-hooks` + `lint-staged` run `eslint --fix` on staged files at pre-commit, installed by the `prepare` script on `pnpm install`. If they don't fire, run `pnpm exec simple-git-hooks`.

**Types** — `strict` is on. `pnpm build` runs `vue-tsc --noEmit` first, so a type error fails the build; `pnpm typecheck` also covers `party/` against Workers globals via `tsconfig.worker.json`. Keep the tree green.

**Tests** — `pnpm test` runs Vitest over `test/`: 14 files, 348 tests, and [`ci.yml`](./.github/workflows/ci.yml) runs them on every push and PR. Coverage is deliberately narrow *and* deliberately DOM-free: pure, load-bearing logic that a plausible refactor could silently break, reachable without a browser. That constraint shaped the code as much as it shaped the tests — `src/lib/palette.ts` and `party/tally.ts` both exist because the logic in them was worth testing and was trapped inside something that needed a canvas or a Durable Object, and `party/ctx.ts` is the seam that lets every room handler run against a fake `RoomCtx` (`test/support/room.ts`) instead of a live one.

| Suite | Guards |
|---|---|
| `types.test.ts` | `parseClientMsg` — the wire's trust boundary. It must never throw, and must *construct* its result so unknown properties can't ride into room state. |
| `tally.test.ts` | Who wins a round, and what a player ends up called. A dropped voter's votes must not count, or the tally disagrees with the "N of M voted" the GM decided on. |
| `state.test.ts` | The room's derived state. `isGm` is derived at broadcast time so it cannot drift from `gmClientId`, and spectators are excluded from both progress readouts, or a mid-round arrival makes a count go backwards. |
| `connection.test.ts` | Join, rename, close, and the reconnect rules. `partysocket` reconnects unprompted, so anything `handleJoin` re-applies fires on every network blip — which is how a waking tab used to repaint its own avatar mid-reveal. |
| `gm.test.ts` | The GM-only controls and their phase guards. Each guard exists because a GM can hold a stale tab and click a button the room has moved past: `gm:playAgain` from a stale RESULTS tab used to null the config just chosen in the lobby. |
| `drawing.test.ts` | `draw:submit`'s contextual validation — grid length and palette range against the round's own config. That grid is broadcast verbatim to everyone else, so this is what keeps a crafted payload out of their renderers. |
| `voting.test.ts` | The guards that stop a crafted client rigging a round, exercised without a Durable Object, a socket or a browser. |
| `phases.test.ts` | The two load-bearing orderings: `endDrawing` computes the gallery *before* it mutates anything, and sets `phase = 'VOTING'` *before* calling `endVoting` on the nobody-drew path. Both look like tidy-up targets to anyone who doesn't know the history. |
| `alarm.test.ts` | One alarm slot, four windows. The real ones are measured in minutes, so none of this is observable in a smoke test — the decisions are pure functions of an injected clock, which is what makes them testable at all. |
| `palette.test.ts` | Median cut, near-duplicate merging, swatch ordering, and the swatch the pipeline actually hands the picker. `medianCut` takes a **count, not a depth** (#28), so a request for 24 yields 24 where a power-of-two depth could only give 32; `withClassics` caps the swatch at the requested count and fills a short one from the classics ramp. `paletteSortOrder` must return a permutation — the caller remaps `targetGrid` through it, so a lost index repaints cells the wrong colour. |
| `pipeline.test.ts` | Grid geometry, and the rule that grid cell `(x, y)` reads source pixel `(x, y)` — the invariant whose absence caused #4, where the right column and bottom row of every image were discarded. Also `unsupportedImage`, which refuses a vector or non-image pick before `createImageBitmap` gets the chance to throw a DOM exception at the player. |
| `grid.test.ts` | Cell geometry lifted out of `PixelCanvas`: even brushes are asymmetric, footprints clip rather than clamp, and `cellAt` is *allowed* to return cells outside the grid, because the input path uses that to notice the pen leaving the canvas. |
| `aspect.test.ts` | Brush sizing, `--art-ratio`, the row/column choice, and the three target shapes with their crop math. |
| `seats.test.ts` | Seat colour, initial and lean. The initial is taken by code point, not `charAt(0)` — see the file header for the emoji collapse that caused. |

When you add a test, make it fail first: revert the fix it guards and check it goes red. Several of these were written that way, and two of them caught mutations that a green-only run would have missed. What the suite cannot reach is anything needing a real `getContext('2d')` — canvas rendering, the decode → crop → flatten → sample half of `processImage`, `hasTransparency` — or component behaviour. Verify those by driving the app in a browser.

## Conventions

- **British English** in user-facing strings, comments, and docs (`colour`, `behaviour`, `centre`). Identifiers mirroring DOM/web APIs stay as-is (`color` in CSS, `fillStyle` on canvas).
- **Vue 3 Composition API** with `<script setup>`. **Styling convention:** static, non-reactive styles live in per-screen partials (`src/styles/_<screen>.scss`) and shared primitives (`_alerts`, `_buttons`, `_forms`, `_logo`, `_phase`, `_surfaces`, `_tools-panel`), all `@use`d into `main.scss`; tokens in `_tokens.scss`. Recipe partials are the exception: `_chrome` (the chrome surface), `_wonk` (the tilt) and `_screen` (the interstitial shape behind the name gate, the closed room and the phase-error fallback) define mixins and **emit no CSS**, so they are `@use`d by whoever includes them rather than by `main.scss` — a rule in one would land wherever the first `@use` resolved and reorder the cascade. `_surfaces.scss`'s header is where the three surface roles are written down — artefact (a drawing), chrome (panels and inputs), person/choice (roster rows, vote cards) — and it owns the `.art-frame` / `.art-surface` pair that every finished drawing goes in. A component's scoped `<style>` is reserved for genuinely reactive or component-local rules — chiefly `:deep()` reaching imperatively-mounted `PixelCanvas` elements, which only works in a scoped block. The one unscoped exception is `Tagline.vue`'s `::view-transition` block: document-level pseudo-elements can't be scoped.
- **Inject infrastructure, prop data.** `socket` and `clientId` are `provide`/`inject`ed once at connection; reactive game state flows down as props. No Pinia.
- **`PixelCanvas` is imperative** — it owns its `<canvas>` and is instantiated in `onMounted`/watchers, not driven by reactivity.
- **The server is authoritative** for phase, timer, submissions, and votes. Client state is a view of the server's truth — derive from the latest `state` message rather than holding local state that can drift.
- **Broadcast the payload before the phase flip.** `endDrawing` sends `gallery` then `phase`; `endVoting` sends `results` then `phase`. That order is deliberate — flipping the phase first mounts the incoming screen against whatever payload the client still holds, which is the *previous* round's, and that was the root of the blank-winner bug (`13` item 48). A new phase that carries data follows the same order.
- **Clear per-round client state when a round starts.** `App.vue`'s `phase === 'DRAWING'` branch nulls `drawState`, `results`, `gallery` and `voteState`. Nothing else clears them, and a payload outliving its round is a whole family of bugs — a stale ranking flashing last round's winner, round 1's votes pre-filling round 2's vote UI. Anything new you cache from a server message belongs in that reset.
- **antfu gotcha:** `ts/no-use-before-define` — declare `useTemplateRef`/`ref`s *above* any `watch`/`computed` that references them.

## Structure

```
src/lib/        # canvas, image pipeline, shared types, taglines, layout helpers, dialog queue, composables
src/components/ # reusable UI (AlertDialog, ImagePicker, CanvasPair, PaletteTools, PlayerList, PhaseLayout, Tagline, Logo)
src/views/      # Entry, Paint, Taglines, phases/ (the four game screens), rooms/ (name gate, closed session)
src/styles/     # _tokens + shared primitives + per-screen partials, all via main.scss
party/          # PartyServer Durable Object — server.ts plus the per-concern handler modules; config in wrangler.jsonc
test/           # Vitest suites, with the shared fake RoomCtx in test/support/
```

## Submitting changes

1. Branch off `main`.
2. Keep it focused.
3. Run `pnpm lint`, `pnpm typecheck` and `pnpm test`.
4. Verify in dev with **both** servers running. Test a reconnect (reload mid-game) if you touched anything stateful — and reload during **RESULTS** specifically, which used to strand the room (`13` item 54). If you touched a phase transition, also drive the two rounds that look like nothing: one where **nobody draws**, and one where people draw but **nobody votes**.
5. Open a PR describing what changed and how you verified it. Note protocol changes explicitly.

A green `pnpm test` is part of the bar, not all of it. The suite is DOM-free by design, so it says nothing about canvas rendering or the half of `processImage` that needs a real `getContext('2d')` — pipeline and drawing changes are verified by driving the app in a browser instead. It doesn't exercise a live room either: anything stateful still needs both dev servers and a real reconnect. Describe what you tested, whichever kind it was.

## Commit messages

**[Conventional Commits](https://www.conventionalcommits.org), enforced by a `commit-msg` hook.** Not a style preference: release-please derives the next version from commit types, so an unparseable message silently drops out of both the release notes and the version calculation.

```
type(scope)?!?: subject

fix(voting): show the confirmation while the cursor rests on the button
feat(lobby): explain the GM's job to whoever holds the role
refactor(server)!: split the room into modules
```

`feat` bumps the **minor**, `fix` and `perf` the **patch**, a `!` or a `BREAKING CHANGE:` body line the **major**. `refactor` · `build` · `ci` appear in the notes without bumping; `docs` · `test` · `chore` · `style` are hidden from them entirely.

Scope is optional and mirrors the `area:*` labels on the tracker — `lobby`, `drawing`, `voting`, `results`, `server`, `pipeline`, `a11y`, `canvas` — so a note and an issue describe the same place. A new scope warns rather than fails; add it to [`scripts/commit-msg.mjs`](./scripts/commit-msg.mjs) so the next person sees it.

The hook also refuses a capitalised subject, a trailing full stop, a subject over 72 characters, and a description too short to be a useful release-note line. When it refuses it prints the whole grammar, so you never have to look it up. `--no-verify` bypasses it, at the cost of that commit vanishing from the notes.

There is no commitlint dependency: the grammar is small, and a bespoke check can print this repo's own scopes and say what each type does to the version, which is the part that stops the mistake recurring.

## Deploy

Two targets, deployed two different ways — deliberately.

| | How | When |
|---|---|---|
| **Pages** (frontend) | automatic, by [`release.yml`](./.github/workflows/release.yml) | merging the Release PR |
| **Worker** (realtime server) | `pnpm wr:deploy`, by hand | whenever you choose, ideally just **before** merging |

[`ci.yml`](./.github/workflows/ci.yml) runs lint, typecheck, test and build on every push and PR, and deploys nothing.

### Why the Worker is manual

- **No Cloudflare credential leaves your laptop.** `wrangler` uses the OAuth token cached by `wrangler login`, so CI needs no API token — nothing to scope, rotate or leak. IP-filtering such a token to GitHub was considered and rejected: GitHub publishes ~7,280 CIDRs for Actions covering roughly 28 million addresses, they change without notice, and the allowlist contains every other GitHub user's runners, so a leaked token would still work from anybody else's workflow.
- **A Worker deploy ends every game in progress.** `RoomState` is entirely in memory — `ctx.storage` holds alarms and nothing else, and full persistence is deliberately deferred — so redeploying drops every player mid-round. Choosing that moment by hand beats hoping a workflow picked a good one.
- **One maintainer.** Remembering one command is cheaper than verifying a pipeline ran.

### Order matters: server before frontend

The frontend inlines `VITE_PARTYKIT_HOST` at **build** time, so the moment Pages publishes, new clients are talking to whatever server is currently live. Deploy the Worker **first** and an updated server briefly serves older clients, which it tolerates. The other way round — a new client against an old server — does not hold, and on a protocol change it breaks live rooms.

`release.yml` prints the reminder on the Pages run summary, so it lands on the very deploy that changed what clients are running.

Required repo config, under Settings → Secrets and variables → Actions:

| | Name | Value |
|---|---|---|
| Variable | `VITE_PARTYKIT_HOST` | bare host, e.g. `pixmaler.cold-hill-30d3.workers.dev` — no protocol, no trailing slash |

No secrets. That is the point.

### Cutting a release

1. Review the open **Release PR**. release-please has already written the version into `package.json` and the entry into `CHANGELOG.md`, derived from the conventional-commit types since the last release.
2. **`pnpm wr:deploy` — but only if the server actually changed.** Check with `git diff <last-tag>..HEAD -- party/ src/lib/types.ts`. A Worker deploy **ends every game in progress**, so this is not a ritual: skip it when that diff is empty. When it is not empty, deploy *before* merging — the frontend inlines `VITE_PARTYKIT_HOST` at build time, and a newer server tolerates older clients while the reverse does not.
3. **Merge the Release PR.** That tags it, publishes the GitHub release, and deploys Pages.
4. **Close the milestone the release completes** — if it completes one.

Milestones name **themes, not versions**: `Image pipeline`, `Server refactor`, `Accessibility`, `Results Polish`, `Audio and more polish`, `Onboarding`, `1.0.0`. They are ordered by severity — the more severe the work, the earlier the release it lands in — but the version is never chosen, because release-please derives it from the commit types. So a milestone may span several releases, and a release may close none. An issue with no milestone is deliberately not scheduled; parked long-term work stays in `docs/.plans/` rather than sitting on the board looking actionable.

**Pre-1.0 a `feat` bumps the minor and a `!` never forces 1.0** (`bump-minor-pre-major`), so reaching 1.0 stays a deliberate act.

## Plans

Working plans live in the gitignored [`docs/.plans/`](./docs/.plans/README.md). Three are standing: **01** is the general plan (architecture, state machine, pipeline, protocol, locked-in decisions), **13** is the only backlog for behaviour/data/server work, and **14** is the only backlog for anything visual. File new work accordingly — behaviour to `13`, pixels and copy to `14`, a game-rule change to `01`.

**15** is a transient register, not a fourth backlog: it holds the findings from a design critique and routes each into its owning plan. It archives once emptied. Item numbers are shared across all of them and never reused, so check `.plans/README.md` for the next free one before filing.

**[GitHub Issues](https://github.com/kspiteri/pixmaler/issues) own status; the plans own reasoning.** Adopted 2026-08-24. An issue says whether something is open, being worked on, or done. The plan says *why* — the measurements, the rejected alternatives, and the predictions that turned out wrong. An issue body is a summary plus a pointer into the plan; nothing in an issue should be the only copy of a decision.

Component is a label (`area:drawing`, `area:server`, `area:pipeline`, `area:a11y`, …) rather than a container, so an item spanning two areas carries both and still closes as one unit. Priority is **which milestone it sits in**, and those are ordered by severity rather than by date; no milestone at all means unscheduled. Issue titles carry the plan id in brackets — `[56] Clearing the canvas…` — because archived plans cite plan ids and those citations have to keep resolving.

Shipped items live in each plan's `NN-name.done.md` sibling, split out when closed work had grown to 52 % of the plans' prose. Items not yet migrated to Issues use positional status: in `NN-name.md` means open, in `NN-name.done.md` means shipped.

**Anyone can report a bug** through the form in [`.github/ISSUE_TEMPLATE/`](./.github/ISSUE_TEMPLATE/) — no need to know the codebase. It asks for room code, phase, device and player count, because the 2026-08-23 playtest showed two of six reports were not what they first looked like, purely for want of that context.
