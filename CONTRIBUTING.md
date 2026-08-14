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
- `no-alert` off — `alert()`/`confirm()` are placeholders pending the error-banner UI ([`13-technical.md`](./docs/.plans/13-technical.md) item 16, which re-enables the rule).

The vendored `src/lib/vendor/` (pixelit) is ignored. Don't lint or reformat it.

Run `pnpm lint:fix` before committing. Most issues auto-fix.

**Git hooks** — `simple-git-hooks` + `lint-staged` run `eslint --fix` on staged files at pre-commit, installed by the `prepare` script on `pnpm install`. If they don't fire, run `pnpm exec simple-git-hooks`.

**Types** — `strict` is on. `pnpm build` runs `vue-tsc --noEmit` first, so a type error fails the build; `pnpm typecheck` also covers `party/` against Workers globals via `tsconfig.worker.json`. Keep the tree green.

## Conventions

- **British English** in user-facing strings, comments, and docs (`colour`, `behaviour`, `centre`). Identifiers mirroring DOM/web APIs stay as-is (`color` in CSS, `fillStyle` on canvas).
- **Vue 3 Composition API** with `<script setup>`. **Styling convention:** static, non-reactive styles live in per-screen partials (`src/styles/_<screen>.scss`) and shared primitives (`_buttons`, `_forms`, `_logo`, `_phase`, `_tools-panel`), all `@use`d into `main.scss`; tokens in `_tokens.scss`. A component's scoped `<style>` is reserved for genuinely reactive or component-local rules — chiefly `:deep()` reaching imperatively-mounted `PixelCanvas` elements, which only works in a scoped block. The one unscoped exception is `Tagline.vue`'s `::view-transition` block: document-level pseudo-elements can't be scoped.
- **Inject infrastructure, prop data.** `socket` and `clientId` are `provide`/`inject`ed once at connection; reactive game state flows down as props. No Pinia.
- **`PixelCanvas` is imperative** — it owns its `<canvas>` and is instantiated in `onMounted`/watchers, not driven by reactivity.
- **The server is authoritative** for phase, timer, submissions, and votes. Client state is a view of the server's truth — derive from the latest `state` message rather than holding local state that can drift.
- **antfu gotcha:** `ts/no-use-before-define` — declare `useTemplateRef`/`ref`s *above* any `watch`/`computed` that references them.

## Structure

```
src/lib/        # canvas, image pipeline, shared types, taglines, layout helpers, composables
src/components/ # reusable UI (ImagePicker, CanvasPair, PaletteTools, PlayerList, PhaseLayout, Tagline, Logo)
src/views/      # Entry, Paint, Taglines, and the phase screens
src/styles/     # _tokens + shared primitives + per-screen partials, all via main.scss
party/          # PartyServer Durable Object (server.ts); config in wrangler.jsonc
```

## Submitting changes

1. Branch off `main`.
2. Keep it focused.
3. Run `pnpm lint` and `pnpm typecheck`.
4. Verify in dev with **both** servers running. Test a reconnect (reload mid-game) if you touched anything stateful.
5. Open a PR describing what changed and how you verified it. Note protocol changes explicitly.

No test suite yet — manual verification against the dev servers is the bar. Describe what you tested. (Wiring a runner is [`13-technical.md`](./docs/.plans/13-technical.md) item 31, deliberately unscheduled.)

## Deploy

Two independent targets:

```bash
pnpm build      # → dist/, GitHub Pages serves under /pixmaler/ (CI does this on push to main)
pnpm wr:deploy  # realtime server → Cloudflare Workers
```

GitHub Pages is static-only and can't host the server. Set `VITE_PARTYKIT_HOST` at build time to the production host (`pixmaler.cold-hill-30d3.workers.dev`) so the deployed frontend talks to the deployed server — the value is inlined at build time, not read at runtime.

## Plans

Working plans live in the gitignored [`docs/.plans/`](./docs/.plans/README.md). Three are active: **01** is the general plan (architecture, state machine, pipeline, protocol, locked-in decisions), **13** is the only backlog for behaviour/data/server work, and **14** is the only backlog for anything visual. File new work accordingly.
