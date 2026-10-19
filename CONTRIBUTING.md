# Contributing

Small, single-package project. The workflow is light. This covers setup, tooling, and the conventions worth knowing before a PR.

## Setup

```bash
pnpm install               # installs deps + wires git hooks
pnpm dev                   # Vite frontend on :7965
pnpm wr:dev                # realtime Worker on :1999 (separate terminal)
pnpm dev:all               # or run both at once; one Ctrl-C stops both
```

You need **both** servers to play (`pnpm dev:all` runs the pair) — the frontend talks to the Worker over a WebSocket. Two gitignored env files, read by different tools:

- **`.env.local`** — Vite's. `VITE_PARTYKIT_HOST=127.0.0.1:1999` in dev. (The var keeps its historical name.)
- **`.dev.vars`** — `wrangler dev`'s. `PIXMALER_DEV=1` lifts the server's "min 2 players + GM" start gate so the whole flow can be driven solo across two browsers. Never deployed.

The server's lifecycle windows and hot-path guards (`VOTING_MS`, `IDLE_MS`, `EMPTY_GRACE_MS`, `RATE_BURST`, `RATE_PER_SEC`, `MAX_FRAME_BYTES`) are env-overridable too; the full table is in [`party/README.md`](./party/README.md#configuration). They're read per call, so `wrangler dev` picks up a `.dev.vars` change on reload. Set one low (`VOTING_MS=20000`) rather than waiting, and remember a wipe is deliberately destructive: it clears the players, the GM and the round.

> The server runs on **PartyServer + `wrangler`** (`wrangler.jsonc`); its guide is [`party/README.md`](./party/README.md). If a round won't pick up server edits, check for a leftover process on the port: `lsof -nP -iTCP:1999 -sTCP:LISTEN`.

**Populating a round without friends:** `pnpm bots --room=<code> --count=5` connects 1–10 bots to a local room over WebSocket — they join, submit an imperfect redraw of the target during DRAWING, and vote during VOTING, resetting each round. Open/create the room as the GM in a real browser first, then launch the bots. Local only: prod refuses non-browser sockets by design.

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
pnpm dev:all      # Vite + Worker together (one Ctrl-C stops both)
pnpm build        # type-check + production build
pnpm preview      # preview the built dist
pnpm typecheck    # vue-tsc --noEmit + tsc -p tsconfig.worker.json (no build)
pnpm lint         # eslint .
pnpm lint:fix     # eslint . --fix
pnpm lint:css     # stylelint (SCSS + Vue <style>) — the colour-literal guard
pnpm test         # vitest run (unit tests in test/)
pnpm wr:deploy    # deploy the realtime server to Cloudflare
pnpm bots         # fill a local room with test players (--room=<code> --count=5)
```

## Code quality

**Lint + format** via `@antfu/eslint-config` (no separate Prettier) — config in `eslint.config.mjs`. Two local tweaks:

- `style/max-statements-per-line` relaxed to `max: 6` — grouped one-line variable inits are idiomatic in the algorithmic code.
- `no-alert` on, **with no inline exemptions** — it covers `confirm()` as well as `alert()`. Use `askAlert` / `askConfirm` from `src/lib/dialog.ts` instead (rules in [`AGENTS.md`](./AGENTS.md) and [`docs/design-system.md`](./docs/design-system.md)). Reach for the browser's dialogs only if you're prepared to explain why in the same commit that adds the disable.

Run `pnpm lint:fix` before committing. Most issues auto-fix.

**Stylelint — the colour-literal guard.** `.stylelintrc.json` fails on any hex, or `rgb()`/`hsl()` in a fill/ink/border property, anywhere but `_theme.scss` and `_tokens.scss`. `pnpm lint:css` runs it over `.scss` files and Vue `<style>` blocks. The colour rules it enforces are in [`docs/design-system.md`](./docs/design-system.md).

**Git hooks** — `simple-git-hooks` + `lint-staged` run at pre-commit: `eslint --fix` on staged files, plus `stylelint` on staged `.scss`/`.vue`. Installed by the `prepare` script on `pnpm install`. If they don't fire, run `pnpm exec simple-git-hooks`.

**Types** — `strict` is on. `pnpm build` runs `vue-tsc --noEmit` first, so a type error fails the build; `pnpm typecheck` also covers `party/` against Workers globals via `tsconfig.worker.json`. Keep the tree green.

**Tests** — `pnpm test` runs Vitest over `test/`: 26 files, 522 tests, and [`ci.yml`](./.github/workflows/ci.yml) runs them on every push and PR. Coverage is deliberately narrow *and* deliberately DOM-free: pure, load-bearing logic that a plausible refactor could silently break, reachable without a browser. That constraint shaped the code as much as it shaped the tests — `src/lib/canvas/palette.ts` and `party/tally.ts` both exist because the logic in them was worth testing and was trapped inside something that needed a canvas or a Durable Object, and `party/ctx.ts` is the seam that lets every room handler run against a fake `RoomCtx` (`test/support/room.ts`) instead of a live one.

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
| `rateLimit.test.ts` | The message hot path's token bucket (#75) — burst, refill and throttling as pure arithmetic over an injected clock, no socket or Durable Object required. |
| `smoke.test.ts` | The full loop — LOBBY → DRAWING → VOTING → RESULTS → LOBBY — walked through the real handlers by `test/support/round.ts` (#67). Catches a change to the *shape* of the path that a per-slice unit test would miss. |
| `palette.test.ts` | Median cut, near-duplicate merging, swatch ordering, and the swatch the pipeline actually hands the picker. `medianCut` takes a **count, not a depth** (#28), so a request for 24 yields 24 where a power-of-two depth could only give 32; `withClassics` caps the swatch at the requested count and fills a short one from the classics ramp. `paletteSortOrder` must return a permutation — the caller remaps `targetGrid` through it, so a lost index repaints cells the wrong colour. |
| `quantisers.test.ts` | The alternative palette quantisers (Wu, seeded k-means) and their metrics behind the DEV `/quantise` comparison — determinism and colour-count correctness, so a swap can't silently shift every target (#107). |
| `pipeline.test.ts` | Grid geometry, and the rule that grid cell `(x, y)` reads source pixel `(x, y)` — the invariant whose absence caused #4, where the right column and bottom row of every image were discarded. Also `unsupportedImage`, which refuses a vector or non-image pick before `createImageBitmap` gets the chance to throw a DOM exception at the player. |
| `grid.test.ts` | Cell geometry lifted out of `PixelCanvas`: even brushes are asymmetric, footprints clip rather than clamp, and `cellAt` is *allowed* to return cells outside the grid, because the input path uses that to notice the pen leaving the canvas. |
| `aspect.test.ts` | Brush sizing, `--art-ratio`, the row/column choice, and the three target shapes with their crop math. |
| `seats.test.ts` | Seat colour, initial and lean. The initial is taken by code point, not `charAt(0)` — see the file header for the emoji collapse that caused. |
| `face.test.ts` | The generated avatar face. A known seed is pinned to a **snapshot**, since the face is identity across rooms and renames: if a DiceBear upgrade breaks it, every returning player's face has changed, so decide deliberately before running `vitest -u`. Only the ink lines may be opaque: the face is painted as a CSS mask, so an opaque background or paper fill would flood the chip. |
| `words.test.ts` | `isRoomCode` and the word lists behind room codes (#66). A word the code-shape regex rejects would make ~1-in-60 generated codes unopenable with no other symptom, so the generator and the validator are pinned to each other. Also `formatRoomInput`, Entry's code-field normaliser: a trailing hyphen must survive mid-typing, and a pasted room link must yield only its `room` param. |
| `audio.gate.test.ts` | The sound engine's pure trigger discipline — the `sfx` toggle gates playback and the repeat throttle collapses a burst — so `playSfx` stays correct with Howler kept out of the test path. |
| `paintSession.test.ts` | The `/paint` sandbox's stored session: one saved before the picker settings existed still restores the drawing, and a bad settings field costs only the picker hydration, never the drawing. Also `keepsDrawing`, the guard's "does this result clear the canvas" rule: same grid size and palette keep it, anything else asks first. |
| `music.test.ts` | Every music track's URL names a bundled file, matched case-sensitively (the dev server and Pages both answer a miscased path with `index.html`, so a wrong folder case plays as silence); each track declares a plausible `durationS` (regenerated by `scripts/probe-music.mjs`), and the ambient loop is bundled too. |
| `musicPlan.test.ts` | The pure music planner: each fit (loop/once/finale) and the boundaries that are easy to get wrong — the finale lead-in gap, a song exactly the round's length, a song longer than the round (cut short, no seek), a late joiner syncing mid-track, and the past-the-deadline clamp. No Howler. |
| `serverClock.test.ts` | The clock-offset correction: `serverTime()` reports the server's wall clock, not the device's (so a skewed phone still agrees on the deadline), and a missing `serverNow` from an older Worker falls back to the local clock instead of `NaN`. |
| `samples.test.ts` | Every sample artwork's image and thumbnail names a bundled file, matched case-sensitively, and no two works share an id. A miscased file shows a broken tile and fails to decode; a duplicate id restores the wrong work. |

When you add a test, make it fail first: revert the fix it guards and check it goes red. Several of these were written that way, and two of them caught mutations that a green-only run would have missed. What the suite cannot reach is anything needing a real `getContext('2d')` — canvas rendering, the decode → crop → flatten → sample half of `processImage`, `hasTransparency` — or component behaviour. Verify those by driving the app in a browser.

## Conventions and structure

Every code and UI rule has one home, so this file doesn't repeat them:

- [`AGENTS.md`](./AGENTS.md) — code rules (imports, state, the server contract, comments) and the short form of the UI rules.
- [`docs/design-system.md`](./docs/design-system.md) — copy voice, colour, type, controls, surfaces and styling mechanics, with their reasons.
- [`docs/architecture.md`](./docs/architecture.md) — the source tree and how the pieces work together.
- [`party/README.md`](./party/README.md) — the realtime server.

> **IDE note:** style partials `@use` each other by **bare name** (`@use 'tokens'`), resolved via a sass `loadPaths` in `vite.config.ts`. An editor that doesn't read Vite's config (WebStorm, say) may flag these as *unresolved* — the build and CI resolve them fine. To teach the IDE the same paths, mark each `src/styles/` role folder (`foundation`, `mixins`, `base`, `components`, `screens`) as a **Resource Root** (WebStorm: right-click → *Mark Directory as → Resource Root*), or use your editor's equivalent load-path setting.

## Third-party assets & licences

Bundled assets and their obligations live in [`LICENSE.md`](./LICENSE.md):

- **Music** — self-hosted webm/Opus under `public/assets/audio/music/<category>/` (transcoded with `ffmpeg`, no CDN), in two dropdown groups: **upbeat** (Kevin MacLeod, **CC-BY 4.0**) and **classical** (Gregor Quendel — the classicals.de tracks are **CC BY-NC 4.0**, the Pixabay tracks the **Pixabay Content License**). CC-BY and CC BY-NC both need a *visible* credit, so every track is listed in-app under **Credits** in the settings menu, grouped by source (a game's credits screen is reasonable-manner attribution under CC 4.0; incompetech's FAQ confirms it for MacLeod). Note the **NonCommercial** classical tracks keep the bundle non-commercial — swap them for a commercial licence before any commercial use.
- **Fonts** — Fredoka, Space Grotesk, Plus Jakarta Sans under **SIL OFL 1.1**: ship the licence with the fonts, no in-app credit required.
- **Sample artworks** — public-domain paintings and prints from Wikimedia Commons (one CC0 file), under `public/assets/samples/` as WebP (~1024 px long side, a 683 px short-side floor for very wide works) with ~240 px thumbnails in `thumbs/`. No credit required; each work's Commons page is linked from the picker anyway.
- **Avatar faces** — DiceBear's "Notionists Neutral" style, **CC0**: no credit required, recorded in `LICENSE.md` anyway. DiceBear's code is MIT.
- **Dependencies + Lucide icons** — MIT/ISC: retain the notices (kept in `LICENSE.md`).

Adding an asset with an attribution or notice obligation? Record it in `LICENSE.md`; only if its licence needs a *visible* credit (CC-BY and CC BY-NC do; OFL/MIT/ISC don't) also add it to the Credits modal (`InfoModal.vue`).

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
2. **`pnpm wr:deploy` — but only if the server actually changed.** Check with `git diff <last-tag>..HEAD -- party/ src/lib/protocol/`. A Worker deploy **ends every game in progress**, so this is not a ritual: skip it when that diff is empty. When it is not empty, deploy *before* merging — the frontend inlines `VITE_PARTYKIT_HOST` at build time, and a newer server tolerates older clients while the reverse does not.
3. **Merge the Release PR.** That tags it, publishes the GitHub release, and deploys Pages.
4. **Close the milestone the release completes** — if it completes one.

Milestones name **themes, not versions**: `Image pipeline`, `Server refactor`, `Accessibility`, `Results Polish`, `Audio and more polish`, `Onboarding`, `1.0.0`. They are ordered by severity — the more severe the work, the earlier the release it lands in — but the version is never chosen, because release-please derives it from the commit types. So a milestone may span several releases, and a release may close none. An issue with no milestone is deliberately not scheduled; parked long-term work stays in `docs/.plans/` rather than sitting on the board looking actionable.

**Pre-1.0 a `feat` bumps the minor and a `!` never forces 1.0** (`bump-minor-pre-major`), so reaching 1.0 stays a deliberate act.

## Plans & issues

**[`docs/.plans/`](./docs/.plans/) is temporary working space** — design notes and in-flight planning for whatever's being built right now. When the work lands, its doc is moved to [`docs/.plans/archive/`](./docs/.plans/archive/) and kept as a dated record, not maintained; the standing plans were archived there on 2026-09-14. **[GitHub Issues](https://github.com/kspiteri/pixmaler/issues) own everything durable** — open work *and* its reasoning; file all new work as an issue, its body carrying the full "why" (see #66, #68, #69). [`AGENTS.md`](./AGENTS.md) and [`docs/`](./docs/) own how the code works. Deferred / post-1.0 work is indexed in [#70](https://github.com/kspiteri/pixmaler/issues/70).

Component is a label (`area:drawing`, `area:server`, `area:pipeline`, `area:a11y`, …) rather than a container, so an item spanning two areas carries both and closes as one unit. Priority is **which milestone it sits in**, ordered by severity not date; no milestone means unscheduled. Plan-item numbers cited in older titles (`[56] …`) resolve into the frozen archive — a closed namespace, **not** GitHub issue numbers (plan-item 33 is issue #69).

**Anyone can report a bug** through the form in [`.github/ISSUE_TEMPLATE/`](./.github/ISSUE_TEMPLATE/) — it asks for room code, phase, device and player count, because a playtest showed two of six reports were not what they first looked like for want of that context.