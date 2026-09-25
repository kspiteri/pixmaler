# pixmaler

A real-time pixel-art party game.

> **Deployed and playable.** Lobby → Drawing → Voting → Results → Play again all work end-to-end, with a dark "party game" visual theme and two-category voting. The frontend is on GitHub Pages and the realtime server is live on Cloudflare Workers. A round of playtest hardening landed 2026-08-23 — GM round/session controls, unique player names, and proper resolutions for the rounds where nobody draws or nobody votes. The **visual personality pass** has since landed its biggest pieces — an asymmetric, framed entry screen, a legible pixel-grid backdrop, and a more flexible drawing palette. The **server hardening** batch has landed too — a 16-player room cap, display-name sanitising, room-creation gating (a mistyped or dead code lands on a 404 rather than conjuring a room), GM removal of offline players, and per-connection rate limiting. What's left is sound and a few deferred engineering pieces.

## What it does

A game master uploads any image. It's quantised in the browser into chunky, limited-palette pixel art — that's the **target**. Everyone in the room then races a countdown to redraw the target by hand on a matching pixel canvas, using only the swatch of allowed colours. No eraser: you paint over your mistakes. When the timer runs out, every drawing is shown side-by-side and **anonymous**, and the room votes in two categories — 😂 **funniest** and ⭐ **best**. Then the chaotic reveal: an **overall winner** (most votes across both categories), with everyone else ranked behind in a gallery.

- **Memorable room codes** — join a game with a word-pair eg: `feral-crayon`
- **Two-category voting** — vote 😂 funniest and ⭐ best on the anonymised, per-client-shuffled gallery; the GM watches a live "X of Y voted" tally and ends the round when ready. Results rank by overall points (chaotic — a drawing 2nd in everything can pip a category winner). A generous server-side deadline backstops the phase so an absent GM can't strand the room; it surfaces to players only in the final 30 seconds.
- **Server-authoritative** — phase, timer, submissions, and vote tallying all live on the server. No Cheating!
- **Blind reveal** — nobody sees anyone else's drawing until voting; during the round you only see a live "X of Y finished" tally, and vote *targets* stay hidden until the reveal.
- **Reconnect-safe** — drop and rejoin with the same identity; your slot (and your votes) survive. The original GM reclaims their role on re-connect; if absent, the longest-present player is auto-promoted. The GM can also explicitly transfer the role.
- **GM round and session controls** — cancel a round in flight and send everyone back to the lobby (for when the target renders broken), or end the session outright from the lobby or results, which closes the room for everyone and releases the code. Both confirm first.
- **No duplicate names** — names are unique per room, compared ignoring case and whitespace. A collision gets an adjective in front of it, in the same shape as the room code: a second `Keith` becomes `angry-Keith`. Your device keeps the plain name for the next room.
- **The original wins** — a round where nobody drew, or where nobody voted, doesn't fake a winner. The target image takes the hero card ("nobody drew — the original wins") and the whole field drops into the gallery. A round with no drawings skips voting entirely rather than parking everyone on an empty screen.
- **Cross-canvas hover marker** — hovering your canvas lights up a marker on the reference and highlights the matching swatch, so you don't have to squint at six near-identical browns.
- **A palette that stays out of the way** — the reference image tucks into the palette panel and collapses when you don't need it; the panel docks to the side or floats over the canvas, sizes S / M / L, and remembers how you left it.
- **Exact palettes, any raster upload** — the colour count is the whole swatch, not a request: ask for 24 and the room paints with 24, topped up from a ramp of classic colours when the image itself can't supply that many. An upload carrying transparency is flattened onto a background you choose first, so a logo's empty page stops merging into its own dark ink. A vector or a non-image is refused up front, in words, instead of failing behind a preview that looked fine.
- **Music and sound** — the GM picks a per-round soundtrack (royalty-free chiptune that fades in when drawing starts and carries through the reveal), and the UI has subtle sound effects. Music, effects and the countdown tick are three independent per-device toggles, all off-friendly.
- **Solo paint sandbox** — the [`/paint`](#paint-sandbox) route opens a single-player canvas with the same pipeline; useful for testing brushes and palettes, or just goofing around.

## Stack

- Vite + Vue 3 (Composition API, `<script setup>`) + TypeScript, canvas-based drawing
- [PartyServer](https://github.com/cloudflare/partyserver) on Cloudflare Durable Objects for realtime rooms, deployed with `wrangler` — see [`party/README.md`](./party/README.md) for the server guide
- `partysocket` WebSocket client (auto-reconnect)
- [Howler.js](https://howlerjs.com/) for audio — one preloaded sprite for zero-latency sound effects, streamed per-track music, per-device mute toggles
- `unique-names-generator` for memorable room codes and for de-duplicating player names, both from a custom curated word list
- Client-side image pipeline: flatten onto an opaque background, one exact downscale to the grid, median-cut palette derivation + near-duplicate merge, then per-cell quantisation. No dependencies, no server image processing, no image storage.

## Setup

```bash
pnpm install
pnpm dev        # Vite frontend on :7965
pnpm wr:dev     # realtime server on :1999 (separate terminal)
```

Both are needed to play; the `/paint` sandbox needs only `pnpm dev`. Set `VITE_PARTYKIT_HOST` so the client can find the server — `127.0.0.1:1999` in dev (already in the gitignored `.env.local`). See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full developer guide — tooling, conventions, and deploy.

## Paint sandbox

`/pixmaler/paint` opens a solo canvas — pick a sample (Mona Lisa / The Scream / Pearl Earring) or upload your own image, tweak the scale and colour count (and, if the upload has transparency, what shows through behind it), then paint. No lobby, no timer, no socket. Linked from the entry screen.

## Licences

Third-party assets are recorded in [`LICENSE.md`](./LICENSE.md): the background music (Kevin MacLeod, **CC-BY 4.0**), the self-hosted fonts (**SIL OFL 1.1**) and the bundled dependencies (MIT/ISC). The music credit is also shown in-app, under **Credits** in the settings menu — CC-BY requires a visible attribution.
