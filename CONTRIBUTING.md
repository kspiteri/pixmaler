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
pnpm wr:deploy    # deploy the realtime server to Cloudflare
```

## Code quality

**Lint + format** via `@antfu/eslint-config` (no separate Prettier) — config in `eslint.config.mjs`. Two local tweaks:

- `style/max-statements-per-line` relaxed to `max: 6` — grouped one-line variable inits are idiomatic in the algorithmic code.
- `no-alert` on, **with no inline exemptions** — the rule covers `confirm()` as well as `alert()`, and both have an in-UI replacement. `src/lib/dialog.ts` exposes `askAlert(message)` and `askConfirm(message)`; each returns a promise, so a guard reads `if (!await askConfirm('End voting now?')) return`. Requests queue into the one `AlertDialog.vue` instance mounted in `App.vue`, which renders acknowledge or yes/no from its `mode` prop (`'alert'` by default). Reach for the browser's dialogs only if you're prepared to explain why in the same commit that adds the disable.

The vendored `src/lib/vendor/` (pixelit) is ignored. Don't lint or reformat it.

Run `pnpm lint:fix` before committing. Most issues auto-fix.

**Git hooks** — `simple-git-hooks` + `lint-staged` run `eslint --fix` on staged files at pre-commit, installed by the `prepare` script on `pnpm install`. If they don't fire, run `pnpm exec simple-git-hooks`.

**Types** — `strict` is on. `pnpm build` runs `vue-tsc --noEmit` first, so a type error fails the build; `pnpm typecheck` also covers `party/` against Workers globals via `tsconfig.worker.json`. Keep the tree green.

## Conventions

- **British English** in user-facing strings, comments, and docs (`colour`, `behaviour`, `centre`). Identifiers mirroring DOM/web APIs stay as-is (`color` in CSS, `fillStyle` on canvas).
- **Vue 3 Composition API** with `<script setup>`. **Styling convention:** static, non-reactive styles live in per-screen partials (`src/styles/_<screen>.scss`) and shared primitives (`_alerts`, `_buttons`, `_forms`, `_logo`, `_phase`, `_surfaces`, `_tools-panel`), all `@use`d into `main.scss`; tokens in `_tokens.scss`. `_surfaces.scss`'s header is where the three surface roles are written down — artefact (a drawing), chrome (panels and inputs), person/choice (roster rows, vote cards) — and it owns the `.art-frame` / `.art-surface` pair that every finished drawing goes in. A component's scoped `<style>` is reserved for genuinely reactive or component-local rules — chiefly `:deep()` reaching imperatively-mounted `PixelCanvas` elements, which only works in a scoped block. The one unscoped exception is `Tagline.vue`'s `::view-transition` block: document-level pseudo-elements can't be scoped.
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
src/views/      # Entry, Paint, Taglines, and the phase screens
src/styles/     # _tokens + shared primitives + per-screen partials, all via main.scss
party/          # PartyServer Durable Object (server.ts); config in wrangler.jsonc
```

## Submitting changes

1. Branch off `main`.
2. Keep it focused.
3. Run `pnpm lint` and `pnpm typecheck`.
4. Verify in dev with **both** servers running. Test a reconnect (reload mid-game) if you touched anything stateful — and reload during **RESULTS** specifically, which used to strand the room (`13` item 54). If you touched a phase transition, also drive the two rounds that look like nothing: one where **nobody draws**, and one where people draw but **nobody votes**.
5. Open a PR describing what changed and how you verified it. Note protocol changes explicitly.

No test suite yet — manual verification against the dev servers is the bar. Describe what you tested. (Wiring a runner is [`13-technical.md`](./docs/.plans/13-technical.md) item 31, deliberately unscheduled.)

## Deploy

Two independent targets:

```bash
pnpm build      # → dist/, GitHub Pages serves under /pixmaler/ (CI does this on push to main)
pnpm wr:deploy  # realtime server → Cloudflare Workers
```

GitHub Pages is static-only and can't host the server. Set `VITE_PARTYKIT_HOST` at build time to the production host (`pixmaler.cold-hill-30d3.workers.dev`) so the deployed frontend talks to the deployed server — the value is inlined at build time, not read at runtime.

### Cutting a release

Three things carry the version and they drift silently if you only bump one — `package.json` sat at `0.1.0` while the tags were at `0.3.3`, which made the version-numbered milestones fiction for a while.

```bash
# 1. bump the manifest to the version you are about to cut
#    (edit package.json "version")
# 2. deploy both targets, since Pages and the Worker deploy separately
pnpm build && pnpm wr:deploy
# 3. tag it — the tag is what https://github.com/kspiteri/pixmaler/tags shows
git tag 0.3.4 && git push origin 0.3.4
```

Then **close the matching milestone** on GitHub. Milestones are version numbers (`0.3.4`, `0.4.0`, …), ordered by severity — the more severe the work, the earlier the release it lands in. An issue with no milestone is deliberately not scheduled; the parked long-term work stays in `docs/.plans/` rather than sitting on the board looking actionable.

Bump the **patch** for fixes inside the current line, the **minor** for a themed release with its own milestone. The roadmap as of `0.3.3`: `0.3.4` session and server robustness · `0.3.5` image pipeline correctness · `0.4.0` server refactor · `0.5.0` accessibility · `0.6.0` the reveal · `0.7.0` audio and polish · `1.0.0` personality pass.

## Plans

Working plans live in the gitignored [`docs/.plans/`](./docs/.plans/README.md). Three are standing: **01** is the general plan (architecture, state machine, pipeline, protocol, locked-in decisions), **13** is the only backlog for behaviour/data/server work, and **14** is the only backlog for anything visual. File new work accordingly — behaviour to `13`, pixels and copy to `14`, a game-rule change to `01`.

**15** is a transient register, not a fourth backlog: it holds the findings from a design critique and routes each into its owning plan. It archives once emptied. Item numbers are shared across all of them and never reused, so check `.plans/README.md` for the next free one before filing.

**[GitHub Issues](https://github.com/kspiteri/pixmaler/issues) own status; the plans own reasoning.** Adopted 2026-08-24. An issue says whether something is open, being worked on, or done. The plan says *why* — the measurements, the rejected alternatives, and the predictions that turned out wrong. An issue body is a summary plus a pointer into the plan; nothing in an issue should be the only copy of a decision.

Component is a label (`area:drawing`, `area:server`, `area:pipeline`, `area:a11y`, …) rather than a container, so an item spanning two areas carries both and still closes as one unit. Priority is a milestone (`1.0`, `post-1.0`, `deferred`). Issue titles carry the plan id in brackets — `[56] Clearing the canvas…` — because archived plans cite plan ids and those citations have to keep resolving.

Shipped items live in each plan's `NN-name.done.md` sibling, split out when closed work had grown to 52 % of the plans' prose. Items not yet migrated to Issues use positional status: in `NN-name.md` means open, in `NN-name.done.md` means shipped.

**Anyone can report a bug** through the form in [`.github/ISSUE_TEMPLATE/`](./.github/ISSUE_TEMPLATE/) — no need to know the codebase. It asks for room code, phase, device and player count, because the 2026-08-23 playtest showed two of six reports were not what they first looked like, purely for want of that context.
