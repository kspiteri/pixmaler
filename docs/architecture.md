# Architecture

How Pixmaler works: the stack, the source tree, how room state reaches the screens, the image pipeline, Free mode, phases and deadlines, audio, identity and seats, and room creation. [`AGENTS.md`](../AGENTS.md) holds the short-form rules this expands on; how things look and read is in [`design-system.md`](./design-system.md), and the realtime server's internals in [`party/README.md`](../party/README.md).

## Stack

- **Frontend:** Vite + Vue 3 (`<script setup>`) + TypeScript + SCSS, a static build on GitHub Pages under `base: '/pixmaler/'` ([`vite.config.ts`](../vite.config.ts)).
- **Realtime backend:** a PartyServer Durable Object on Cloudflare Workers ([`wrangler.jsonc`](../wrangler.jsonc)). One room = one DO instance, keyed by a `{word}-{word}` code. The server is authoritative for phase, timer, submissions and the tally; deadlines and the room lifecycle run off a **single DO alarm**, never `setTimeout`.
- **Transport:** `partysocket` (auto-reconnect). Players are keyed by a localStorage `clientId`; a reconnect reclaims its seat by echoing the per-room seat secret the server issued on first join.
- **No server image processing.** The GM's browser pixelates; only the grid and palette cross the wire.

## Source tree

`@` resolves to `src/` (Vite `resolve.alias` + `tsconfig.json` `paths`). Sass partials `@use` each other by bare name, resolved by `loadPaths` in `vite.config.ts`; an editor that doesn't read Vite's config may flag them as unresolved — mark each `src/styles/` role folder as a resource/load path.

```
src/
├── main.ts                    # mounts App + main.scss
├── App.vue                    # router (entry / paint / room + dev routes); feeds useRoom state to the phase views
├── lib/                       # consumers import through the barrel: `@/lib`
│   ├── index.ts               # client barrel (never imported by the Worker)
│   ├── keys.ts                # InjectionKeys: socketKey, clientIdKey
│   ├── dialog.ts              # askAlert / askConfirm — the app-global modal queue
│   ├── announce.ts            # polite + assertive sr-only regions for messages with no visible home
│   ├── infoModal.ts           # Credits/Privacy modal state (activeInfo, openCredits, openPrivacy)
│   ├── appLayout.ts           # shared viewport facts (isMobile, paletteHeight)
│   ├── assets.ts              # asset() / appHref() against Vite's base
│   ├── storage.ts             # guarded localStorage; not in the barrel, lib modules import it directly
│   ├── audio.ts               # Howler engine: sfx sprite, music channel + transport, toggles, error/widget state
│   ├── audio.gate.ts          # pure shouldPlay: channel gate + repeat throttle
│   ├── confetti.ts            # winner-reveal burst (#43): emoji-blast wrapper, lazy-loaded, not in the barrel
│   ├── protocol/              # types.ts (wire types + validators) · protocol.ts (parseClientMsg) · index.ts (DOM-free Worker barrel)
│   ├── canvas/                # pixel.ts (PixelCanvas) · grid.ts (cell geometry) · tools.ts (swatch/brush DOM)
│   │                          # pipeline.ts · palette.ts (colour science) · aspect.ts (ratios, crop, orientation)
│   │   └── quantisers/        # median (Bold) · wu (Balanced) · kmeans (Faithful) + registry; metrics.ts dev-only, not re-exported
│   ├── export/                # png.ts (grid → paper-flattened PNG) · card.ts (share card layout + render)
│   │                          # deliver.ts (share sheet vs download) · filename.ts; chip.ts (seat chip on a canvas) internal, not in the barrel
│   ├── composables/
│   │   ├── useRoom/           # index.ts (socket, name gate, provide) · messages.ts (reducer) · gate.ts (existence probe, tab lock)
│   │   ├── useDrawSubmit.ts   # DRAWING auto-submit, deadline submit, rAF countdown
│   │   ├── useReadonlyCanvases.ts # read-only canvases into :ref slots (Results)
│   │   ├── useSalonWall.ts    # salon-wall layout engine (VOTING)
│   │   ├── useGmActions.ts    # GM confirm-and-send actions
│   │   ├── useMusic.ts        # phase-driven background music
│   │   ├── countdown.ts       # milestone-only countdown announcements
│   │   └── useCanvasShortcuts.ts · useOrientation.ts · useDraggable.ts
│   ├── prefs/                 # theme · textScale · motion · touch · shortcuts · palette · paintSession
│   ├── player/                # identity (identity keys, clearAllData) · seats (seatFor) · face (DiceBear: chip mask + share card data URI)
│   └── content/               # words (codes, isRoomCode, formatRoomInput) · taglines · music (manifest + credits) · samples (artwork manifest) · heroArt
├── assets/fonts/              # self-hosted woff2
├── components/
│   ├── elements/              # primitives
│   │   ├── AlertDialog.vue    # the one modal (askAlert / askConfirm)
│   │   ├── AlertNotice.vue    # non-blocking notice; dismissable or host-controlled
│   │   ├── InfoModal.vue      # global Credits/Privacy modal
│   │   ├── Button.vue         # the one button; <a> when href
│   │   ├── ToggleSwitch.vue   # generic two-state switch
│   │   ├── ThemeToggle.vue    # dark/light ToggleSwitch binding
│   │   ├── Slider.vue         # the one range slider, continuous or stepped
│   │   ├── Disclosure.vue     # labelled tap-to-reveal toggle
│   │   ├── accordion/         # Accordion.vue + Item.vue (single-open, via key.ts)
│   │   ├── NameField.vue      # display-name field; v-model:shape adds avatar preview + picker
│   │   ├── Avatar.vue         # the seat chip; sole writer of `.avatar`
│   │   ├── AvatarPicker.vue   # avatar-shape buttons (inside NameField)
│   │   ├── PlayerTag.vue      # seat chip + name as one unit
│   │   ├── Tagline.vue        # one subtitle per mount, never rotates
│   │   └── Logo.vue           # PIX/MALER wordmark
│   ├── layout/
│   │   ├── PhaseLayout.vue    # in-room shell: status bar, progress bar, body
│   │   ├── PhaseBoundary.vue  # error boundary for the phase views
│   │   ├── SettingsMenu.vue   # header gear + settings dropdown
│   │   └── RoomInterstitial.vue # shell for every off-game room screen
│   └── game/                  # index.ts barrel: DrawBoard · ExportButton · GmControls · ImagePicker · MusicWidget
│       │                      #   PixelThumb · PlayerList · SalonWall · VotingCloseup
│       ├── image/ImagePicker.vue # picker orchestrator (lobby + /paint)
│       ├── image/picker/      # SourcePicker · TargetPreview · CropWidget · DetailControl · PixelationStyleControl
│       │                      # ColourControl · AlphaControl · TimerControl · MusicControl · stops.ts
│       ├── canvas/            # DrawBoard.vue (target + editable pair) · PaletteTools.vue (tools panel, internal)
│       │   └── palette/       # Header · PlacementControl · SizeControl · Shortcuts
│       ├── lobby/             # GmControls.vue (picker + Start gate) · PlayerList.vue (roster, Make GM, Remove)
│       ├── shared/            # GameIcon.vue (award SVGs) · MusicWidget.vue (header transport) · PixelThumb.vue · ExportButton.vue (Save / Share + tick)
│       └── voting/            # SalonWall.vue · VotingCloseup.vue (awards cast here) · SalonFrame.vue (internal)
├── views/
│   ├── Entry.vue              # landing: Start / join by code / Free mode
│   ├── entry/                 # Door.vue · JoinForm.vue (code field + existence probe)
│   ├── Paint.vue              # /paint sandbox
│   ├── Taglines.vue           # /taglines, hidden
│   ├── Components.vue         # /components, dev-only gallery; demos in components/
│   ├── Quantise.vue           # /quantise, dev-only quantiser comparison
│   ├── phases/                # Lobby · Drawing · Voting · Results
│   └── rooms/                 # NameGate · RoomFull · NoSuchRoom · DuplicateTab · SessionClosed
└── styles/                    # main.scss + foundation/ · mixins/ · base/ · components/ · screens/
```

Elsewhere: `party/` (server), `test/` (Vitest; fake room context in `test/support/room.ts`), `public/assets/` (`samples/<id>.webp` + `samples/thumbs/<id>.webp`, `audio/sfx.wav`, `audio/music/<category>/*.webm`), `scripts/` (`commit-msg.mjs`, `testbots.mjs`). `/components` and `/quantise` resolve only under `import.meta.env.DEV` and are imported conditionally, so they drop out of production; `/taglines` ships unlinked.

## State flow

`useRoom` (`lib/composables/useRoom/`), called once by `App.vue`, owns the socket and dispatch; off the room route it gets `null` and stays inert. The shared rules (inject infrastructure / prop data, `shallowRef`, the DRAWING reset in `messages.ts`) are in AGENTS.md.

- **The socket key holds a `ShallowRef<PartySocket | null>`**, because the connection waits behind the name gate. It's non-null once a phase view mounts, so views read `inject(socketKey)!.value!`.
- **Props, not just `state`:** `App.vue` passes `state`, `gallery`, `results`, `voteState`, `drawState`, `targetGrid` and the notice flags to the views that need them. The target grid arrives as its own `target` message, since `state` doesn't carry it, and is dropped when `config` goes null.
- **`messages.ts` is where the protocol grows** — a new server message is a new case in `applyServerMessage`. The seat secret (`session`) is identity, so `useRoom` persists it instead.
- **Trap: terminal messages set their flag *before* closing.** `session-closed`, `room-full` and `no-such-room` flip their flag, then `socket.close()`, so the `close` handler knows it was deliberate; otherwise partysocket reconnects into a pristine room as its new GM, or "Reconnecting…" covers the terminal screen.
- **Spectating** (joined mid-round) is derived from `state.players`, not tracked.
- **One live tab per room.** Tabs share the `clientId`, so `acquireRoomTab` takes a Web Lock (`pixmaler:room:<code>`); a second tab shows `DuplicateTab` and takes over when the first closes. Without `navigator.locks` every tab is allowed.
- **`PixelCanvas`** is instantiated by `DrawBoard`, `PixelThumb`, `TargetPreview` and `useReadonlyCanvases`; the last holds the double-`nextTick` `:ref` pattern.

## Image pipeline

[`lib/canvas/pipeline.ts`](../src/lib/canvas/pipeline.ts): decode → crop to the ratio → normalise the crop to 768 px on its long side, scaling up or down (`SOURCE_MAX_SIDE`, so Detail gives the same grid for every upload and every crop) → flatten onto the background colour → downscale straight to `gridW × gridH` → derive a palette with the chosen quantiser → merge near-duplicates → nearest-entry per cell → sort the swatch.

- **Trap: flatten before sampling.** `getImageData` reports transparent pixels as black and the quantiser reads no alpha, so an unflattened transparent region turns black. `AlphaControl` picks the background.
- **Quantiser by outcome:** Bold (median cut), Balanced (Wu, default), Faithful (k-means), registered in `quantisers/index.ts`. `/quantise` compares them on one shared `sampleImage`. Each style also carries its own `mergeUnit` — the near-duplicate merge the pipeline runs after the quantiser (Bold 16, Balanced 12, Faithful 8 RGB units): Bold merges hardest so it flattens to punchy colours, Faithful least so it keeps its fine shades. So the style, not an all-or-nothing toggle, sets how aggressively barely-distinguishable colours collapse.
- **Classics are swatch-only.** The target uses only derived colours; `withClassics` tops the swatch up toward the colour count with classics far enough from every derived colour. Derived colours stay first so target indices hold; `paletteSortOrder` then reorders and remaps.
- **Aim for recognisable but redrawable**, not faithful. Dithering, despeckle and edge detection were found unnecessary for this look; don't add them without a reason.

### Three ways to pick the palette

All three quantisers take the same input — the downscaled grid as a cloud of RGB pixels — and
return the same thing: `count` colours. They differ only in *how* they choose them. (The
near-duplicate merge and the classics top-up happen afterwards and are shared.)

**Bold — median cut.** Split the biggest box in half, over and over.

```
  0.  ┌─────────────────┐
      └─────────────────┘   one box holds every pixel

  1.  ┌────────┬────────┐   halve the widest channel (R, G or B) at the median
      └────────┴────────┘   pixel, so the two halves hold equal pixel counts

  2.  ┌───┬────┬────────┐   then split whichever box carries the most
      └───┴────┴────────┘   pixels × colour-spread…

  3.  ┌───┬──┬─┬────┬───┐   …until there are `count` boxes → average each box
      └───┴──┴─┴────┴───┘
```

Fast and blunt: it balances pixel *counts*, not how tight each cluster is, so it leans toward
fewer, punchier colours — which is why Bold also merges hardest afterwards (16 units).

**Balanced — Wu.** Cut where it shrinks the scatter the most.

```
  0.  ┌─────────────────┐   the cloud, binned into a 5-bit (33³) histogram
      └─────────────────┘

  1.  ┌──┬──────────────┐   cut at the spot that most reduces the combined
      └──┴──────────────┘   spread of the two halves — not the median

  2.  ┌──┬─────┬────────┐   always take the cut with the biggest variance
      └──┴─────┴────────┘   drop, so the boxes hug the clusters…

  3.  ┌──┬───┬──┬───┬───┐   → weighted mean of each box. deterministic, no RNG
      └──┴───┴──┴───┴───┘
```

A fuller, more even mix than median cut at the same count (merges at 12 units).

**Faithful — k-means.** Drop K points and let them drift to the crowds.

```
  seed K centres, spread apart          reassign + recentre, repeat (≤ 12×)

    ·  ·×·   ·  ·×· ·                      ·  ×· ·   · ·×· ·        each × slides to
   ··  ·  ·× ··  ·  ·×          ──▶       ·· ·  ×·· ·  · ×·    ──▶  the mean of the
    ·×·· ·  ·· ×·· ·  ·                    ×·· ·  · ×·· ·  ·        pixels nearest it
```

k-means++ picks the seeds far apart (each new one favoured by its squared distance from the
nearest existing seed); Lloyd's loop then settles them. Slowest, but the points land on the true
centres of colour — the subtlest, richest result, so it merges least (8 units).

| Style | Cuts by… | Look | `mergeUnit` |
|---|---|---|---|
| **Bold** (median cut) | equal pixel count | punchy, flat | 16 |
| **Balanced** (Wu) | least variance | full, even | 12 |
| **Faithful** (k-means) | drifting centres | subtle, rich | 8 |

## Free mode (`/paint`)

`ImagePicker` tracks the **committed inputs** — source, sample and settings behind its last emitted result — and reprocesses only when the inputs differ, so re-clicking the loaded sample or nudging a control back emits nothing. Two props are Paint-only:

- **`confirmResult`** is awaited before emitting; `false` reverts the picker to the committed inputs, so picker and canvas never disagree. Paint asks only when the player has painted and `keepsDrawing` (same grid size, identical palette) is false.
- **`restore`** rebuilds the picker around a stored result without emitting. `prefs/paintSession.ts` persists result, `PickerMeta` (`sample`, `settings`) and drawing in `pixmaler:paintSession`; a session lacking meta still restores the drawing. A sample is re-fetched on restore; an upload can't be, so it must be re-chosen to adjust.
- **Trap: the canvas pair unmounts while Settings is open** and remounts from `seedGrid`. Paint refreshes `seedGrid` from the live drawing when the panel opens and on every accepted result; seeding from the load-time grid silently discards every stroke since the last reload.
- Free mode's music comes from the picker's Music step and isn't persisted.
- **Samples** come from [`lib/content/samples.ts`](../src/lib/content/samples.ts): id → title, artist, year, origin, category, Commons `credit`, pixel `dims`. `SourcePicker` groups them by category, shows the ~240 px WebP thumbnails (lazy, sized from `dims` before they load), and the picker `fetch`es the full `<id>.webp` only on selection. `PickerMeta.sample` stores the id, and everything else is looked up with `sampleById`, so a stored session never carries stale metadata. A fresh `/paint` opens on the picker with no image.

## Phases and deadlines

`LOBBY → DRAWING → VOTING → RESULTS → LOBBY`. The server broadcasts deadline timestamps; clients tick against `Date.now()`. Phase rules, the alarm and the payload-before-phase-flip ordering are in [`party/README.md`](../party/README.md).

- **Start gate.** `handleStart` (`party/phases.ts`) needs ≥2 connected non-GM players unless `PIXMALER_DEV=1`. `GmControls.vue` mirrors it with a disabled Start and a "need N more players" hint; `import.meta.env.DEV` lifts only the disabling, and the hint gains "(ignored in dev)" so the bypassed gate stays visible. `pnpm preview` against a local worker is the one mismatch (production bundle gates, dev server doesn't); the server stays authoritative.
- **The deadline moves.** The GM's +15 s (`gm:extendTime`) bumps `state.deadline` and `state.roundSeconds`, up to `MAX_EXTENSIONS` (2); `extensionsLeft` decides whether the button shows. `onMessage` re-arms the alarm after every message, so nothing re-arms it explicitly.
- **React to the deadline, never snapshot it.** `useDrawSubmit` re-arms its countdown and deadline submit from a `watch`, and its rAF tick reads the live value each frame; `Voting.vue` watches its `deadline` prop.
- **Progress divides by `roundSeconds`**, the current length; `config.drawSeconds` is only the configured start, and dividing by it pins the bar at 100 % after an extension. The timer flashes when `roundSeconds` grows, so the jump reads as a decision.
- **DRAWING submits continuously:** a throttled, deduped `draw:submit` — a 500 ms trailing send, and at least once a second while the canvas keeps changing — plus one sent just before the deadline so it lands before the phase flips to VOTING. "Done" is a social signal, and the canvas is never locked client-side — only the server's move to VOTING ends the round.
- **Countdown colour** goes `--timer-ok` → `--timer-warn` (≤40 s) → `--timer-danger` (≤20 s); the blank-canvas warning shows only in that last 20 s. Screen readers hear milestones (60/30/10/5…1), never every second.

## Audio

[`lib/audio.ts`](../src/lib/audio.ts) is a module singleton like `prefs/theme.ts`: one Howler context, one sprite, one set of prefs per document. Nothing else imports Howler.

- **SFX:** one preloaded sprite, `public/assets/audio/sfx.wav`, holding only `click` (120 ms mono 48 kHz, lead-in trimmed so the press sounds at once). Keep clips WAV — MP3 encoder padding delays the onset. `SfxKey` types the whole shot list; `playSfx` no-ops on a key with no clip yet. Howler's `autoUnlock` is the autoplay gate.
- **`Button`** plays `click` on a primary press; `sfx` overrides the key (any variant), `silent` mutes that instance.
- **Three per-device toggles**, `music` · `sfx` · `ticktock`, in `pixmaler:audio`. Settings shows Music and Sound effects; the ticktock switch stays commented out until `tick`/`tock` clips exist. [`audio.gate.ts`](../src/lib/audio.gate.ts) routes `tick`/`tock` to `ticktock`, the rest to `sfx`, with a 150 ms per-key throttle, and tests without Howler.
- **Music is a round setting:** `musicTrack` on `RoundConfig`, picked in the Game-settings step (`MusicControl`, None by default), sent with `gm:configure`, and validated by `normaliseMusicTrack` against the DOM-free `MUSIC_TRACK_IDS` on both sides. `useMusic` plays it when the room leaves LOBBY (including for a mid-round joiner), carries it through VOTING and RESULTS without restarting, and stops on LOBBY and on session close. Tracks stream (`html5: true`), loop and fade in over 2 s.
- **Manifest:** [`lib/content/music.ts`](../src/lib/content/music.ts) maps id → label, category, credit. Category is the dropdown group and, lowercased, the subfolder under `public/assets/audio/music/` (`upbeat`, `classical`; webm/Opus). **Trap:** `trackSrc` must lowercase it — a miscased path gets `index.html` from both the dev server and Pages and plays as silence with no error. `test/music.test.ts` checks every track against the real files case-sensitively.
- **Credits** ride the manifest (`MUSIC_CREDIT_GROUPS`) into [`LICENSE.md`](../LICENSE.md) and the Credits modal: Kevin MacLeod (CC BY 4.0) for upbeat; Gregor Quendel for classical via classicals.de (CC BY-NC 4.0) and Pixabay (Pixabay Content License). CC BY and BY-NC need a visible credit; the NonCommercial tracks keep the bundle non-commercial.
- **`lib/infoModal.ts` + `InfoModal.vue`** are the one Credits/Privacy modal: `openCredits()` / `openPrivacy()` set `activeInfo`, and `App.vue` mounts it with `v-if` outside the phase chain.
- **`MusicWidget`** shows in the header while a track plays or has failed. Play/pause is transport, independent of the Music toggle (the master enable). A chevron reveals title and volume — inline to the left on desktop, so no button moves under the pointer; a popover under `$bp-mobile` that closes on an outside pointer or Escape (focus returns to the chevron). `musicControlsOpen` is module-level and session-only, so it survives per-phase headers. A playing track pulses the border (`.music-widget--playing`, static under reduced motion) so the room can tell which device is playing.
- **Failures are visible.** `onloaderror` stops the track and sets `musicError` (cleared by the next play or any stop); the widget disables play/pause and says "Couldn't load this song". `onplayerror` retries on Howler's `unlock`, for the mobile autoplay lock.

## Identity, seats and avatars

- **`lib/player/identity.ts` owns the identity keys:** `pixmaler:clientId`, `pixmaler:name`, `pixmaler:shape`, `pixmaler:secrets` (seat secrets per room, pruned after 48 h). `getName()` never mints, so loading a room URL can't create a player.
- **`clientId` is minted only on the room route** (in `useRoom`), so an Entry or Paint visit creates no device id and Clear isn't undone by a fresh one.
- **Clear my data** `askConfirm`s (warning that it leaves a live game when in a room), runs `clearAllData()` over every `pixmaler:*` key — identity and preferences — and navigates to Entry, closing any socket. `AlertDialog` is mounted at `App.vue`'s root on every route so this works anywhere.
- **A seat is the player's index in `state.players`**, which is join order and stable: a close only flips `connected` (the `[offline]` row), and the sole removal is `handleRemove` — GM, offline player, LOBBY-only — because a splice re-colours every seat below the gap. So **shape and name, not colour, are the identity that follows a player**. Don't key seats on a `clientId` hash (adjacent players would collide on similar colours); `buildState` must not sort `players`, and callers take the index before sorting for display.
- **`seatFor(seat, player)`** (`lib/player/seats.ts`) is the only way to make a chip (colour var, initial, face seed, shape, lean). It takes the player, not loose fields, so nobody passes a `RankedResult` (a name but no shape). `Results.vue` takes `:players` only to resolve seats.
- **Avatar shape is client-chosen, server-validated.** Stored per browser, sent with `join` and `shape`, echoed on `Player.shape`. `normaliseShape()` (`src/lib/protocol/types.ts`) is the single validator — run by `parseClientMsg`, `getShape()` and again in `seatFor`, since inbound `state` is assigned verbatim and the deploy targets can be out of step.
- **Shape and name lock outside LOBBY** so the RESULTS reveal stays honest. The shape lock needs `handleShape`'s phase gate **and** `handleJoin`'s, because `join` re-reads localStorage on every reconnect and would otherwise walk past it.
- **Face:** DiceBear `notionists-neutral`, rendered locally by `lib/player/face.ts`, seeded by `clientId`, memoised per seed. The first `Avatar` lazy-loads `@dicebear/core` + the style (pre-bundled via `optimizeDeps` so Vite doesn't re-optimise mid-session), and Paint loads it on open for its share card; until then, or on failure, the chip shows the initial. The share card never loads it itself, so a click is never held up. **Never call DiceBear's HTTP API** — it would ship identifiers to a third party. The `clientId` seed survives renames and needs no protocol change; the trade is no re-roll, and a new device or Clear means a new face. Mask rendering is in [`design-system.md`](./design-system.md).

## Rooms: creation and refusals

- **Created only by explicit intent.** `handleJoin` refuses a new player on an *empty* room unless the join has `create: true` and the name passes `isRoomCode`, so a typo, guess or dead link gets `no-such-room`, not a room with the visitor as GM. Reconnects and joins to a live room pass.
- **Create intent rides the URL** (`?room=…&create=1`, from Entry's `roomHref(wordPair(), { create: true })`). **`useRoom` strips it in `connect()`, not on arrival:** Entry asks no name, so a first-time GM may sit on the name gate with no room yet, and a reload or tab discard there must still create. `joinCreate` is then spent on the first accepted `state`, so a later reconnect never re-creates a wiped room.
- **Existence probe.** The DO's `onRequest` returns `{ exists: players.size > 0 }` (CORS-open, `no-store`). `roomExists()` runs it before a *join* so a dead code shows `NoSuchRoom` without a socket; it fails open (3 s timeout), with the server's refusal as backstop. Entry's `JoinForm` runs it after an `isRoomCode` check and shows a miss inline (field disabled, Join `aria-busy`), so the 404 screen is mostly reached by shared links. `formatRoomInput` normalises case, spaces and pasted links down to their `room` param, so a pasted `create=1` can't ride along.
- **Refusals** — `RoomFull` (`MAX_PLAYERS` = 16), `NoSuchRoom`, `SessionClosed`, `DuplicateTab` — and `NameGate` render through `RoomInterstitial`; `App.vue` checks the terminal flags first.

## Server and its tests

[`party/README.md`](../party/README.md) covers the module map, wire protocol and trust boundary, phase machine and alarm, in-memory state, guards, config vars and deploying.

- **`test/smoke.test.ts` is the full-loop guard.** `playFullRound` (`test/support/round.ts`) walks constructed frames through the real handlers and the injected `LifecycleClock` — LOBBY → DRAWING → VOTING → RESULTS → LOBBY — asserting the broadcasts, catching changes to the path's *shape* (a phase that stops transitioning, a gallery leaking a name, a reset dropping players) that per-slice suites miss.
- **Any `party/` change runs it**, updating it only when the path shape genuinely changes, never to pin broken behaviour. It's DOM-free with no real timers, so CI's `pnpm test` covers it. `playFullRound(h, { stopAfter })` fast-forwards other suites; a flow earns a smoke test only if it changes the path shape.
