# AGENTS.md

Guidance for coding agents (and humans) working in this repository. This file holds the commands and the short-form rules; the detail lives in the docs it links. If a rule here and a deep doc ever disagree, the code is the truth — fix whichever doc is wrong.

**Pixmaler** (pixel + *maler*, Norwegian for "painter") is a real-time party game: the GM picks an image, it's quantised in the browser into limited-palette pixel art, players race a timer to redraw it on a matching pixel canvas, then everyone votes for the best attempts and the results are revealed. Vue 3 + TypeScript on GitHub Pages; the realtime server is a PartyServer Durable Object on Cloudflare.

## Where things are documented

| Doc | Owns |
|---|---|
| **AGENTS.md** (this file) | Commands, code rules, short-form UI rules, deploy order |
| [`docs/architecture.md`](./docs/architecture.md) | How it works: source tree, state flow, image pipeline, phases and deadlines, audio, identity and seats, room lifecycle |
| [`docs/design-system.md`](./docs/design-system.md) | How it looks and reads: copy voice, feedback, controls, colour, theme, type, surfaces, tilt, avatars, styling mechanics |
| [`party/README.md`](./party/README.md) | The realtime server: module map, wire protocol, alarm lifecycle, guards, configuration |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Workflow: setup, tooling, the test suite, commits, releases and deploys, licences |
| [`GLOSSARY.md`](./GLOSSARY.md) | Domain language: the canonical term for each concept and the words to avoid |
| [GitHub Issues](https://github.com/kspiteri/pixmaler/issues) | Open work and the reasoning behind decisions |

Read the deep doc for the area you're changing before you change it.

## Commands

```bash
pnpm dev          # Vite frontend on :7965
pnpm wr:dev       # realtime Worker on :1999 (run alongside pnpm dev)
pnpm dev:all      # Vite + Worker together; one Ctrl-C stops both
pnpm build        # type-check + production build (vue-tsc --noEmit && vite build)
pnpm preview      # preview the built dist
pnpm typecheck    # client + worker (vue-tsc --noEmit && tsc --noEmit -p tsconfig.worker.json)
pnpm lint         # ESLint (@antfu/eslint-config)
pnpm lint:fix     # ESLint with --fix
pnpm lint:css     # Stylelint, the colour-literal guard
pnpm test         # Vitest: Node suites + browser suites (Chromium, Firefox, WebKit)
pnpm test:unit    # Node suites only (what CI runs; no browser)
pnpm wr:deploy    # deploy the Worker (ends every live game, see Deployment)
pnpm release      # gate, deploy-if-changed, merge the Release PR, name it (prompts)
pnpm bots         # fill a local room with test players (--room=<code> --count=5)
```

## Local setup

- **Both servers are needed to play** — `pnpm dev:all` runs both (or `pnpm dev` + `pnpm wr:dev` in two terminals); `/pixmaler/paint` (Free mode) needs only `pnpm dev`.
- **`.env.local`** (Vite) sets `VITE_PARTYKIT_HOST=127.0.0.1:1999`. The variable keeps its historical name; there is no `partykit` dependency or `partykit.json`, the server runs on PartyServer + `wrangler` (`wrangler.jsonc`).
- **`.dev.vars`** (auto-loaded by `wrangler dev`) sets `PIXMALER_DEV=1`, which lifts the server's "two players besides the GM" start gate and its origin allowlist, so a whole round can be driven solo. A `PIXMALER_DEV` line in `.env.local` does nothing; Vite only exposes `VITE_`-prefixed variables. Never deploy either file.
- **Bots:** `pnpm bots --room=<code> --count=5` fills a local room (details in `CONTRIBUTING.md`).
- **Browser-mode tests:** `pnpm test` runs browser suites across Chromium, Firefox and WebKit, so a fresh clone needs `pnpm exec playwright install chromium firefox webkit` once; `pnpm test:unit` skips them.
- **Server changes not picked up?** Look for a stale process on the port: `lsof -nP -iTCP:1999 -sTCP:LISTEN`.

## Before you call it done

- **Gates:** `pnpm lint`, `pnpm lint:css`, `pnpm typecheck`, `pnpm test`. CI (`ci.yml`) runs the same but with `pnpm test:unit` (Node only — the browser suites need the browser engines and run on your `pnpm test`), plus a build and a `wrangler deploy --dry-run` on every push and PR.
- **The pre-commit hook** (`simple-git-hooks` + `lint-staged`) runs `eslint --fix` on staged files and Stylelint on staged `.scss`/`.vue`, and aborts the commit on any error.
- **Commits are [Conventional Commits](https://www.conventionalcommits.org)**, enforced by `scripts/commit-msg.mjs`. release-please derives the version and changelog from the types, so an unparseable message drops out of both.
- **Any change under `party/`** (a handler, a phase transition, the tally, the state shape) must run `test/smoke.test.ts`, and update it only when the path's shape genuinely changes, never to pin broken behaviour.
- **The Node suite is DOM-free**, verified without a browser; browser-mode suites (`test/browser/`, run across Chromium/Firefox/WebKit) cover the canvas and its tools, the image pipeline's browser half, the pointer/keyboard widgets and the PNG/share-card exports. Full-screen component flows and anything spanning the server are still verified by driving the app in a browser. Anything stateful also needs both servers and a real reconnect (reload mid-game, including during RESULTS).

## Code rules

### TypeScript and Vue

- **Vue 3 Composition API with `<script setup>`**, TypeScript `strict`. Don't reach for Pinia.
- **`ts/no-use-before-define`** (antfu) bites often: declare `useTemplateRef`/`ref`s *above* any `watch`/`computed` that reads them.
- **Cross-tree imports use the `@` alias** (`@/lib`, `@/components/<role>/X.vue`, `@/views/…`), never `../../`. Same-directory siblings stay relative (`./Sibling.vue`).
- **Consumers import `lib/` through its barrel** (`import { … } from '@/lib'`). Inside `src/lib/`, modules import each other directly by relative path, never through the barrel, to avoid cycles.
- **The Worker never imports the client barrel.** It imports the DOM-free `src/lib/protocol` barrel (plus specific DOM-free modules such as `content/words`). The client barrel re-exports modules that touch `localStorage` on load, which breaks the Workers and Vitest builds.
- **Components are grouped by role:** `elements/` (generic primitives), `layout/` (app shell and header furniture), `game/` (gameplay). Screens import game components from the `@/components/game` barrel and never name its sub-folders.
- **No `alert()` or `confirm()`.** `no-alert` is an ESLint error with no exemptions; use `askAlert` / `askConfirm` from `lib/dialog.ts` (see the design system for how a confirm is worded).

### State and the server

- **The server is authoritative** for phase, timer, submissions and votes. Client state is a view of the latest server message; don't hold local state that can drift from it.
- **Inject infrastructure, prop data.** The socket (a `ShallowRef<PartySocket | null>`) and `clientId` are `provide`d by `useRoom` (keys in `lib/keys.ts`); reactive game state flows down from `App.vue` as props.
- **Replaced-wholesale state is a `shallowRef`.** `state`, `gallery`, `results`, `voteState`, `drawState` and `targetGrid` are swapped whole on each server message, so nothing deep-watches them.
- **`PixelCanvas` is imperative.** Instantiate it in `onMounted` or a watcher and append its `<canvas>` into a template ref; never drive it through reactivity.
- **Trap: function-form `:ref` timing.** To read DOM that a `v-for` with `:ref="el => setSlot(id, el)"` just rendered, `await nextTick()` twice rather than relying on `flush: 'post'`; Vue doesn't order those callbacks against post-flush watchers.
- **Submitted grids keep `-1` for untouched cells.** Read-only renderers draw `-1` as transparent so the paper shows through; don't coerce it to palette index 0. Exports (`lib/export/png.ts`, the share card) deliberately flatten `-1` onto `--paper`.
- **The deadline can change mid-phase** (the GM's +15s). Anything that reads `state.deadline` must react to it changing, not snapshot it.
- **Broadcast the payload before the phase flip.** `endDrawing` sends `gallery` then `phase`, `endVoting` sends `results` then `phase`; flipping first mounts the next screen against the previous round's payload. A new data-carrying phase follows the same order.
- **Per-round client state is cleared when DRAWING starts**, in the `phase` handler of `lib/composables/useRoom/messages.ts`. Anything new you cache from a server message belongs in that reset.
- **The wire protocol lives in `src/lib/protocol/`** and is shared by both sides. Validators such as `normaliseShape` are the single implementation, run by the server on everything inbound and again on the client's read side. A protocol change ships the Worker first (see Deployment).

### Comments

- **Comments say what, not why; git holds the why.** A file may open with a short header (what it is, its main responsibilities, at most one non-obvious constraint), never a history or an essay. Inline comments are one line, two at most, and go entirely when the code reads clearly.
- **Strip on sight:** issue numbers, references to the gitignored `docs/.plans/` and their item ids, and example player names. Hex values, `eslint-disable` / `@ts-` directives and references to real source files are not prose and stay.
- **The one comment that earns its length is a trap:** a platform quirk, a timing gotcha, an ordering hazard or an a11y invariant that isn't evident from the code. Keep those, one line each.

## UI rules (short form)

The full rules, with their reasons, are in [`docs/design-system.md`](./docs/design-system.md).

- **British English** in user-facing strings, comments and docs (`colour`, `behaviour`, `centre`). Identifiers that mirror web APIs stay as they are (`color` in CSS, `fillStyle`).
- **Copy sits in three bands.** *Flavour* (the game's voice: lowercase, dry) for idle, empty, waiting and roll-call states. *Explanatory* (clear, light touch) for status lines and spectator notes. *Direct* (plain, Sentence case) for instructions, labels, errors, GM controls, Settings and dialogs; instructions never joke. In player-facing copy: no em-dashes, and no exclamation marks except `ready!`. Status lines are fixed strings; a `Tagline` picks at most one line per mount and never rotates.
- **A confirm names its action** ("End voting" / "Keep voting"), never OK/Cancel. A condition that clears itself is a notice (`AlertNotice`), not a dialog.
- **Every button is `Button.vue`.** A control that isn't a `Button` (switch, segmented radio, selection grid) opts into the press with `.pressable`, or it is dead to the touch with nothing to flag it.
- **Use the shared component, never hand-roll its markup:** `PlayerTag` for a chip beside a name, `Avatar` for any `.avatar`, `NameField` for any display-name input, `RoomInterstitial` for any off-game room screen, `ToggleSwitch` for on/off, `Slider` for ranges, `AlertNotice` / `AlertDialog` for feedback.
- **Colour values live in two files only.** `src/styles/foundation/_theme.scss` writes the theme-varying values; `_tokens.scss` names them and holds the few fixed literals (the lime and purple fills, their deep shades, the seat ramp). Everywhere else references a token: Stylelint fails the build on a literal. Derive an alpha with `color-mix()` on a token; no Sass colour functions.
- **Lime means "go" or "chosen"** (the primary CTA; what a player picked or earned) and nothing else; the wordmark and the seat chip on a Paint share card are brand lime, not UI. Purple means the GM or the secondary button. Lime or purple as text or a line uses the `-ink` token (`$accent-ink`, `$primary-ink`), because the bright fills fail contrast on the light theme.
- **Font sizes go through `$fs-*` tokens** (or `fs()`), never a literal `rem`, so they follow the text-size setting.
- **Radius and depth are fixed ladders:** radius `$radius-sm`/`$radius`/`$radius-lg`/`$radius-xl` (2/4/6/8 px, near-square); shadows `$shadow-1`, `$shadow-2`/`$shadow-2-up`, `$shadow-press`. Artwork takes no radius.
- **Tilts use the standalone `rotate`/`translate` properties, never `transform`** (the press owns `transform`), and are deterministic (`:nth-child` or a value derived from the player), never random: server pushes would re-roll a random angle.
- **Never render an avatar in VOTING.** That gallery is anonymous on purpose.
- **Winner confetti goes through `lib/confetti.ts`** (#43): the one place celebratory bursts are fired, lazy-imported on RESULTS (and the dev `/components` demo), skipped under reduced motion, built from our square confetti and award icons — **never native emoji**.
- **No third-party runtime requests.** Fonts are self-hosted woff2 and avatar faces are generated locally; never add a CDN font or call DiceBear's HTTP API.

## Architecture at a glance

Full picture in [`docs/architecture.md`](./docs/architecture.md); server internals in [`party/README.md`](./party/README.md).

```
src/lib/          domain modules behind the @/lib barrel: protocol/ canvas/ composables/ prefs/ player/ content/ export/
src/components/   elements/ · layout/ · game/ (behind the @/components/game barrel)
src/views/        Entry, Paint, dev pages, phases/ (the four game screens), rooms/ (name gate + refusals)
src/styles/       foundation/ · mixins/ · base/ · components/ · screens/ + main.scss
party/            the PartyServer Durable Object (config in wrangler.jsonc)
test/             Vitest suites; the fake room context lives in test/support/
```

- **Phases:** `LOBBY → DRAWING → VOTING → RESULTS`, server-authoritative and deadline-driven. Deadlines and the room lifecycle run off a single Durable Object alarm.
- **Rooms** are keyed by a word-pair code and created only by explicit intent; connecting to an unknown code gets `no-such-room`, never a new room.
- **Players** are keyed by a localStorage `clientId`, and a reconnect reclaims the seat with a per-room seat secret. A player's seat colour is their index in `state.players`.
- **No server image processing.** The GM's browser does all the pixelation; only the compact grid and palette cross the wire.

## Deployment

- **Pages deploys itself; the Worker is deployed by hand.** release-please keeps a Release PR open; merging it tags, publishes and deploys Pages only. The Worker ships with `pnpm wr:deploy` from the maintainer's machine.
- **A Worker deploy ends every game in progress**: room state is in memory, and Durable Object storage holds only the alarm.
- **Deploy the Worker before merging the Release PR.** The frontend inlines `VITE_PARTYKIT_HOST` at build time, and a newer server tolerates older clients while the reverse doesn't.
- **`pnpm release` automates the flow:** gates (incl. build + worker dry-run), then the Worker deploy *only if it changed*, the Release PR merge, watching the run, naming the release, and finally a fast-forward `git pull` so local main picks up the bot's version bump — prompting before each destructive step (`--yes` skips; `--theme "…"` presets the name).
- **GitHub Pages is static-only** and serves the app under `base: '/pixmaler/'`.

The full release procedure is in `CONTRIBUTING.md`.

## Keep the docs current

Update the docs a change touches in the same batch; it's part of done, not a follow-up.

- **AGENTS.md** — a new command, a new code rule or a changed short-form rule.
- **docs/architecture.md** — a new subsystem, a moved file (the source tree), a changed data flow.
- **docs/design-system.md** — a new token, component pattern or visual convention.
- **party/README.md** — anything under `party/` or the wire protocol.
- **CONTRIBUTING.md** — the test suite table and counts, a new tool or workflow step, the licences list.
- **README.md** — a player-facing capability or a stack entry.
- **GLOSSARY.md** — a domain term settled or renamed.
- **LICENSE.md** — any bundled third-party asset, and whether it needs a visible in-app credit.

## Agent skills

### Issue tracker

GitHub Issues on `kspiteri/pixmaler`, via the `gh` CLI; no triage labels, existing issues are updated in place. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` plus `docs/adr/`, created when needed. See `docs/agents/domain.md`.
