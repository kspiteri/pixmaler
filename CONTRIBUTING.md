# Contributing

Small, single-package project. The workflow is light. This covers setup, tooling, and the conventions worth knowing before a PR.

## Setup

```bash
pnpm install               # installs deps + wires git hooks
pnpm dev                   # Vite frontend
pnpm dlx partykit dev      # realtime server on :1999 (separate terminal)
```

You need **both** servers to play — the frontend talks to PartyKit over a WebSocket. Set `VITE_PARTYKIT_HOST=127.0.0.1:1999` in dev.

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
pnpm dev          # Vite dev server
pnpm build        # type-check + production build
pnpm preview      # preview the built dist
pnpm typecheck    # vue-tsc --noEmit (no build)
pnpm lint         # eslint .
pnpm lint:fix     # eslint . --fix
```

## Code quality

**Lint + format** via `@antfu/eslint-config` (no separate Prettier) — config in `eslint.config.mjs`. Two local tweaks:

- `style/max-statements-per-line` relaxed to `max: 6` — grouped one-line variable inits are idiomatic in the algorithmic code.
- `no-alert` off — `alert()`/`confirm()` are placeholders pending the error-banner UI.

The vendored `src/lib/vendor/` (pixelit) is ignored. Don't lint or reformat it.

Run `pnpm lint:fix` before committing. Most issues auto-fix.

**Git hooks** — `simple-git-hooks` + `lint-staged` run `eslint --fix` on staged files at pre-commit, installed by the `prepare` script on `pnpm install`. If they don't fire, run `pnpm exec simple-git-hooks`.

**Types** — `strict` is on. `pnpm build` runs `vue-tsc --noEmit` first, so a type error fails the build. Keep the tree green.

## Conventions

- **British English** in user-facing strings, comments, and docs (`colour`, `behaviour`, `centre`). Identifiers mirroring DOM/web APIs stay as-is (`color` in CSS, `fillStyle` on canvas).
- **Vue 3 Composition API** with `<script setup>`. SCSS via `<style scoped lang="scss">` per component; shared tokens in `src/styles/_tokens.scss`, non-scoped rules only in `main.scss`.
- **Inject infrastructure, prop data.** `socket` and `clientId` are `provide`/`inject`ed once at connection; reactive game state flows down as props. No Pinia.
- **`PixelCanvas` is imperative** — it owns its `<canvas>` and is instantiated in `onMounted`/watchers, not driven by reactivity.
- **The server is authoritative** for phase, timer, submissions, and votes. Client state is a view of the server's truth — derive from the latest `state` message rather than holding local state that can drift.

## Structure

```
src/lib/        # canvas, image pipeline, shared types, composables
src/components/ # reusable UI (ImagePicker, CanvasPair, PlayerList)
src/views/      # Entry, Paint, and the phase screens
party/          # PartyKit Durable Object (server.ts)
```

The client↔server protocol is the shared contract in `src/lib/types.ts`, imported by both sides. Changing it means changing the client dispatcher (`App.vue`) and the server handlers (`party/server.ts`) together.

## Submitting changes

1. Branch off `main`.
2. Keep it focused.
3. Run `pnpm lint` and `pnpm typecheck`.
4. Verify in dev with **both** servers running. Test a reconnect (reload mid-game) if you touched anything stateful.
5. Open a PR describing what changed and how you verified it. Note protocol changes explicitly.

No test suite yet — manual verification against the dev servers is the bar. Describe what you tested.

## Deploy

Two independent targets:

```bash
pnpm build                 # → dist/, GitHub Pages serves under /pixmaler/
pnpm dlx partykit deploy   # realtime server → Cloudflare
```

GitHub Pages is static-only and can't host the PartyKit server. Set `VITE_PARTYKIT_HOST` at build time to the production PartyKit host so the deployed frontend talks to the deployed server.
